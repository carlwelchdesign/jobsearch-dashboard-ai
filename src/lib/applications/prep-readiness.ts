import { assessApplicationUrlQuality, type ApplicationUrlQuality } from "@/lib/applications/application-url-quality";
import { applicationMaterialQualityDetail, type ApplicationMaterialQuality } from "@/lib/applications/material-quality";

export type ApplicationPrepReadinessKind = "ready_to_move" | "needs_materials" | "material_blocked" | "no_direct_url";

export type ApplicationPrepReadiness = {
  kind: ApplicationPrepReadinessKind;
  reason: string;
  applicationUrlQuality: ApplicationUrlQuality;
  materialQuality: ApplicationMaterialQuality | null;
};

export type ApplicationPrepReadinessInput = {
  resumeId?: string | null;
  coverLetterId?: string | null;
  coverLetter?: { generationNotes?: unknown } | null;
  jobPosting: { applicationUrl?: string | null };
};

export function classifyApplicationPrepReadiness(application: ApplicationPrepReadinessInput): ApplicationPrepReadiness {
  const applicationUrlQuality = assessApplicationUrlQuality(application.jobPosting.applicationUrl);
  if (!applicationUrlQuality.launchable) {
    return {
      kind: "no_direct_url",
      reason: applicationUrlQuality.reason,
      applicationUrlQuality,
      materialQuality: null,
    };
  }

  if (!application.resumeId || !application.coverLetterId) {
    return {
      kind: "needs_materials",
      reason: "Generate a tailored resume and cover letter before moving to Ready to apply.",
      applicationUrlQuality,
      materialQuality: null,
    };
  }

  const materialQuality = applicationMaterialQualityDetail(application.coverLetter?.generationNotes);
  return {
    kind: "ready_to_move",
    reason: materialQuality.launchable
      ? "Direct URL and generated materials are ready."
      : `Direct URL and generated materials are ready. Material QA advisory: ${materialQuality.reason}`,
    applicationUrlQuality,
    materialQuality,
  };
}
