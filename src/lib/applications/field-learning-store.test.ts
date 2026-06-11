import { beforeEach, describe, expect, it, vi } from "vitest";
import { upsertApplicationAnswerMemory } from "@/lib/application-answer-memory";
import { prisma } from "@/lib/prisma";
import { storeObservedFieldLearning } from "./field-learning";

vi.mock("@/lib/application-answer-memory", () => ({
  upsertApplicationAnswerMemory: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    applicationFieldMemory: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    applicationFormPattern: {
      findFirst: vi.fn(),
    },
  },
}));

const findMemoryMock = vi.mocked(prisma.applicationFieldMemory.findUnique);
const upsertMemoryMock = vi.mocked(prisma.applicationFieldMemory.upsert);
const findPatternMock = vi.mocked(prisma.applicationFormPattern.findFirst);
const upsertAnswerMemoryMock = vi.mocked(upsertApplicationAnswerMemory);

describe("storeObservedFieldLearning", () => {
  beforeEach(() => {
    findMemoryMock.mockReset();
    upsertMemoryMock.mockReset();
    findPatternMock.mockReset();
    upsertAnswerMemoryMock.mockReset();
    findPatternMock.mockResolvedValue(null);
    upsertAnswerMemoryMock.mockResolvedValue({ id: "answer_memory_1" } as Awaited<ReturnType<typeof upsertApplicationAnswerMemory>>);
  });

  it("promotes repeated medium-risk custom answers for progressive auto-use", async () => {
    findMemoryMock.mockResolvedValue({
      id: "memory_1",
      userId: "user_1",
      host: "jobs.example.com",
      fieldKey: "describe_a_complex_frontend_project",
      category: "custom",
      label: "Describe a complex frontend project.",
      inputType: "textarea",
      selector: "textarea#project",
      answer: "I built a secure admin console.",
      sensitivity: "MEDIUM",
      reusePolicy: "ASK_FIRST",
      status: "NEEDS_REVIEW",
      confidence: 84,
      successCount: 1,
    } as Awaited<ReturnType<typeof prisma.applicationFieldMemory.findUnique>>);
    (upsertMemoryMock as unknown as { mockImplementation: (fn: (input: { update: object }) => Promise<unknown>) => void }).mockImplementation(async (input) => ({
      id: "memory_1",
      ...(input.update as object),
      userId: "user_1",
      host: "jobs.example.com",
      fieldKey: "describe_a_complex_frontend_project",
      category: "custom",
      label: "Describe a complex frontend project.",
      answer: "I built a secure admin console.",
    }));

    const result = await storeObservedFieldLearning({
      userId: "user_1",
      applicationId: "app_1",
      atsProvider: "ashby",
      host: "jobs.example.com",
      fields: [{
        fieldKey: "describe_a_complex_frontend_project",
        category: "custom",
        label: "Describe a complex frontend project.",
        inputType: "textarea",
        selector: "textarea#project",
        answer: "I built a secure admin console.",
        confidence: 84,
      }],
    });

    expect(result.saved).toBe(1);
    expect(upsertMemoryMock).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        status: "ACTIVE",
        reusePolicy: "AUTO_USE",
        successCount: 2,
        confidence: 86,
      }),
    }));
    expect(upsertAnswerMemoryMock).toHaveBeenCalledWith(expect.objectContaining({
      sensitivity: "MEDIUM",
      reusePolicy: "AUTO_USE",
    }));
  });

  it("keeps high-risk repeated answers review-gated", async () => {
    findMemoryMock.mockResolvedValue({
      id: "memory_1",
      answer: "$150,000",
      successCount: 4,
    } as Awaited<ReturnType<typeof prisma.applicationFieldMemory.findUnique>>);
    (upsertMemoryMock as unknown as { mockImplementation: (fn: (input: { update: object }) => Promise<unknown>) => void }).mockImplementation(async (input) => ({
      id: "memory_1",
      ...(input.update as object),
      sensitivity: "HIGH",
      label: "What are your salary expectations?",
      category: "custom",
      answer: "$150,000",
    }));

    await storeObservedFieldLearning({
      userId: "user_1",
      applicationId: "app_1",
      atsProvider: "ashby",
      host: "jobs.example.com",
      fields: [{
        label: "What are your salary expectations?",
        inputType: "input",
        answer: "$150,000",
        confidence: 95,
      }],
    });

    expect(upsertMemoryMock).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        sensitivity: "HIGH",
        status: "NEEDS_REVIEW",
        reusePolicy: "ASK_FIRST",
      }),
    }));
    expect(upsertAnswerMemoryMock).not.toHaveBeenCalled();
  });
});
