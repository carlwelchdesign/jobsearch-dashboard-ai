import { Prisma, type CandidateEvidence, type EvidenceConfidence } from "@prisma/client";
import { confidenceWhere } from "@/lib/evidence/confidence";
import { cosineSimilarity, createQueryEmbedding, numericVector } from "@/lib/evidence/embeddings";
import { pgVectorSearchAvailable } from "@/lib/evidence/pgvector";
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
    include: {
      chunks: {
        orderBy: { chunkIndex: "asc" },
        take: 8,
      },
      embeddings: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
    take: Math.max(input.limit ?? 24, 100),
  });
  const queryEmbedding = await createQueryEmbedding(input.query);
  const pgVectorScores = queryEmbedding
    ? await pgVectorEvidenceScores({
        candidateProfileId,
        confidenceMinimum,
        usableFor: input.usableFor,
        excludedEvidenceIds: input.excludedEvidenceIds ?? [],
        queryVector: queryEmbedding.vector,
        limit: Math.max(input.limit ?? 24, 100),
      })
    : new Map<string, number>();

  const scoredEvidence = evidence
    .map((item) => {
      const lexicalScore = scoreEvidenceText(item, input.query, requiredTags);
      const vectorScore = queryEmbedding ? scoreEvidenceVector(item.embeddings[0]?.vector, queryEmbedding.vector) : 0;
      const chunkScore = scoreEvidenceChunks(item.chunks, input.query, queryEmbedding?.vector);
      const pgVectorScore = pgVectorScores.get(item.id) ?? 0;
      return {
        ...item,
        relevanceScore: lexicalScore + vectorScore + chunkScore + pgVectorScore,
      };
    })
    .filter((item) => item.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || b.updatedAt.getTime() - a.updatedAt.getTime());

  return dedupeRetrievedEvidence(scoredEvidence)
    .slice(0, input.limit ?? 24);
}

async function pgVectorEvidenceScores({
  candidateProfileId,
  confidenceMinimum,
  usableFor,
  excludedEvidenceIds,
  queryVector,
  limit,
}: {
  candidateProfileId: string;
  confidenceMinimum: EvidenceConfidence;
  usableFor?: EvidenceUse;
  excludedEvidenceIds: string[];
  queryVector: number[];
  limit: number;
}) {
  if (queryVector.length !== 1536) return new Map<string, number>();
  if (!(await pgVectorSearchAvailable())) return new Map<string, number>();
  const confidenceValues = confidenceWhere(confidenceMinimum);
  const usabilityFilter = usableFor === "resume"
    ? Prisma.sql`AND e."usableInResume" = true`
    : usableFor === "coverLetter"
    ? Prisma.sql`AND e."usableInCoverLetter" = true`
    : usableFor === "recruiterMessage"
    ? Prisma.sql`AND e."usableInRecruiterMessage" = true`
    : Prisma.empty;
  const excludedFilter = excludedEvidenceIds.length
    ? Prisma.sql`AND e."id" NOT IN (${Prisma.join(excludedEvidenceIds)})`
    : Prisma.empty;
  const vectorLiteral = `[${queryVector.join(",")}]`;
  try {
    const rows = await prisma.$queryRaw<Array<{ evidenceId: string; score: number }>>`
      SELECT "evidenceId", MAX(score) AS score
      FROM (
        SELECT e."id" AS "evidenceId", GREATEST(0, 1 - (emb."vectorSearch" <=> ${vectorLiteral}::vector)) * 25 AS score
        FROM "CandidateEvidence" e
        JOIN "EvidenceEmbedding" emb ON emb."evidenceId" = e."id"
        WHERE e."candidateProfileId" = ${candidateProfileId}
          AND e."confidence" IN (${Prisma.join(confidenceValues)})
          AND emb."vectorSearch" IS NOT NULL
          ${usabilityFilter}
          ${excludedFilter}
        UNION ALL
        SELECT e."id" AS "evidenceId", GREATEST(0, 1 - (chunk."vectorSearch" <=> ${vectorLiteral}::vector)) * 25 AS score
        FROM "CandidateEvidence" e
        JOIN "EvidenceChunk" chunk ON chunk."evidenceId" = e."id"
        WHERE e."candidateProfileId" = ${candidateProfileId}
          AND e."confidence" IN (${Prisma.join(confidenceValues)})
          AND chunk."vectorSearch" IS NOT NULL
          ${usabilityFilter}
          ${excludedFilter}
      ) ranked
      GROUP BY "evidenceId"
      ORDER BY score DESC
      LIMIT ${limit}
    `;
    return new Map(rows.map((row) => [row.evidenceId, Number(row.score) || 0]));
  } catch (error) {
    warnPgVectorRetrievalUnavailable(error);
    return new Map<string, number>();
  }
}

function scoreEvidenceChunks(chunks: Array<{ content: string; vector: Prisma.JsonValue }>, query?: string, queryVector?: number[]) {
  if (!chunks.length) return 0;
  const queryTerms = normalizeQueryTerms(query);
  const lexical = queryTerms.length
    ? Math.max(...chunks.map((chunk) => {
        const content = chunk.content.toLowerCase();
        return queryTerms.reduce((score, term) => score + (content.includes(term) ? 2 : 0), 0);
      }))
    : 0;
  const vector = queryVector
    ? Math.max(...chunks.map((chunk) => scoreEvidenceVector(chunk.vector, queryVector)))
    : 0;
  return lexical + vector;
}

function scoreEvidenceVector(vectorJson: unknown, queryVector: number[]) {
  const vector = numericVector(vectorJson);
  const similarity = cosineSimilarity(vector, queryVector);
  return similarity > 0 ? similarity * 20 : 0;
}

export function scoreEvidenceText(evidence: Pick<CandidateEvidence, "title" | "content" | "tags" | "confidence"> & Partial<Pick<CandidateEvidence, "sourceType" | "sourceRef">>, query?: string, requiredTags: string[] = []) {
  const tags = normalizeTags(evidence.tags);
  if (requiredTags.length && !requiredTags.every((tag) => tags.includes(tag))) return 0;
  const queryTerms = normalizeQueryTerms(query);
  const haystack = `${evidence.title} ${evidence.content} ${tags.join(" ")}`.toLowerCase();
  const confidenceBoost = evidence.confidence === "VERIFIED" ? 3 : evidence.confidence === "INFERRED" ? 2 : 1;
  const tagBoost = requiredTags.length ? requiredTags.length * 4 : 0;
  const specificityPenalty = isBroadResumeEvidence(evidence) ? 8 : 0;
  if (!queryTerms.length) return Math.max(0, confidenceBoost + tagBoost + tags.length * 0.1 - specificityPenalty);
  const termScore = queryTerms.reduce((score, term) => score + (haystack.includes(term) ? 3 : 0), 0);
  return Math.max(0, termScore + tagBoost + confidenceBoost - specificityPenalty);
}

export function dedupeRetrievedEvidence<T extends Pick<CandidateEvidence, "title" | "content" | "sourceType" | "sourceRef" | "updatedAt"> & { relevanceScore: number }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = evidenceIdentityKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isBroadResumeEvidence(evidence: Pick<CandidateEvidence, "title" | "content"> & Partial<Pick<CandidateEvidence, "sourceType" | "sourceRef">>) {
  return evidence.sourceType === "RESUME_UPLOAD"
    && !String(evidence.sourceRef ?? "").includes(":chunk:")
    && /^approved resume:/i.test(evidence.title)
    && evidence.content.length > 1000;
}

function evidenceIdentityKey(evidence: Pick<CandidateEvidence, "title" | "content" | "sourceType" | "sourceRef">) {
  if (isBroadResumeEvidence(evidence)) {
    return `broad-resume:${normalizeEvidenceText(evidence.content).slice(0, 700)}`;
  }
  return [
    evidence.sourceType,
    evidence.sourceRef ?? "",
    normalizeEvidenceText(evidence.title),
    normalizeEvidenceText(evidence.content).slice(0, 500),
  ].join("|");
}

function normalizeEvidenceText(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeQueryTerms(query?: string) {
  return (query ?? "")
    .toLowerCase()
    .split(/[\s,]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);
}

let warnedPgVectorRetrievalUnavailable = false;

function warnPgVectorRetrievalUnavailable(error: unknown) {
  if (warnedPgVectorRetrievalUnavailable) return;
  warnedPgVectorRetrievalUnavailable = true;
  console.warn("pgvector retrieval unavailable; using JSON vector fallback.", error instanceof Error ? error.message : error);
}

async function firstCandidateProfileId() {
  const profile = await prisma.userProfile.findFirst({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return profile?.id ?? null;
}
