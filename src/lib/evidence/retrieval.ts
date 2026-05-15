import type { CandidateEvidence, EvidenceConfidence, Prisma } from "@prisma/client";
import { confidenceWhere } from "@/lib/evidence/confidence";
import { normalizeTags } from "@/lib/evidence/tags";
import { prisma } from "@/lib/prisma";

type EvidenceUse = "resume" | "coverLetter" | "recruiterMessage";

export type RetrieveCandidateEvidenceInput = {
  candidateProfileId?: string;
  jobId?: string;
  searchProfileId?: string;
  resumeProfileId?: string;
  query?: string;
  requiredTags?: string[];
  excludedEvidenceIds?: string[];
  confidenceMinimum?: EvidenceConfidence;
  usableFor?: EvidenceUse;
  limit?: number;
};

export type RetrievedEvidence = CandidateEvidence & {
  relevanceScore: number;
};

export async function retrieveCandidateEvidence(input: RetrieveCandidateEvidenceInput): Promise<RetrievedEvidence[]> {
  const candidateProfileId = input.candidateProfileId ?? (await firstCandidateProfileId());
  if (!candidateProfileId) return [];

  const confidenceMinimum = input.confidenceMinimum ?? "INFERRED";
  const requiredTags = normalizeTags(input.requiredTags ?? []);
  const where: Prisma.CandidateEvidenceWhereInput = {
    candidateProfileId,
    confidence: { in: confidenceWhere(confidenceMinimum) },
    id: input.excludedEvidenceIds?.length ? { notIn: input.excludedEvidenceIds } : undefined,
    ...(input.usableFor === "resume" ? { usableInResume: true } : {}),
    ...(input.usableFor === "coverLetter" ? { usableInCoverLetter: true } : {}),
    ...(input.usableFor === "recruiterMessage" ? { usableInRecruiterMessage: true } : {}),
  };

  const evidence = await prisma.candidateEvidence.findMany({
    where,
    orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
    take: Math.max(input.limit ?? 24, 100),
  });

  return evidence
    .map((item) => ({ ...item, relevanceScore: scoreEvidenceText(item, input.query, requiredTags) }))
    .filter((item) => item.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, input.limit ?? 24);
}

export function scoreEvidenceText(evidence: Pick<CandidateEvidence, "title" | "content" | "tags" | "confidence">, query?: string, requiredTags: string[] = []) {
  const tags = normalizeTags(evidence.tags);
  if (requiredTags.length && !requiredTags.every((tag) => tags.includes(tag))) return 0;
  const queryTerms = normalizeQueryTerms(query);
  const haystack = `${evidence.title} ${evidence.content} ${tags.join(" ")}`.toLowerCase();
  const confidenceBoost = evidence.confidence === "VERIFIED" ? 3 : evidence.confidence === "INFERRED" ? 2 : 1;
  const tagBoost = requiredTags.length ? requiredTags.length * 4 : 0;
  if (!queryTerms.length) return confidenceBoost + tagBoost + tags.length * 0.1;
  const termScore = queryTerms.reduce((score, term) => score + (haystack.includes(term) ? 3 : 0), 0);
  return termScore + tagBoost + confidenceBoost;
}

function normalizeQueryTerms(query?: string) {
  return (query ?? "")
    .toLowerCase()
    .split(/[\s,]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);
}

async function firstCandidateProfileId() {
  const profile = await prisma.userProfile.findFirst({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return profile?.id ?? null;
}
