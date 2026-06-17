import { Prisma, type GeneratedCoverLetter, type JobMatchStatus } from "@prisma/client";
import { prepareApplicationPackage } from "@/lib/applications/prepare-package";
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

type CoverLetterForRepair = GeneratedCoverLetter & {
  jobPosting: { id: string; company: string; title: string; applicationUrl: string | null };
  applications: Array<{ id: string; status: JobMatchStatus; notes: string | null }>;
};

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
