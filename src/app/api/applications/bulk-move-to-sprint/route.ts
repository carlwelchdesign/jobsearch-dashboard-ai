import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { runApplicationQaAgent } from "@/lib/agents/application-qa";
import { runHiringManagerReviewerAgent } from "@/lib/agents/hiring-manager-reviewer";
import { apiError } from "@/lib/api";
import { prepareApplicationPackage } from "@/lib/applications/prepare-package";
import { syncApplicationPacket } from "@/lib/applications/application-packets";
import { classifyApplicationPrepReadiness, type ApplicationPrepReadiness } from "@/lib/applications/prep-readiness";
import {
  applicationMaterialQualityDetail,
  buildApplicationMaterialQuality,
  materialQualityJson,
  type ApplicationEvidencePlan,
  type ApplicationMaterialQuality,
  type HiringManagerMaterialReview,
} from "@/lib/applications/material-quality";
import { reconcileApplicationCanonicalState } from "@/lib/applications/reconciliation";
import { transitionApplicationState } from "@/lib/applications/state-transitions";
import { prisma } from "@/lib/prisma";
import { syncMaterialClaimsForCoverLetter } from "@/lib/trust/material-claims";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  limit: z.number().int().min(1).max(250).default(25),
  regenerateBlockedMaterials: z.boolean().default(true),
});

const movableStatuses = ["approved", "resume_generated", "cover_letter_generated"] as const;
type BulkMoveAction = "moved" | "prepared" | "archived_no_direct_url" | "material_blocked" | "failed";

export async function POST(request: Request) {
  try {
    const body = request.headers.get("content-type")?.includes("application/json") ? await request.json() : {};
    const input = requestSchema.parse(body);
    const applications = await loadApplicationsForBulkMove(input.limit);
    const classified = applications.map((application) => ({
      application,
      readiness: classifyApplicationPrepReadiness(application),
    }));
    const noDirectUrlApplications = classified.filter((item) => item.readiness.kind === "no_direct_url");
    const readyToMoveApplications = classified.filter((item) => item.readiness.kind === "ready_to_move");
    const needsMaterialsApplications = classified.filter((item) => item.readiness.kind === "needs_materials");
    const materialBlockedApplications = classified.filter((item) => item.readiness.kind === "material_blocked");
    const directApplications = [
      ...readyToMoveApplications,
      ...needsMaterialsApplications,
    ].slice(0, input.limit);

    const results: Array<{
      ok: boolean;
      applicationId: string;
      jobId: string;
      company: string;
      title: string;
      action: BulkMoveAction;
      regeneratedCoverLetter?: boolean;
      reassessedMaterialQuality?: boolean;
      materialQuality?: ApplicationMaterialQuality;
      readiness?: ApplicationPrepReadiness["kind"];
      reason?: string;
      error?: string;
    }> = [];

    for (const { application, readiness } of noDirectUrlApplications) {
      try {
        await archiveNoDirectUrlApplication(application, readiness);
        results.push({
          ok: true,
          applicationId: application.id,
          jobId: application.jobPostingId,
          company: application.jobPosting.company,
          title: application.jobPosting.title,
          action: "archived_no_direct_url",
          readiness: readiness.kind,
          reason: readiness.reason,
        });
      } catch (error) {
        results.push({
          ok: false,
          applicationId: application.id,
          jobId: application.jobPostingId,
          company: application.jobPosting.company,
          title: application.jobPosting.title,
          action: "failed",
          readiness: readiness.kind,
          reason: readiness.reason,
          error: error instanceof Error ? error.message : "Unknown no-direct-URL archive failure",
        });
      }
    }

    for (const { application } of materialBlockedApplications) {
      const materialQuality = applicationMaterialQualityDetail(application.coverLetter?.generationNotes);
      results.push({
        ok: false,
        applicationId: application.id,
        jobId: application.jobPostingId,
        company: application.jobPosting.company,
        title: application.jobPosting.title,
        action: "material_blocked",
        readiness: "material_blocked",
        materialQuality,
        reason: materialQuality.reason,
        error: `material_quality_needs_review: ${materialQuality.reason}`,
      });
    }

    for (const { application } of directApplications) {
      try {
        if (application.resumeId && application.coverLetterId) {
          let materialQuality = applicationMaterialQualityDetail(application.coverLetter?.generationNotes);
          if (!materialQuality.launchable) {
            const reassessedMaterialQuality = await reassessExistingApplicationMaterials(application, materialQuality);
            if (reassessedMaterialQuality) {
              materialQuality = reassessedMaterialQuality;
              if (materialQuality.launchable) {
                await moveApplicationToSprint(application, materialQuality);
                results.push({
                  ok: true,
                  applicationId: application.id,
                  jobId: application.jobPostingId,
                  company: application.jobPosting.company,
                  title: application.jobPosting.title,
                  action: "moved",
                  reassessedMaterialQuality: true,
                  materialQuality,
                });
                continue;
              }
            }
            if (!input.regenerateBlockedMaterials) {
              results.push({
                ok: false,
                applicationId: application.id,
                jobId: application.jobPostingId,
                company: application.jobPosting.company,
                title: application.jobPosting.title,
                action: "material_blocked",
                readiness: "material_blocked",
                materialQuality,
                reason: materialQuality.reason,
                error: `material_quality_needs_review: ${materialQuality.reason}`,
              });
              continue;
            }
            const prepared = await prepareApplicationPackage(application.jobPostingId, { regenerateCoverLetter: true });
            if (prepared.readyToApply === false) {
              results.push({
                ok: false,
                applicationId: prepared.application.id,
                jobId: application.jobPostingId,
                company: application.jobPosting.company,
                title: application.jobPosting.title,
                action: "material_blocked",
                readiness: "material_blocked",
                regeneratedCoverLetter: true,
                materialQuality: prepared.materialQuality,
                reason: prepared.materialQuality.reason,
                error: `material_quality_needs_review: ${prepared.materialQuality.reason}`,
              });
              continue;
            }
            results.push({
              ok: true,
              applicationId: prepared.application.id,
              jobId: application.jobPostingId,
              company: application.jobPosting.company,
              title: application.jobPosting.title,
              action: "prepared",
              regeneratedCoverLetter: true,
            });
            continue;
          }
          await moveApplicationToSprint(application, materialQuality);
          results.push({
            ok: true,
            applicationId: application.id,
            jobId: application.jobPostingId,
            company: application.jobPosting.company,
            title: application.jobPosting.title,
            action: "moved",
          });
          continue;
        }

        if (!input.regenerateBlockedMaterials) {
          results.push({
            ok: false,
            applicationId: application.id,
            jobId: application.jobPostingId,
            company: application.jobPosting.company,
            title: application.jobPosting.title,
            action: "failed",
            readiness: "needs_materials",
            reason: "Generate application materials before moving to Ready to apply.",
            error: "missing_resume_or_cover_letter: Generate application materials before moving to Apply Sprint.",
          });
          continue;
        }
        const prepared = await prepareApplicationPackage(application.jobPostingId);
        if (prepared.readyToApply === false) {
          results.push({
            ok: false,
            applicationId: prepared.application.id,
            jobId: application.jobPostingId,
            company: application.jobPosting.company,
            title: application.jobPosting.title,
            action: "material_blocked",
            readiness: "material_blocked",
            materialQuality: prepared.materialQuality,
            reason: prepared.materialQuality.reason,
            error: `material_quality_needs_review: ${prepared.materialQuality.reason}`,
          });
          continue;
        }
        results.push({
          ok: true,
          applicationId: prepared.application.id,
          jobId: application.jobPostingId,
          company: application.jobPosting.company,
          title: application.jobPosting.title,
          action: "prepared",
        });
      } catch (error) {
        results.push({
          ok: false,
          applicationId: application.id,
          jobId: application.jobPostingId,
          company: application.jobPosting.company,
          title: application.jobPosting.title,
          action: "failed",
          reason: error instanceof Error ? error.message : "Unknown Apply Sprint move failure",
          error: error instanceof Error ? error.message : "Unknown Apply Sprint move failure",
        });
      }
    }

    await reconcileApplicationCanonicalState({ source: "bulk_move_to_apply_sprint" }).catch(() => null);

    const moved = results.filter((result) => result.ok && result.action === "moved").length;
    const prepared = results.filter((result) => result.ok && result.action === "prepared").length;
    const archivedNoDirectUrl = results.filter((result) => result.ok && result.action === "archived_no_direct_url").length;
    const regenerated = results.filter((result) => result.ok && result.regeneratedCoverLetter).length;
    const reassessed = results.filter((result) => result.ok && result.reassessedMaterialQuality).length;
    const failed = results.filter((result) => !result.ok && result.action !== "material_blocked").length;
    const quotaBlocked = results.filter((result) => result.materialQuality?.reasons.includes("openai_insufficient_quota")).length;
    const materialBlocked = results.filter((result) => result.action === "material_blocked" || result.materialQuality?.reasons.includes("deterministic_fallback") || result.materialQuality?.reasons.includes("material_quality_needs_review") || result.error?.startsWith("material_quality_needs_review")).length;
    const remainingEligible = Math.max(0, readyToMoveApplications.length + needsMaterialsApplications.length - directApplications.length);
    const totalMoved = moved + prepared;
    const blockedExamples = results
      .filter((result) => result.action === "material_blocked" || result.action === "archived_no_direct_url" || result.action === "failed")
      .slice(0, 8)
      .map((result) => ({
        applicationId: result.applicationId,
        company: result.company,
        title: result.title,
        action: result.action,
        reason: result.reason ?? result.error ?? "Blocked.",
      }));

    return NextResponse.json({
      requested: input,
      scanned: applications.length,
      archivedNoDirectUrl,
      moved,
      prepared,
      regenerated,
      reassessed,
      failed,
      materialBlocked,
      quotaBlocked,
      remainingEligible,
      results,
      blockedExamples,
      sprintUrl: "/applications/assistant",
      message: totalMoved || archivedNoDirectUrl
        ? `Prepared ${totalMoved} application${totalMoved === 1 ? "" : "s"} for Ready to apply. Archived ${archivedNoDirectUrl} without direct URLs. ${materialBlocked} material-blocked. ${failed} failed.`
        : quotaBlocked
          ? `No applications moved into Ready to apply because OpenAI quota blocked cover-letter regeneration for ${quotaBlocked} application${quotaBlocked === 1 ? "" : "s"}.`
        : materialBlocked
          ? `No applications moved into Ready to apply because ${materialBlocked} application${materialBlocked === 1 ? "" : "s"} still need material quality review.`
        : failed
          ? `No applications moved into Ready to apply. ${failed} failed.`
          : "No approved applications are waiting to move into Ready to apply.",
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

async function loadApplicationsForBulkMove(limit: number) {
  return prisma.application.findMany({
    where: {
      status: { in: [...movableStatuses] },
    },
    include: {
      coverLetter: { select: { id: true, body: true, generationNotes: true } },
      resume: { select: { markdown: true } },
      jobPosting: { select: { id: true, company: true, title: true, applicationUrl: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: limit * 4,
  });
}

type BulkMoveApplication = Awaited<ReturnType<typeof loadApplicationsForBulkMove>>[number];

async function reassessExistingApplicationMaterials(application: BulkMoveApplication, existingQuality: ApplicationMaterialQuality) {
  if (!application.coverLetter || !application.resume) return null;
  if (existingQuality.generatedBy === "deterministic_fallback" || existingQuality.reasons.includes("deterministic_fallback") || existingQuality.generationFailure) {
    return null;
  }
  const notes = jsonObject(application.coverLetter.generationNotes);
  const evidencePlan = evidencePlanFromNotes(notes);
  const qa = await runApplicationQaAgent({
    jobPostingId: application.jobPostingId,
    userId: application.userId,
    resumeMarkdown: application.resume.markdown,
    coverLetterBody: application.coverLetter.body,
    evidenceRefs: evidenceRefsFromNotes(notes, existingQuality),
  });
  const generatedBy = stringValue(notes.generatedBy) || existingQuality.generatedBy;
  let hiringManagerReview = hiringManagerReviewFromNotes(notes) ?? existingQuality.review ?? null;
  if (!hiringManagerReview) {
    const review = await runHiringManagerReviewerAgent({
      jobPostingId: application.jobPostingId,
      userId: application.userId,
      coverLetterBody: application.coverLetter.body,
      generatedBy,
      evidencePlan,
      applicationQa: qa.output,
    });
    hiringManagerReview = review.output;
  }
  const materialQuality = buildApplicationMaterialQuality({
    body: application.coverLetter.body,
    generatedBy,
    evidencePlan,
    hiringManagerReview,
    applicationQa: qa.output,
    rewriteAttempted: typeof notes.rewriteAttempted === "boolean" ? notes.rewriteAttempted : existingQuality.rewriteAttempted,
    generationFailure: existingQuality.generationFailure,
  });
  await prisma.generatedCoverLetter.update({
    where: { id: application.coverLetter.id },
    data: {
      generationNotes: {
        ...notes,
        applicationQa: qa.output,
        hiringManagerReview,
        materialQuality: materialQualityJson(materialQuality),
        materialQualityReassessedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
  await syncMaterialClaimsForCoverLetter(application.coverLetter.id).catch(() => null);
  return materialQuality;
}

async function moveApplicationToSprint(application: BulkMoveApplication, materialQuality: ApplicationMaterialQuality) {
  await transitionApplicationState({
    applicationId: application.id,
    toStatus: "ready_to_apply",
    source: "bulk_move_to_apply_sprint",
    actor: { type: "system" },
    reason: "Bulk move prepared application for Apply Sprint.",
    note: mergeSprintNote(application.notes),
    metadata: {
      resumeId: application.resumeId,
      coverLetterId: application.coverLetterId,
      applicationUrl: application.jobPosting.applicationUrl,
      materialQuality,
      manualSubmissionRequired: true,
    },
    sideEffects: { syncPacket: false },
  });
  await syncApplicationPacket(application.id);
}

async function archiveNoDirectUrlApplication(application: BulkMoveApplication, readiness: ApplicationPrepReadiness) {
  await transitionApplicationState({
    applicationId: application.id,
    toStatus: "archived",
    source: "bulk_move_to_apply_sprint_no_direct_url",
    actor: { type: "system" },
    reason: `Archived because this application does not have a direct employer or ATS URL. ${readiness.reason}`,
    note: mergeArchiveNote(application.notes, readiness.reason),
    metadata: {
      applicationUrl: application.jobPosting.applicationUrl,
      applicationUrlQuality: readiness.applicationUrlQuality,
      manualSubmissionRequired: true,
    },
    sideEffects: { syncPacket: false },
  });
}

function mergeSprintNote(existing: string | null) {
  const note = "Moved to Apply Sprint. Review materials and submit manually.";
  if (!existing) return note;
  return existing.includes(note) ? existing : `${existing}\n${note}`;
}

function mergeArchiveNote(existing: string | null, reason: string) {
  const note = `Archived from Apply workflow: no direct application URL. ${reason}`;
  if (!existing) return note;
  return existing.includes(note) ? existing : `${existing}\n${note}`;
}

function evidenceRefsFromNotes(notes: Record<string, unknown>, existingQuality: ApplicationMaterialQuality) {
  const strategy = jsonObject(notes.resumeStrategy);
  return [
    ...stringArray(strategy.evidenceRefs),
    ...existingQuality.evidenceRefs,
  ].filter((value, index, values) => value && values.indexOf(value) === index);
}

function evidencePlanFromNotes(notes: Record<string, unknown>): ApplicationEvidencePlan | null {
  const plan = jsonObject(notes.applicationEvidencePlan);
  return Array.isArray(plan.evidenceRefs) && Array.isArray(plan.proofPoints) ? plan as unknown as ApplicationEvidencePlan : null;
}

function hiringManagerReviewFromNotes(notes: Record<string, unknown>): HiringManagerMaterialReview | null {
  const review = jsonObject(notes.hiringManagerReview);
  return typeof review.status === "string" && typeof review.score === "number" ? review as unknown as HiringManagerMaterialReview : null;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}
