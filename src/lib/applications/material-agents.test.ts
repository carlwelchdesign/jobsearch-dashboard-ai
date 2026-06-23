import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachAtsResumeReview } from "@/lib/applications/material-agents";
import { runAtsResumeReviewerAgent } from "@/lib/agents/ats-resume-reviewer";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/agents/application-qa", () => ({
  runApplicationQaAgent: vi.fn(),
}));

vi.mock("@/lib/agents/resume-strategy", () => ({
  runResumeStrategyAgent: vi.fn(),
}));

vi.mock("@/lib/agents/ats-resume-reviewer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/ats-resume-reviewer")>();
  return {
    ...actual,
    runAtsResumeReviewerAgent: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    generatedResume: {
      update: vi.fn(),
    },
  },
}));

const runReviewMock = vi.mocked(runAtsResumeReviewerAgent);
const updateMock = vi.mocked(prisma.generatedResume.update);

describe("attachAtsResumeReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-reviews an automatically rewritten resume and stores the final review", async () => {
    const resume = generatedResume({
      markdown: "# Carl\nOld",
      plainText: "Carl\nOld",
      html: "<pre>Carl\nOld</pre>",
      atsChecks: { score: 76 },
      generationNotes: { generatedBy: "test" },
    });
    runReviewMock.mockResolvedValueOnce({
      run: {} as Awaited<ReturnType<typeof runAtsResumeReviewerAgent>>["run"],
      output: {
        status: "NEEDS_REVIEW",
        atsScore: 88,
        recruiterScore: 72,
        keywordCoverage: { matched: ["React"], missingImportant: [], overused: [] },
        formatWarnings: [],
        recruiterRedFlags: ["Repeated action verbs: built (4)."],
        evidenceRisks: [],
        recommendedEdits: ["Vary repeated bullet openers."],
        rewriteDecision: { applied: true, reason: "Clear issue fixed.", confidence: 0.9 },
        rewrittenMarkdown: "# Carl\nNew",
        rewrittenPlainText: "Carl\nNew",
        summaryReview: "Summary OK.",
        experienceReview: "Experience OK.",
        skillsReview: "Skills OK.",
        finalRecommendation: "Review.",
        confidence: 0.84,
      },
    }).mockResolvedValueOnce({
      run: {} as Awaited<ReturnType<typeof runAtsResumeReviewerAgent>>["run"],
      output: {
        status: "PASS",
        atsScore: 96,
        recruiterScore: 94,
        keywordCoverage: { matched: ["React"], missingImportant: [], overused: [] },
        formatWarnings: [],
        recruiterRedFlags: [],
        evidenceRisks: [],
        recommendedEdits: [],
        rewriteDecision: { applied: false, reason: null, confidence: 0.54 },
        summaryReview: "Summary OK.",
        experienceReview: "Experience OK.",
        skillsReview: "Skills OK.",
        finalRecommendation: "Ready.",
        confidence: 0.84,
      },
    });
    (updateMock as unknown as { mockImplementation: (implementation: (args: { data: Record<string, unknown> }) => Promise<unknown>) => void }).mockImplementation(
      async (args) => ({ ...resume, ...args.data }),
    );

    const result = await attachAtsResumeReview({ resume, userId: "user_1" });

    expect(runReviewMock).toHaveBeenCalledTimes(2);
    expect(result.review?.status).toBe("PASS");
    expect(result.review?.rewriteDecision.applied).toBe(false);
    expect(updateMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: "resume_1" },
      data: expect.objectContaining({
        markdown: "# Carl\nNew",
        plainText: "Carl\nNew",
        html: "<pre>Carl\nNew</pre>",
        generationNotes: expect.objectContaining({
          generatedBy: "test",
          atsResumeReviewInProgress: expect.objectContaining({
            attempts: [
              expect.objectContaining({
                status: "NEEDS_REVIEW",
                rewriteApplied: true,
                recruiterRedFlags: ["Repeated action verbs: built (4)."],
              }),
            ],
          }),
        }),
      }),
    }));
    expect(updateMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: "resume_1" },
      data: expect.objectContaining({
        generationNotes: expect.objectContaining({
          generatedBy: "test",
          atsResumeReview: expect.objectContaining({
            status: "PASS",
            recruiterRedFlags: [],
            original: expect.objectContaining({ markdown: "# Carl\nOld" }),
            attempts: [
              expect.objectContaining({
                status: "NEEDS_REVIEW",
                rewriteApplied: true,
                recruiterRedFlags: ["Repeated action verbs: built (4)."],
              }),
              expect.objectContaining({
                status: "PASS",
                rewriteApplied: false,
                recruiterRedFlags: [],
              }),
            ],
          }),
        }),
      }),
    }));
  });
});

function generatedResume(patch: Record<string, unknown>) {
  const now = new Date("2026-06-23T12:00:00Z");
  return {
    id: "resume_1",
    userId: "user_1",
    jobPostingId: "job_1",
    jobProfileMatchId: "match_1",
    resumeUploadId: null,
    markdown: "# Carl",
    html: null,
    pdfUrl: null,
    plainText: "Carl",
    version: 1,
    selectedBulletIds: [],
    keywordAlignment: {},
    generationNotes: {},
    atsChecks: {},
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}
