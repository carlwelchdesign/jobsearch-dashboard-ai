import { beforeEach, describe, expect, it, vi } from "vitest";
import { findReusableAnswerMemories, upsertApplicationAnswerMemory } from "@/lib/application-answer-memory";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";

vi.mock("@/lib/application-answer-memory", () => ({
  findReusableAnswerMemories: vi.fn(),
  upsertApplicationAnswerMemory: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
  },
}));

const findUserMock = vi.mocked(prisma.user.findFirst);
const findMemoriesMock = vi.mocked(findReusableAnswerMemories);
const upsertMemoryMock = vi.mocked(upsertApplicationAnswerMemory);

describe("/api/application-answer-memory", () => {
  beforeEach(() => {
    findUserMock.mockReset();
    findMemoriesMock.mockReset();
    upsertMemoryMock.mockReset();
  });

  it("lists reusable answer matches for a question", async () => {
    findUserMock.mockResolvedValue({ id: "user_1" } as unknown as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    findMemoriesMock.mockResolvedValue([
      {
        id: "memory_1",
        questionText: "How did you find this job?",
        answer: "I found it through a personal job search tool.",
        sensitivity: "LOW",
        reusePolicy: "AUTO_USE",
        useCount: 1,
        lastUsedAt: null,
        matchScore: 100,
        autoUsable: true,
      },
    ]);

    const response = await GET(new Request("http://localhost/api/application-answer-memory?question=How%20did%20you%20find%20this%20job"));

    expect(findMemoriesMock).toHaveBeenCalledWith("user_1", "How did you find this job");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ matches: [{ id: "memory_1", autoUsable: true }] });
  });

  it("saves reusable answer memory for the current user", async () => {
    findUserMock.mockResolvedValue({ id: "user_1" } as unknown as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    upsertMemoryMock.mockResolvedValue({ id: "memory_1" } as Awaited<ReturnType<typeof upsertApplicationAnswerMemory>>);

    const response = await POST(new Request("http://localhost/api/application-answer-memory", {
      method: "POST",
      body: JSON.stringify({
        questionText: "How did you find this job?",
        answer: "I found it through a personal job search tool.",
        sensitivity: "LOW",
        reusePolicy: "AUTO_USE",
      }),
    }));

    expect(upsertMemoryMock).toHaveBeenCalledWith({
      userId: "user_1",
      questionText: "How did you find this job?",
      answer: "I found it through a personal job search tool.",
      sensitivity: "LOW",
      reusePolicy: "AUTO_USE",
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ memory: { id: "memory_1" } });
  });
});
