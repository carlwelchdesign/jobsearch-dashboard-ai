import type { Prisma, SkillAdjustment } from "@prisma/client";

export type QualityProposalLearningRules = {
  highScoreUserRejected?: boolean;
  stricterDedupe?: boolean;
  lowSavedYield?: boolean;
  marketSearchAdaptation?: boolean;
  agencyCandidateQuality?: boolean;
  coverLetterFieldQa?: boolean;
  fieldClassificationQa?: boolean;
  appliedAdjustmentIds?: string[];
  appliedCategories?: string[];
};

export function applyNumericThresholdAdjustments<TInput extends Record<string, unknown>>(
  input: TInput,
  adjustments: SkillAdjustment[],
  key: keyof TInput,
  bounds: { min: number; max: number; maxDelta: number },
) {
  const current = typeof input[key] === "number" ? Number(input[key]) : undefined;
  if (current === undefined) return input;

  let next = current;
  for (const adjustment of adjustments) {
    if (adjustment.kind !== "THRESHOLD") continue;
    const patch = objectValue(adjustment.patchJson);
    if (patch.field !== key || typeof patch.value !== "number") continue;
    if (Math.abs(patch.value - current) > bounds.maxDelta) continue;
    next = Math.min(bounds.max, Math.max(bounds.min, patch.value));
  }

  return { ...input, [key]: next };
}

export function applyQualityProposalRuleAdjustments<TInput extends { learningRules?: QualityProposalLearningRules }>(
  input: TInput,
  adjustments: SkillAdjustment[],
) {
  const learningRules = learningRulesFromAdjustments(adjustments);
  if (!learningRules.appliedAdjustmentIds?.length) return input;
  return {
    ...input,
    learningRules: mergeLearningRules(input.learningRules, learningRules),
  };
}

export function learningRulesFromAdjustments(adjustments: SkillAdjustment[]): QualityProposalLearningRules {
  const rules: QualityProposalLearningRules = {
    appliedAdjustmentIds: [],
    appliedCategories: [],
  };

  for (const adjustment of adjustments) {
    if (!["GUIDANCE", "QA_CHECK"].includes(adjustment.kind)) continue;
    const patch = objectValue(adjustment.patchJson);
    if (patch.source !== "quality_proposal") continue;
    const category = typeof patch.category === "string" ? patch.category : "";
    if (!category) continue;

    if (category === "high_score_user_rejected") rules.highScoreUserRejected = true;
    if (category === "dedupe_ineffective") rules.stricterDedupe = true;
    if (category === "low_saved_yield") rules.lowSavedYield = true;
    if (category === "market_search_adaptation") rules.marketSearchAdaptation = true;
    if (category === "CANDIDATE_FAILURE" || category === "candidate_failure") rules.agencyCandidateQuality = true;
    if (category === "cover_letter_field") rules.coverLetterFieldQa = true;
    if (category === "field_classification") rules.fieldClassificationQa = true;

    if (hasAnyRuleForCategory(category)) {
      rules.appliedAdjustmentIds?.push(adjustment.id);
      rules.appliedCategories?.push(category);
    }
  }

  rules.appliedAdjustmentIds = Array.from(new Set(rules.appliedAdjustmentIds));
  rules.appliedCategories = Array.from(new Set(rules.appliedCategories));
  return rules;
}

export function objectValue(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function hasAnyRuleForCategory(category: string) {
  return [
    "high_score_user_rejected",
    "dedupe_ineffective",
    "low_saved_yield",
    "market_search_adaptation",
    "CANDIDATE_FAILURE",
    "candidate_failure",
    "cover_letter_field",
    "field_classification",
  ].includes(category);
}

function mergeLearningRules(existing: QualityProposalLearningRules | undefined, next: QualityProposalLearningRules): QualityProposalLearningRules {
  return {
    ...existing,
    ...next,
    appliedAdjustmentIds: Array.from(new Set([...(existing?.appliedAdjustmentIds ?? []), ...(next.appliedAdjustmentIds ?? [])])),
    appliedCategories: Array.from(new Set([...(existing?.appliedCategories ?? []), ...(next.appliedCategories ?? [])])),
  };
}
