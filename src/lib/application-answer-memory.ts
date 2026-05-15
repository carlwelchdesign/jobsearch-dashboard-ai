import type { AnswerMemoryReusePolicy, AnswerMemorySensitivity, ApplicationAnswerMemory } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type UpsertApplicationAnswerMemoryInput = {
  userId: string;
  questionText: string;
  answer: string;
  sensitivity?: AnswerMemorySensitivity;
  reusePolicy?: AnswerMemoryReusePolicy;
  sourceApplicationId?: string | null;
  sourceRequestId?: string | null;
};

export type AnswerMemoryMatch = Pick<ApplicationAnswerMemory, "id" | "questionText" | "answer" | "sensitivity" | "reusePolicy" | "useCount" | "lastUsedAt"> & {
  matchScore: number;
  autoUsable: boolean;
};

export function canonicalizeApplicationQuestion(question: string) {
  return question
    .toLowerCase()
    .replace(/\b(found|finding)\b/g, "find")
    .replace(/\b(role|position|posting|opportunity)\b/g, "job")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|to|for|of|and|or|in|on|at|with|this|that|please|let|us|know|did|do)\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b(\w+) \1\b/g, "$1")
    .trim()
    .slice(0, 240);
}

export function scoreQuestionSimilarity(a: string, b: string) {
  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);
  if (!aTokens.size || !bTokens.size) return 0;

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }

  const union = new Set([...aTokens, ...bTokens]).size;
  return Math.round((overlap / union) * 100);
}

export function buildAnswerMemoryMatch(memory: Pick<ApplicationAnswerMemory, "id" | "questionText" | "questionCanonical" | "answer" | "sensitivity" | "reusePolicy" | "useCount" | "lastUsedAt">, question: string): AnswerMemoryMatch {
  const canonical = canonicalizeApplicationQuestion(question);
  const exact = memory.questionCanonical === canonical;
  const matchScore = exact ? 100 : scoreQuestionSimilarity(memory.questionCanonical, canonical);
  return {
    id: memory.id,
    questionText: memory.questionText,
    answer: memory.answer,
    sensitivity: memory.sensitivity,
    reusePolicy: memory.reusePolicy,
    useCount: memory.useCount,
    lastUsedAt: memory.lastUsedAt,
    matchScore,
    autoUsable: memory.reusePolicy === "AUTO_USE" && memory.sensitivity === "LOW" && matchScore >= 92,
  };
}

export async function upsertApplicationAnswerMemory(input: UpsertApplicationAnswerMemoryInput) {
  const questionText = input.questionText.trim();
  const answer = input.answer.trim();
  if (!questionText) throw new Error("Question text is required.");
  if (!answer) throw new Error("Answer is required.");

  const questionCanonical = canonicalizeApplicationQuestion(questionText);
  if (!questionCanonical) throw new Error("Question text is too generic to save as answer memory.");

  return prisma.applicationAnswerMemory.upsert({
    where: {
      userId_questionCanonical: {
        userId: input.userId,
        questionCanonical,
      },
    },
    update: {
      questionText,
      answer,
      sensitivity: input.sensitivity ?? "MEDIUM",
      reusePolicy: input.reusePolicy ?? "ASK_FIRST",
      sourceApplicationId: input.sourceApplicationId ?? undefined,
      sourceRequestId: input.sourceRequestId ?? undefined,
    },
    create: {
      userId: input.userId,
      questionCanonical,
      questionText,
      answer,
      sensitivity: input.sensitivity ?? "MEDIUM",
      reusePolicy: input.reusePolicy ?? "ASK_FIRST",
      sourceApplicationId: input.sourceApplicationId ?? null,
      sourceRequestId: input.sourceRequestId ?? null,
    },
  });
}

export async function findReusableAnswerMemories(userId: string, question: string, limit = 5) {
  const canonical = canonicalizeApplicationQuestion(question);
  if (!canonical) return [];

  const memories = await prisma.applicationAnswerMemory.findMany({
    where: {
      userId,
      reusePolicy: { not: "NEVER_REUSE" },
    },
    orderBy: [{ lastUsedAt: "desc" }, { updatedAt: "desc" }],
    take: 80,
  });

  return memories
    .map((memory) => buildAnswerMemoryMatch(memory, question))
    .filter((match) => match.matchScore >= 45)
    .sort((a, b) => b.matchScore - a.matchScore || b.useCount - a.useCount)
    .slice(0, Math.min(Math.max(limit, 1), 20));
}

export async function markAnswerMemoryUsed(id: string) {
  return prisma.applicationAnswerMemory.update({
    where: { id },
    data: {
      useCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });
}

function tokenSet(value: string) {
  return new Set(canonicalizeApplicationQuestion(value).split(" ").filter((token) => token.length > 2));
}
