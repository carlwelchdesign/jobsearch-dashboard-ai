import crypto from "crypto";
import type { CandidateEvidence, Prisma } from "@prisma/client";
import { createEmbedding, isOpenAiConfigured } from "@/lib/ai/openai";
import { chunkEmbeddingText, syncEvidenceChunks } from "@/lib/evidence/chunking";
import { pgVectorSearchAvailable } from "@/lib/evidence/pgvector";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";

const DEFAULT_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

export type EvidenceEmbeddingBackfillInput = {
  candidateProfileId?: string;
  evidenceIds?: string[];
  force?: boolean;
  limit?: number;
};

export async function backfillEvidenceEmbeddings(input: EvidenceEmbeddingBackfillInput = {}) {
  if (!isOpenAiConfigured()) {
    return {
      embedded: 0,
      skipped: 0,
      message: "OpenAI is not configured. Add OPENAI_API_KEY to generate evidence embeddings.",
    };
  }

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const evidence = await prisma.candidateEvidence.findMany({
    where: {
      ...(input.candidateProfileId ? { candidateProfileId: input.candidateProfileId } : {}),
      ...(input.evidenceIds?.length ? { id: { in: input.evidenceIds } } : {}),
      confidence: { not: "REJECTED" },
    },
    include: {
      chunks: true,
      embeddings: {
        where: { model: DEFAULT_MODEL },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
  });
  let embedded = 0;
  let skipped = 0;

  for (const item of evidence) {
    if (!item.chunks.length) await syncEvidenceChunks(item);
    const text = evidenceEmbeddingText(item);
    const contentHash = hashContent(text);
    const existing = item.embeddings[0];
    if (!input.force && existing?.contentHash === contentHash) {
      skipped += 1;
      continue;
    }

    const result = await createEmbedding(text);
    if (!result || result.vector.length === 0) {
      skipped += 1;
      continue;
    }

    const embedding = await prisma.evidenceEmbedding.upsert({
      where: {
        evidenceId_model_contentHash: {
          evidenceId: item.id,
          model: result.model,
          contentHash,
        },
      },
      update: {
        dimensions: result.vector.length,
        vector: result.vector as Prisma.InputJsonValue,
      },
      create: {
        evidenceId: item.id,
        model: result.model,
        dimensions: result.vector.length,
        vector: result.vector as Prisma.InputJsonValue,
        contentHash,
      },
    });
    await updateEvidenceEmbeddingVectorSearch(embedding.id, result.vector);
    embedded += 1;
  }

  const chunkResult = await backfillEvidenceChunkEmbeddings(input);

  return {
    embedded,
    skipped,
    chunkEmbedded: chunkResult.embedded,
    chunkSkipped: chunkResult.skipped,
    message: `Embedded ${embedded} evidence item${embedded === 1 ? "" : "s"} and ${chunkResult.embedded} chunk${chunkResult.embedded === 1 ? "" : "s"}; skipped ${skipped + chunkResult.skipped}.`,
  };
}

export async function backfillEvidenceChunkEmbeddings(input: EvidenceEmbeddingBackfillInput = {}) {
  if (!isOpenAiConfigured()) {
    return {
      embedded: 0,
      skipped: 0,
    };
  }

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const chunks = await prisma.evidenceChunk.findMany({
    where: {
      evidence: {
        ...(input.candidateProfileId ? { candidateProfileId: input.candidateProfileId } : {}),
        ...(input.evidenceIds?.length ? { id: { in: input.evidenceIds } } : {}),
        confidence: { not: "REJECTED" },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
  });
  let embedded = 0;
  let skipped = 0;

  for (const chunk of chunks) {
    const text = chunkEmbeddingText(chunk);
    const contentHash = hashContent(text);
    if (!input.force && chunk.embeddingModel === DEFAULT_MODEL && chunk.contentHash === contentHash && numericVector(chunk.vector).length) {
      skipped += 1;
      continue;
    }

    const result = await createEmbedding(text);
    if (!result || result.vector.length === 0) {
      skipped += 1;
      continue;
    }

    await prisma.evidenceChunk.update({
      where: { id: chunk.id },
      data: {
        embeddingModel: result.model,
        dimensions: result.vector.length,
        vector: result.vector as Prisma.InputJsonValue,
        contentHash,
      },
    });
    await updateEvidenceChunkVectorSearch(chunk.id, result.vector);
    embedded += 1;
  }

  return { embedded, skipped };
}

export async function createQueryEmbedding(query: string | undefined) {
  if (!query?.trim() || !isOpenAiConfigured()) return null;
  try {
    const result = await createEmbedding(query);
    return result?.vector.length ? result : null;
  } catch (error) {
    console.warn("Evidence query embedding failed; falling back to lexical retrieval.", error);
    return null;
  }
}

export function evidenceEmbeddingText(evidence: Pick<CandidateEvidence, "title" | "content" | "type" | "sourceType" | "confidence" | "tags">) {
  return [
    evidence.title,
    evidence.type,
    evidence.sourceType,
    evidence.confidence,
    jsonArray(evidence.tags).join(", "),
    evidence.content,
  ].filter(Boolean).join("\n");
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (const [index, leftValue] of left.entries()) {
    const rightValue = right[index];
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  return denominator ? dot / denominator : 0;
}

export function numericVector(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
}

export function pgVectorLiteral(vector: number[]) {
  const numeric = vector.filter((item) => typeof item === "number" && Number.isFinite(item));
  return `[${numeric.join(",")}]`;
}

async function updateEvidenceEmbeddingVectorSearch(id: string, vector: number[]) {
  if (vector.length !== 1536) return;
  if (!(await pgVectorSearchAvailable())) return;
  try {
    await prisma.$executeRaw`
      UPDATE "EvidenceEmbedding"
      SET "vectorSearch" = ${pgVectorLiteral(vector)}::vector
      WHERE "id" = ${id}
    `;
  } catch (error) {
    warnPgVectorUnavailable(error);
  }
}

async function updateEvidenceChunkVectorSearch(id: string, vector: number[]) {
  if (vector.length !== 1536) return;
  if (!(await pgVectorSearchAvailable())) return;
  try {
    await prisma.$executeRaw`
      UPDATE "EvidenceChunk"
      SET "vectorSearch" = ${pgVectorLiteral(vector)}::vector
      WHERE "id" = ${id}
    `;
  } catch (error) {
    warnPgVectorUnavailable(error);
  }
}

export function hashContent(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

let warnedPgVectorUnavailable = false;

function warnPgVectorUnavailable(error: unknown) {
  if (warnedPgVectorUnavailable) return;
  warnedPgVectorUnavailable = true;
  console.warn("pgvector search column unavailable; using JSON vector fallback.", error instanceof Error ? error.message : error);
}
