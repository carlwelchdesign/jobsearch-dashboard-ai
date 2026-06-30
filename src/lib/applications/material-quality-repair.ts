import { Prisma, type GeneratedCoverLetter, type JobMatchStatus } from "@prisma/client";
import { assessApplicationUrlQuality } from "@/lib/applications/application-url-quality";
import { prepareApplicationPackage, type PrepareApplicationRepairContext } from "@/lib/applications/prepare-package";
import { syncApplicationPacket } from "@/lib/applications/application-packets";
import {
  applicationMaterialQualityFromNotes,
  buildApplicationMaterialQuality,
  fallbackCoverLetterSignals,
  materialQualityJson,
  type ApplicationMaterialQuality,
} from "@/lib/applications/material-quality";
import { transitionApplicationState } from "@/lib/applications/state-transitions";
import { prisma } from "@/lib/prisma";
import { syncMaterialClaimsForCoverLetter } from "@/lib/trust/material-claims";

export type ApplicationMaterialRepairMode = "dry-run" | "apply";

export type ApplicationMaterialRepairResult = {
  mode: ApplicationMaterialRepairMode;
  regenerate: boolean;
  scanned: number;
  updated: number;
  blocked: number;
  passed: number;
  applicationsMoved: number;
  regenerated: number;
  failed: number;
  samples: Array<{
    coverLetterId: string;
    company: string;
    title: string;
    status: ApplicationMaterialQuality["status"];
    launchable: boolean;
    reason: string;
    readyApplications: number;
  }>;
  errors: Array<{ coverLetterId: string; error: string }>;
};

export type ApplicationMaterialIssueRepairResult = {
  applicationId: string;
  jobPostingId: string;
  status: "repaired" | "blocked" | "failed";
  attemptedRepair: boolean;
  movedToReady: boolean;
  resumeId: string | null;
  coverLetterId: string | null;
  previousMaterialQuality?: ApplicationMaterialQuality | null;
  materialQuality: ApplicationMaterialQuality | null;
  remainingReasons?: string[];
  remainingUnsupportedClaims?: string[];
  reason: string;
  recommendation: string;
};

type CoverLetterForRepair = GeneratedCoverLetter & {
  jobPosting: { id: string; company: string; title: string; applicationUrl: string | null };
  applications: Array<{ id: string; status: JobMatchStatus; notes: string | null }>;
};

export async function repairApplicationMaterialIssue(applicationId: string): Promise<ApplicationMaterialIssueRepairResult> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      coverLetter: { select: { id: true, generationNotes: true } },
      resume: { select: { id: true } },
      jobPosting: { select: { id: true, company: true, title: true, applicationUrl: true } },
    },
  });
  if (!application) throw new Error("Application not found.");

  const applicationUrlQuality = assessApplicationUrlQuality(application.jobPosting.applicationUrl);
  if (!applicationUrlQuality.launchable) {
    return recordApplicationMaterialRepairEvent({
      applicationId: application.id,
      jobPostingId: application.jobPostingId,
      status: "blocked",
      attemptedRepair: false,
      movedToReady: false,
      resumeId: application.resumeId,
      coverLetterId: application.coverLetterId,
      previousMaterialQuality: application.coverLetter ? applicationMaterialQualityFromNotes(application.coverLetter.generationNotes) : null,
      materialQuality: application.coverLetter ? applicationMaterialQualityFromNotes(application.coverLetter.generationNotes) : null,
      reason: applicationUrlQuality.reason,
      recommendation: "Add a direct employer or ATS application URL before agents repair materials.",
    });
  }

  const currentQuality = application.coverLetter
    ? applicationMaterialQualityFromNotes(application.coverLetter.generationNotes)
    : null;
  if (currentQuality?.launchable) {
    await transitionApplicationState({
      applicationId: application.id,
      toStatus: "ready_to_apply",
      source: "application_material_issue_repair_existing_pass",
      actor: { type: "agent" },
      reason: "Existing application materials already pass quality review.",
      metadata: {
        materialQuality: currentQuality,
        manualSubmissionRequired: true,
      },
      sideEffects: { syncPacket: true },
    });
    return recordApplicationMaterialRepairEvent({
      applicationId: application.id,
      jobPostingId: application.jobPostingId,
      status: "repaired",
      attemptedRepair: false,
      movedToReady: true,
      resumeId: application.resumeId,
      coverLetterId: application.coverLetterId,
      previousMaterialQuality: currentQuality,
      materialQuality: currentQuality,
      reason: "Existing materials already pass quality review.",
      recommendation: "Application is ready to apply.",
    });
  }

  const unfixable = currentQuality ? unfixableRepairReason(currentQuality) : null;
  if (unfixable) {
    return recordApplicationMaterialRepairEvent({
      applicationId: application.id,
      jobPostingId: application.jobPostingId,
      status: "blocked",
      attemptedRepair: false,
      movedToReady: false,
      resumeId: application.resumeId,
      coverLetterId: application.coverLetterId,
      previousMaterialQuality: currentQuality,
      materialQuality: currentQuality,
      reason: currentQuality?.reason ?? "Application material quality needs review.",
      recommendation: unfixable,
    });
  }

  try {
    const regenerateResume = shouldRepairResume(currentQuality);
    const repairContext = buildRepairContext(currentQuality);
    const repaired = await prepareApplicationPackage(application.jobPostingId, {
      regenerateResume,
      regenerateCoverLetter: true,
      repairContext,
    });
    const remainingUnsupportedClaims = unsupportedClaimsFromCoverLetterNotes(repaired.coverLetter.generationNotes);
    const result: ApplicationMaterialIssueRepairResult = {
      applicationId: repaired.application.id,
      jobPostingId: application.jobPostingId,
      status: repaired.readyToApply ? "repaired" : "blocked",
      attemptedRepair: true,
      movedToReady: Boolean(repaired.readyToApply),
      resumeId: repaired.resume.id,
      coverLetterId: repaired.coverLetter.id,
      previousMaterialQuality: currentQuality,
      materialQuality: repaired.materialQuality,
      remainingReasons: repaired.materialQuality.reasons,
      remainingUnsupportedClaims,
      reason: repaired.readyToApply
        ? "Agents repaired the application materials and moved this application to Ready to apply."
        : repaired.materialQuality.reason,
      recommendation: repaired.readyToApply
        ? "Open this application in Apply Sprint."
        : repairRecommendation(repaired.materialQuality),
    };
    await recordApplicationMaterialRepairEvent(result);
    return result;
  } catch (error) {
    const result: ApplicationMaterialIssueRepairResult = {
      applicationId: application.id,
      jobPostingId: application.jobPostingId,
      status: "failed",
      attemptedRepair: true,
      movedToReady: false,
      resumeId: application.resumeId,
      coverLetterId: application.coverLetterId,
      previousMaterialQuality: currentQuality,
      materialQuality: currentQuality,
      remainingReasons: currentQuality?.reasons ?? [],
      reason: error instanceof Error ? error.message : "Unknown material repair failure",
      recommendation: "Retry after checking provider settings and application material evidence.",
    };
    await recordApplicationMaterialRepairEvent(result);
    return result;
  }
}

export async function repairApplicationMaterials(input: {
  mode?: ApplicationMaterialRepairMode;
  regenerate?: boolean;
  limit?: number;
} = {}): Promise<ApplicationMaterialRepairResult> {
  const mode = input.mode ?? "dry-run";
  const regenerate = Boolean(input.regenerate);
  const coverLetters = await prisma.generatedCoverLetter.findMany({
    include: {
      applications: { select: { id: true, status: true, notes: true } },
      jobPosting: { select: { id: true, company: true, title: true, applicationUrl: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: input.limit ? Math.min(Math.max(input.limit, 1), 1000) : 1000,
  });

  const result: ApplicationMaterialRepairResult = {
    mode,
    regenerate,
    scanned: coverLetters.length,
    updated: 0,
    blocked: 0,
    passed: 0,
    applicationsMoved: 0,
    regenerated: 0,
    failed: 0,
    samples: [],
    errors: [],
  };

  for (const coverLetter of coverLetters as CoverLetterForRepair[]) {
    try {
      const quality = qualityForRepair(coverLetter);
      if (quality.status === "PASS") result.passed += 1;
      else result.blocked += 1;

      const existing = applicationMaterialQualityFromNotes(coverLetter.generationNotes);
      const needsUpdate = !existing || existing.launchable !== quality.launchable || existing.status !== quality.status || existing.reason !== quality.reason;
      if (needsUpdate) result.updated += 1;
      if (result.samples.length < 12 && (!quality.launchable || needsUpdate)) {
        result.samples.push({
          coverLetterId: coverLetter.id,
          company: coverLetter.jobPosting.company,
          title: coverLetter.jobPosting.title,
          status: quality.status,
          launchable: quality.launchable,
          reason: quality.reason,
          readyApplications: coverLetter.applications.filter((application) => application.status === "ready_to_apply").length,
        });
      }
      if (mode === "dry-run") continue;

      if (needsUpdate) {
        await prisma.generatedCoverLetter.update({
          where: { id: coverLetter.id },
          data: {
            generationNotes: {
              ...jsonObject(coverLetter.generationNotes),
              materialQuality: materialQualityJson(quality),
              materialQualityRepair: {
                repairedAt: new Date().toISOString(),
                source: "application_material_quality_repair",
                previousMaterialQuality: existing,
              },
            } as Prisma.InputJsonValue,
          },
        });
        await syncMaterialClaimsForCoverLetter(coverLetter.id);
      }

      for (const application of coverLetter.applications.filter((application) => application.status === "ready_to_apply" && !quality.launchable)) {
        await transitionApplicationState({
          applicationId: application.id,
          toStatus: "approved",
          source: "application_material_quality_repair",
          actor: { type: "repair" },
          reason: "Application material quality needs review before Apply Sprint.",
          note: repairNote(application.notes, quality),
          metadata: {
            coverLetterId: coverLetter.id,
            materialQuality: quality,
          },
          sideEffects: { syncPacket: false },
        });
        await syncApplicationPacket(application.id);
        result.applicationsMoved += 1;
      }

      if (regenerate && !quality.launchable && coverLetter.jobPosting.applicationUrl) {
        const regenerated = await prepareApplicationPackage(coverLetter.jobPosting.id, { regenerateCoverLetter: true });
        if (regenerated.coverLetter.id !== coverLetter.id) result.regenerated += 1;
      }
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        coverLetterId: coverLetter.id,
        error: error instanceof Error ? error.message : "Unknown material repair failure",
      });
    }
  }

  return result;
}

function qualityForRepair(coverLetter: CoverLetterForRepair): ApplicationMaterialQuality {
  const notes = jsonObject(coverLetter.generationNotes);
  const existing = applicationMaterialQualityFromNotes(notes);
  if (existing) return existing;
  const generatedBy = stringValue(notes.generatedBy) || "unknown";
  const qa = jsonObject(notes.applicationQa);
  const qaStatus = stringValue(qa.status);
  const qaScore = typeof qa.score === "number" ? qa.score : null;
  const signals = fallbackCoverLetterSignals(coverLetter.body);
  const cleanLegacyStructuredOutput = generatedBy === "openai_structured_outputs"
    && qaStatus === "PASS"
    && (qaScore === null || qaScore >= 85)
    && signals.length === 0
    && !stringArray(qa.unsupportedClaims).length
    && !stringArray(qa.styleViolations).length;

  if (cleanLegacyStructuredOutput) {
    return {
      status: "PASS",
      launchable: true,
      reason: "Legacy structured cover letter passed existing QA and has no fallback material signals.",
      reasons: [],
      score: qaScore ?? 85,
      generatedBy,
      evidenceRefs: stringArray(qa.evidenceRefs),
      review: null,
    };
  }

  return buildApplicationMaterialQuality({
    body: coverLetter.body,
    generatedBy,
    evidencePlan: objectWithStringStatus(notes.applicationEvidencePlan) as never,
    hiringManagerReview: objectWithStringStatus(notes.hiringManagerReview) as never,
    applicationQa: qa,
  });
}

function repairNote(existing: string | null, quality: ApplicationMaterialQuality) {
  const note = `Application moved back to approved by material quality repair: ${quality.reason}`;
  if (!existing) return note;
  return existing.includes(note) ? existing : `${existing}\n${note}`;
}

async function recordApplicationMaterialRepairEvent(result: ApplicationMaterialIssueRepairResult) {
  await prisma.applicationEvent.create({
    data: {
      applicationId: result.applicationId,
      type: "note_added",
      source: "application_material_issue_repair",
      actorType: "agent",
      payload: {
        status: result.status,
        attemptedRepair: result.attemptedRepair,
        movedToReady: result.movedToReady,
        jobPostingId: result.jobPostingId,
        resumeId: result.resumeId,
        coverLetterId: result.coverLetterId,
        previousMaterialQuality: result.previousMaterialQuality ?? null,
        newMaterialQuality: result.materialQuality,
        materialQuality: result.materialQuality,
        remainingReasons: result.remainingReasons ?? result.materialQuality?.reasons ?? [],
        remainingUnsupportedClaims: result.remainingUnsupportedClaims ?? [],
        reason: result.reason,
        recommendation: result.recommendation,
        manualSubmissionRequired: true,
      } as Prisma.InputJsonValue,
    },
  }).catch(() => null);
  if (result.coverLetterId) {
    await syncMaterialClaimsForCoverLetter(result.coverLetterId).catch(() => null);
  }
  await syncApplicationPacket(result.applicationId).catch(() => null);
  return result;
}

function unfixableRepairReason(quality: ApplicationMaterialQuality) {
  if (quality.reasons.includes("openai_insufficient_quota")) {
    return "OpenAI quota is exhausted. Agents cannot repair this until provider quota is restored.";
  }
  if (quality.reasons.includes("openai_not_configured")) {
    return "OpenAI is not configured. Configure the provider before agents can repair these materials.";
  }
  if (quality.reasons.includes("openai_authentication_failed") || quality.reasons.includes("openai_permission_denied")) {
    return "OpenAI authentication or permissions blocked material generation. Fix provider credentials before retrying.";
  }
  return null;
}

function shouldRepairResume(quality: ApplicationMaterialQuality | null) {
  if (!quality) return true;
  return quality.reasons.some((reason) => reason.includes("ats_resume") || reason.includes("resume"));
}

function repairRecommendation(quality: ApplicationMaterialQuality) {
  if (quality.reasons.includes("openai_rate_limited")) return "Retry after the rate limit clears.";
  if (quality.reasons.includes("openai_timeout")) return "Retry the agent repair; the previous model call timed out.";
  if (quality.reasons.includes("unsupported_claims_detected")) return "Agents rewrote from verified evidence, but Application QA still found unsupported claims. Review the remaining QA findings or add stronger evidence.";
  if (quality.reasons.includes("hiring_manager_needs_review")) return "Agents rewrote the letter, but hiring-manager review still needs stronger role-specific evidence.";
  if (quality.reasons.includes("application_qa_needs_review")) return "Agents rewrote and rechecked the materials, but Application QA still needs cleaner evidence or wording.";
  if (quality.reasons.includes("style_violations_detected")) return "Agents attempted a rewrite, but style issues remain.";
  return quality.reason;
}

function buildRepairContext(quality: ApplicationMaterialQuality | null): PrepareApplicationRepairContext {
  return {
    reasons: quality?.reasons ?? ["missing_material_quality_review"],
    previousMaterialQuality: quality,
    instructions: repairInstructionsForQuality(quality),
  };
}

function repairInstructionsForQuality(quality: ApplicationMaterialQuality | null) {
  if (!quality) return ["Run full material repair because no prior material-quality review was found."];
  const instructions: string[] = [];
  if (quality.reason) instructions.push(`Previous blocker: ${quality.reason}`);
  if (quality.reasons.includes("unsupported_claims_detected")) {
    instructions.push("Eliminate unsupported claims rather than trying to justify them. Use only claims traceable to verified bullets, selected projects, GitHub repositories, the tailored resume, or the evidence plan.");
  }
  if (quality.review?.rewriteInstructions) {
    instructions.push(`Hiring-manager reviewer rewrite guidance: ${quality.review.rewriteInstructions}`);
  }
  return instructions;
}

function unsupportedClaimsFromCoverLetterNotes(notes: unknown) {
  const object = jsonObject(notes);
  const qa = jsonObject(object.applicationQa);
  return stringArray(qa.unsupportedClaims);
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function objectWithStringStatus(value: unknown): Record<string, unknown> | null {
  const object = jsonObject(value);
  return typeof object.status === "string" ? object : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}
