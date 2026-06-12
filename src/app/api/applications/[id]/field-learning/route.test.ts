import { beforeEach, describe, expect, it, vi } from "vitest";
import { storeObservedFieldLearning } from "@/lib/applications/field-learning";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/applications/field-learning", () => ({
  storeObservedFieldLearning: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      findUnique: vi.fn(),
    },
    applicationEvent: {
      create: vi.fn(),
    },
  },
}));

const findApplicationMock = vi.mocked(prisma.application.findUnique);
const createEventMock = vi.mocked(prisma.applicationEvent.create);
const storeObservedFieldLearningMock = vi.mocked(storeObservedFieldLearning);

describe("POST /api/applications/[id]/field-learning", () => {
  beforeEach(() => {
    findApplicationMock.mockReset();
    createEventMock.mockReset();
    storeObservedFieldLearningMock.mockReset();
  });

  it("returns reuse eligibility metadata for observed fields", async () => {
    findApplicationMock.mockResolvedValue({
      id: "app_1",
      userId: "user_1",
      jobPosting: { atsProvider: "unknown" },
    } as unknown as Awaited<ReturnType<typeof prisma.application.findUnique>>);
    storeObservedFieldLearningMock.mockResolvedValue({
      saved: 1,
      ignored: 1,
      activeForAutofill: 1,
      needsReview: 0,
      decisions: [
        {
          action: "saved",
          field: { label: "How did you hear about this role?", answer: "Company careers page" },
          reuseEligibility: { activeForAutofill: true, reason: "Available for future safe auto-fill." },
          memory: {
            id: "memory_1",
            status: "ACTIVE",
            sensitivity: "LOW",
            reusePolicy: "AUTO_USE",
          },
        },
      ],
    } as Awaited<ReturnType<typeof storeObservedFieldLearning>>);

    const response = await POST(new Request("http://localhost/api/applications/app_1/field-learning", {
      method: "POST",
      body: JSON.stringify({
        host: "explore.jobs.netflix.net",
        fields: [{ label: "How did you hear about this role?", answer: "Company careers page" }],
      }),
    }), { params: { id: "app_1" } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      saved: 1,
      ignored: 1,
      activeForAutofill: 1,
      needsReview: 0,
      decisions: [
        {
          action: "saved",
          reuseEligibility: { activeForAutofill: true },
          memoryId: "memory_1",
        },
      ],
    });
  });
});
