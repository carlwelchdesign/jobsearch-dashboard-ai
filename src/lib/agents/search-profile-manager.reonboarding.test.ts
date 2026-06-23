import { beforeEach, describe, expect, it, vi } from "vitest";
import { suggestSearchProfiles } from "@/lib/ai/profile-suggestions";
import { runAgent } from "@/lib/agents/run-agent";
import { prisma } from "@/lib/prisma";
import { runSearchProfileManagerAgent } from "./search-profile-manager";

vi.mock("@/lib/agents/run-agent", () => ({
  runAgent: vi.fn(async ({ input, execute }) => ({
    run: { id: "run_search_profile_manager", inputJson: input, status: "COMPLETED" },
    output: await execute({ id: "run_search_profile_manager" }),
  })),
}));

vi.mock("@/lib/ai/profile-suggestions", () => ({
  suggestSearchProfiles: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: { findMany: vi.fn() },
    jobSearchProfile: { findMany: vi.fn() },
    searchProfilePerformance: { createMany: vi.fn() },
    userProfile: { findFirst: vi.fn() },
  },
}));

const runAgentMock = vi.mocked(runAgent);
const suggestSearchProfilesMock = vi.mocked(suggestSearchProfiles);

describe("runSearchProfileManagerAgent resume re-onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.searchProfilePerformance.createMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.application.findMany).mockResolvedValue([]);
  });

  it("returns reviewable suggested profiles without creating them", async () => {
    vi.mocked(prisma.jobSearchProfile.findMany)
      .mockResolvedValueOnce([
        {
          id: "profile_1",
          name: "Frontend Platform / Design Systems",
          enabled: true,
          titles: ["Senior Frontend Engineer"],
          keywordsRequired: [],
          keywordsPreferred: ["React"],
          industries: [],
          matches: [],
        },
      ] as unknown as Awaited<ReturnType<typeof prisma.jobSearchProfile.findMany>>)
      .mockResolvedValueOnce([
        { name: "Frontend Platform / Design Systems" },
      ] as Awaited<ReturnType<typeof prisma.jobSearchProfile.findMany>>);
    vi.mocked(prisma.userProfile.findFirst).mockResolvedValue({
      id: "candidate_1",
      experienceBullets: [{ id: "bullet_1", sourceResumeUploadId: "upload_1", text: "Built React systems." }],
      workExperiences: [{ id: "work_1", sourceResumeUploadId: "upload_1", company: "Yubico", title: "Senior Software Engineer" }],
      projects: [],
      githubRepositories: [],
    } as unknown as Awaited<ReturnType<typeof prisma.userProfile.findFirst>>);
    suggestSearchProfilesMock.mockResolvedValue([
      {
        name: "Frontend Platform / Design Systems",
        searchIntent: "industry_specific",
        remotePreference: "remote_us_only",
        relocationPreference: "unknown",
        titles: ["Staff Frontend Engineer"],
        jobTypes: ["frontend"],
        countries: ["United States"],
        salaryCurrency: "USD",
        salaryMin: 175000,
        industries: ["SaaS"],
        keywordsRequired: [],
        keywordsPreferred: ["React", "Storybook"],
        keywordsExcluded: [],
        excludedCompanies: [],
        minimumMatchScore: 76,
        rationale: "Strong frontend platform evidence.",
        evidence: ["Built React systems."],
        githubEvidence: [],
      },
    ]);

    const result = await runSearchProfileManagerAgent({
      userId: "user_1",
      mode: "resume_reonboarding",
      resumeUploadId: "upload_1",
      candidateProfileId: "candidate_1",
    });

    expect(runAgentMock).toHaveBeenCalledWith(expect.objectContaining({
      agentType: "SEARCH_PROFILE_MANAGER",
      input: expect.objectContaining({ mode: "resume_reonboarding", resumeUploadId: "upload_1" }),
    }));
    expect(result.output.suggestedProfiles).toEqual([
      expect.objectContaining({
        name: "Frontend Platform / Design Systems",
        alreadyExists: true,
      }),
    ]);
    expect(suggestSearchProfilesMock).toHaveBeenCalledWith(expect.objectContaining({
      bullets: [expect.objectContaining({ sourceResumeUploadId: "upload_1" })],
      workExperiences: [expect.objectContaining({ sourceResumeUploadId: "upload_1" })],
    }));
  });
});
