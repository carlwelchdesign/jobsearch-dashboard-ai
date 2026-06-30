import type { CandidateEvidence, Prisma } from "@prisma/client";
import { jsonArray } from "@/lib/json";

type RecommendationMetadata = {
  recommenderName?: string;
  relationship?: string;
  themes?: string[];
};

export function isLinkedInRecommendationEvidence(evidence: Pick<CandidateEvidence, "sourceType" | "sourceRef">) {
  return evidence.sourceType === "LINKEDIN" && String(evidence.sourceRef ?? "").startsWith("linkedin-recommendation:");
}

export function linkedinRecommendationSignalLine(evidence: Pick<CandidateEvidence, "metadata" | "tags">) {
  const metadata = recommendationMetadata(evidence.metadata);
  const themes = jsonArray(metadata.themes).length ? jsonArray(metadata.themes) : jsonArray(evidence.tags);
  const themeText = themes
    .filter((theme) => !["linkedin-recommendation", "third-party-signal"].includes(theme))
    .slice(0, 3)
    .map((theme) => theme.replace(/-/g, " "))
    .join(", ");
  const recommender = metadata.recommenderName ? ` from ${metadata.recommenderName}` : "";
  const relationship = metadata.relationship ? ` (${metadata.relationship})` : "";
  return `Third-party recommendation signal${recommender}${relationship}${themeText ? `: ${themeText}` : ""}.`;
}

function recommendationMetadata(value: Prisma.JsonValue): RecommendationMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    recommenderName: typeof record.recommenderName === "string" ? record.recommenderName : undefined,
    relationship: typeof record.relationship === "string" ? record.relationship : undefined,
    themes: Array.isArray(record.themes) ? record.themes.filter((item): item is string => typeof item === "string") : undefined,
  };
}
