import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureJobRejectionLearning } from "@/lib/jobs/rejection-learning";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobProfileMatch: {
      findUnique: vi.fn(),
    },
    skillFeedback: {
      create: vi.fn(),
    },
  },
}));

const findMatchMock = vi.mocked(prisma.jobProfileMatch.findUnique);
const createFeedbackMock = vi.mocked(prisma.skillFeedback.create);

describe("job rejection learning", () => {
  beforeEach(() => {
    findMatchMock.mockReset();
    createFeedbackMock.mockReset();
    createFeedbackMock.mockResolvedValue({ id: "feedback_1" } as Awaited<ReturnType<typeof prisma.skillFeedback.create>>);
  });

  it("records job fit and agency guidance for high-confidence rejected matches", async () => {
    findMatchMock.mockResolvedValue(match({ overallScore: 94, status: "needs_review" }) as Awaited<ReturnType<typeof prisma.jobProfileMatch.findUnique>>);

    const result = await captureJobRejectionLearning({
      userId: "user_1",
      matchId: "match_1",
      source: "test",
      reasons: ["wrong_tech_stack"],
      note: "Too backend-heavy.",
      previousStatus: "needs_review",
    });

    expect(result).toEqual({ created: 2 });
    expect(createFeedbackMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ skillId: "job_fit_scorer" }),
    }));
    expect(createFeedbackMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ skillId: "approve_agency_match" }),
    }));
  });

  it("records only job fit guidance for lower-confidence manual rejects", async () => {
    findMatchMock.mockResolvedValue(match({ overallScore: 72, status: "needs_review" }) as Awaited<ReturnType<typeof prisma.jobProfileMatch.findUnique>>);

    const result = await captureJobRejectionLearning({
      userId: "user_1",
      matchId: "match_1",
      source: "test",
    });

    expect(result).toEqual({ created: 1 });
    expect(createFeedbackMock).toHaveBeenCalledTimes(1);
    expect(createFeedbackMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ skillId: "job_fit_scorer" }),
    }));
  });
});

function match(input: { overallScore: number; status: "needs_review" | "approved" | "rejected" }) {
  return {
    id: "match_1",
    jobPostingId: "job_1",
    jobSearchProfileId: "profile_1",
    status: input.status,
    overallScore: input.overallScore,
    recommendedAction: "Review",
    missingKeywords: [],
    titleFit: input.overallScore,
    skillFit: input.overallScore,
    seniorityFit: input.overallScore,
    industryFit: input.overallScore,
    compensationFit: input.overallScore,
    remoteFit: input.overallScore,
    relocationFit: input.overallScore,
    strongestMatches: [],
    concerns: [],
    aiExplanation: "",
    reviewedAt: null,
    createdAt: new Date("2026-05-01"),
    updatedAt: new Date("2026-05-02"),
    jobPosting: {
      id: "job_1",
      company: "Acme",
      title: "Senior Engineer",
      location: "Remote",
    },
    applications: [],
    jobSearchProfile: { name: "Senior Frontend" },
  };
}
