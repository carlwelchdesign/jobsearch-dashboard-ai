import type { EvidenceConfidence, TruthLevel } from "@prisma/client";

const confidenceRank: Record<EvidenceConfidence, number> = {
  REJECTED: 0,
  NEEDS_REVIEW: 1,
  INFERRED: 2,
  VERIFIED: 3,
};

export function confidenceMeetsMinimum(confidence: EvidenceConfidence, minimum: EvidenceConfidence) {
  return confidenceRank[confidence] >= confidenceRank[minimum];
}

export function confidenceWhere(minimum: EvidenceConfidence) {
  return (Object.keys(confidenceRank) as EvidenceConfidence[]).filter((confidence) => confidenceMeetsMinimum(confidence, minimum));
}

export function truthLevelToEvidenceConfidence(truthLevel: TruthLevel): EvidenceConfidence {
  if (truthLevel === "verified") return "VERIFIED";
  if (truthLevel === "inferred" || truthLevel === "estimated") return "INFERRED";
  return "NEEDS_REVIEW";
}

export function defaultUsabilityForConfidence(confidence: EvidenceConfidence) {
  return confidence === "VERIFIED" || confidence === "INFERRED";
}
