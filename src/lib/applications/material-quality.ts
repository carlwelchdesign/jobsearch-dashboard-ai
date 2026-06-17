import type { Prisma } from "@prisma/client";

export const MATERIAL_QUALITY_REASON = "material_quality_needs_review";
export const MATERIAL_QUALITY_ERROR = "Application material quality needs review.";

export type ApplicationEvidenceProofPoint = {
  sourceType: "candidate_evidence" | "experience_bullet" | "project" | "github_repository" | "tailored_resume";
  sourceId: string;
  title: string;
  summary: string;
  relevance: number;
  keywords: string[];
};

export type ApplicationEvidencePlan = {
  status: "READY" | "INSUFFICIENT";
  jobSignals: string[];
  proofPoints: ApplicationEvidenceProofPoint[];
  evidenceRefs: string[];
  avoidedSignals: string[];
  warnings: string[];
  rationale: string;
  confidence: number;
};

export type HiringManagerMaterialReview = {
  status: "PASS" | "NEEDS_REVIEW" | "BLOCKED";
  score: number;
  strengths: string[];
  concerns: string[];
  missingSignals: string[];
  unsupportedClaims: string[];
  genericSignals: string[];
  rewriteRecommended: boolean;
  rewriteInstructions?: string | null;
  reasoningSummary: string;
  confidence: number;
};

export type ApplicationMaterialGenerationFailure = {
  provider: "openai" | "unknown";
  code:
    | "openai_not_configured"
    | "openai_insufficient_quota"
    | "openai_rate_limited"
    | "openai_authentication_failed"
    | "openai_permission_denied"
    | "openai_bad_request"
    | "openai_timeout"
    | "openai_structured_output_empty"
    | "openai_generation_failed"
    | "unknown_generation_failure";
  message: string;
  retryable: boolean;
};

export type ApplicationMaterialQuality = {
  status: "PASS" | "NEEDS_REVIEW" | "BLOCKED";
  launchable: boolean;
  reason: string;
  reasons: string[];
  score: number;
  generatedBy: string;
  evidenceRefs: string[];
  review?: HiringManagerMaterialReview | null;
  rewriteAttempted?: boolean;
  generationFailure?: ApplicationMaterialGenerationFailure | null;
};

type QualityInput = {
  body: string;
  generatedBy?: string | null;
  evidencePlan?: ApplicationEvidencePlan | null;
  hiringManagerReview?: HiringManagerMaterialReview | null;
  applicationQa?: Record<string, unknown> | null;
  rewriteAttempted?: boolean;
  generationFailure?: ApplicationMaterialGenerationFailure | null;
};

const PASS_SCORE = 85;
const BLOCK_SCORE = 70;

export function buildApplicationMaterialQuality(input: QualityInput): ApplicationMaterialQuality {
  const generatedBy = input.generatedBy?.trim() || "unknown";
  const review = input.hiringManagerReview ?? null;
  const qa = input.applicationQa ?? null;
  const generationFailure = input.generationFailure ?? null;
  const reasons = new Set<string>();
  const qaStatus = stringValue(qa?.status);
  const qaScore = numberValue(qa?.score);
  const unsupportedQaClaims = stringArray(qa?.unsupportedClaims);
  const styleViolations = stringArray(qa?.styleViolations);
  const fallbackSignals = fallbackCoverLetterSignals(input.body);
  const evidenceRefs = Array.from(new Set([
    ...(input.evidencePlan?.evidenceRefs ?? []),
    ...(review ? input.evidencePlan?.proofPoints.map((point) => point.sourceId) ?? [] : []),
    ...stringArray(qa?.evidenceRefs),
  ].filter(Boolean)));

  if (generatedBy === "deterministic_fallback") reasons.add("deterministic_fallback");
  if (generationFailure) reasons.add(generationFailure.code);
  for (const signal of fallbackSignals) reasons.add(signal);
  if (!review) reasons.add("missing_hiring_manager_review");
  if (review?.status === "BLOCKED") reasons.add("hiring_manager_blocked");
  if (review?.status === "NEEDS_REVIEW") reasons.add("hiring_manager_needs_review");
  if (input.evidencePlan?.status === "INSUFFICIENT") reasons.add("insufficient_job_specific_evidence");
  if (qaStatus && qaStatus !== "PASS") reasons.add("application_qa_needs_review");
  if (qaScore !== null && qaScore < PASS_SCORE) reasons.add("application_qa_score_below_pass");
  if (unsupportedQaClaims.length) reasons.add("unsupported_claims_detected");
  if (styleViolations.length) reasons.add("style_violations_detected");

  const scoreCandidates = [
    review?.score,
    qaScore,
  ].filter((value): value is number => typeof value === "number");
  const score = scoreCandidates.length ? Math.min(...scoreCandidates) : fallbackSignals.length ? BLOCK_SCORE - 10 : 0;
  const hardBlocked = generatedBy === "deterministic_fallback"
    || Boolean(generationFailure)
    || fallbackSignals.length > 0
    || review?.status === "BLOCKED"
    || unsupportedQaClaims.length > 0
    || score < BLOCK_SCORE;
  const needsReview = hardBlocked || reasons.size > 0 || !review || score < PASS_SCORE;
  const status: ApplicationMaterialQuality["status"] = hardBlocked ? "BLOCKED" : needsReview ? "NEEDS_REVIEW" : "PASS";

  return {
    status,
    launchable: status === "PASS",
    reason: reasons.size ? humanReason(Array.from(reasons)) : "Cover letter passed material quality review.",
    reasons: Array.from(reasons),
    score,
    generatedBy,
    evidenceRefs,
    review,
    rewriteAttempted: input.rewriteAttempted,
    generationFailure,
  };
}

export function applicationMaterialQualityFromNotes(notes: unknown): ApplicationMaterialQuality | null {
  const object = objectValue(notes);
  const quality = objectValue(object?.materialQuality);
  if (!quality) return null;
  const status = stringValue(quality.status);
  if (!["PASS", "NEEDS_REVIEW", "BLOCKED"].includes(status)) return null;
  return {
    status: status as ApplicationMaterialQuality["status"],
    launchable: Boolean(quality.launchable),
    reason: stringValue(quality.reason) || "Application material quality needs review.",
    reasons: stringArray(quality.reasons),
    score: numberValue(quality.score) ?? 0,
    generatedBy: stringValue(quality.generatedBy) || stringValue(object?.generatedBy) || "unknown",
    evidenceRefs: stringArray(quality.evidenceRefs),
    review: objectValue(quality.review) as HiringManagerMaterialReview | null,
    rewriteAttempted: typeof quality.rewriteAttempted === "boolean" ? quality.rewriteAttempted : undefined,
    generationFailure: materialGenerationFailureValue(quality.generationFailure) ?? materialGenerationFailureValue(object?.generationFailure),
  };
}

export function applicationMaterialQualityDetail(notes: unknown) {
  return applicationMaterialQualityFromNotes(notes) ?? {
    status: "BLOCKED" as const,
    launchable: false,
    reason: "Material quality review has not run.",
    reasons: ["missing_material_quality_review"],
    score: 0,
    generatedBy: stringValue(objectValue(notes)?.generatedBy) || "unknown",
    evidenceRefs: [],
    review: null,
  };
}

export function requireLaunchableApplicationMaterials(notes: unknown) {
  const quality = applicationMaterialQualityDetail(notes);
  if (!quality.launchable) {
    throw new Error(`${MATERIAL_QUALITY_ERROR} ${quality.reason}`);
  }
  return quality;
}

export function fallbackCoverLetterSignals(body: string) {
  const text = body.toLowerCase();
  const signals: string[] = [];
  if (/relevant examples from my approved profile include/i.test(body)) signals.push("fallback_approved_profile_examples");
  if (/\bi am interested in the\b/i.test(body)) signals.push("generic_i_am_interested_opening");
  if (/agentic job search assistant/i.test(body)) signals.push("forced_agentic_job_search_paragraph");
  if (/i would welcome a conversation about how this experience maps/i.test(body)) signals.push("generic_conversation_close");
  if (text.split(/\s+/).length < 120) signals.push("cover_letter_too_thin");
  return Array.from(new Set(signals));
}

export function materialQualityJson(quality: ApplicationMaterialQuality): Prisma.InputJsonValue {
  return quality as unknown as Prisma.InputJsonValue;
}

function humanReason(reasons: string[]) {
  if (reasons.includes("deterministic_fallback")) {
    if (reasons.includes("openai_insufficient_quota")) {
      return "OpenAI quota is exhausted, so the structured cover-letter writer could not run. Regeneration is required before launch.";
    }
    if (reasons.includes("openai_not_configured")) {
      return "OpenAI is not configured, so the structured cover-letter writer could not run. Regeneration is required before launch.";
    }
    if (reasons.includes("openai_rate_limited")) {
      return "OpenAI rate limits blocked structured cover-letter generation. Regeneration is required before launch.";
    }
    if (reasons.includes("openai_timeout")) {
      return "OpenAI timed out during structured cover-letter generation. Regeneration is required before launch.";
    }
    return "Cover letter used deterministic fallback output and must be regenerated or reviewed before launch.";
  }
  if (reasons.includes("forced_agentic_job_search_paragraph")) {
    return "Cover letter contains the forced Agentic job search assistant paragraph instead of role-specific evidence.";
  }
  if (reasons.includes("application_qa_needs_review")) {
    return "Application QA marked the generated materials as needing review.";
  }
  if (reasons.includes("unsupported_claims_detected")) {
    return "Application QA found unsupported claims.";
  }
  if (reasons.includes("hiring_manager_blocked")) {
    return "Hiring-manager review blocked this cover letter.";
  }
  return "Cover letter needs material quality review before launch.";
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function materialGenerationFailureValue(value: unknown): ApplicationMaterialGenerationFailure | null {
  const object = objectValue(value);
  if (!object) return null;
  const provider = stringValue(object.provider);
  const code = stringValue(object.code);
  const message = stringValue(object.message);
  if (!message || !provider || !code) return null;
  return {
    provider: provider === "openai" ? "openai" : "unknown",
    code: materialGenerationFailureCode(code),
    message,
    retryable: Boolean(object.retryable),
  };
}

function materialGenerationFailureCode(value: string): ApplicationMaterialGenerationFailure["code"] {
  const allowed: ApplicationMaterialGenerationFailure["code"][] = [
    "openai_not_configured",
    "openai_insufficient_quota",
    "openai_rate_limited",
    "openai_authentication_failed",
    "openai_permission_denied",
    "openai_bad_request",
    "openai_timeout",
    "openai_structured_output_empty",
    "openai_generation_failed",
    "unknown_generation_failure",
  ];
  return allowed.includes(value as ApplicationMaterialGenerationFailure["code"])
    ? value as ApplicationMaterialGenerationFailure["code"]
    : "unknown_generation_failure";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => stringValue(item)).filter(Boolean) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
