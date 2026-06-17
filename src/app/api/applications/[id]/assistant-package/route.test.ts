import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateAutoSubmitEligibility } from "@/lib/applications/auto-submit-policy";
import { findActiveFieldMemories } from "@/lib/applications/field-learning";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/applications/auto-submit-policy", () => ({
  evaluateAutoSubmitEligibility: vi.fn(),
}));

vi.mock("@/lib/applications/field-learning", () => ({
  fieldMemoryForAssistant: vi.fn((memory) => memory),
  findActiveFieldMemories: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      findUnique: vi.fn(),
    },
  },
}));

const evaluateAutoSubmitEligibilityMock = vi.mocked(evaluateAutoSubmitEligibility);
const findFieldMemoriesMock = vi.mocked(findActiveFieldMemories);
const findApplicationMock = vi.mocked(prisma.application.findUnique);

describe("GET /api/applications/[id]/assistant-package", () => {
  beforeEach(() => {
    evaluateAutoSubmitEligibilityMock.mockReset();
    evaluateAutoSubmitEligibilityMock.mockResolvedValue({
      allowed: false,
      reasons: ["Auto-submit is disabled in settings."],
      effectiveAutoSubmitEnabled: false,
      override: null,
      companyPolicy: null,
      settings: {
        autoSubmitEnabled: false,
        requireApprovedPacket: true,
        requireNoOpenUserRequests: true,
        requireFreshAssistantRun: true,
        maxRunAgeMinutes: 30,
        allowDemographicSubmission: false,
      },
    });
    findFieldMemoriesMock.mockReset();
    findFieldMemoriesMock.mockResolvedValue([]);
    findApplicationMock.mockReset();
  });

  it("requires an existing application", async () => {
    findApplicationMock.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/applications/app_1/assistant-package"), {
      params: { id: "app_1" },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Application not found." });
  });

  it("requires the application to be ready before assisted form filling", async () => {
    findApplicationMock.mockResolvedValue({
      status: "approved",
      jobPosting: { applicationUrl: "https://example.com/apply" },
      resume: { id: "resume_1" },
      coverLetter: { id: "letter_1" },
      user: { profile: null },
      applicationPackets: [],
    } as unknown as Awaited<ReturnType<typeof prisma.application.findUnique>>);

    const response = await GET(new Request("http://localhost/api/applications/app_1/assistant-package"), {
      params: { id: "app_1" },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Application must be ready_to_apply before assisted form filling.",
    });
  });

  it("requires generated materials before assisted form filling", async () => {
    findApplicationMock.mockResolvedValue({
      status: "ready_to_apply",
      jobPosting: { applicationUrl: "https://example.com/apply" },
      resume: null,
      coverLetter: { id: "letter_1" },
      user: { profile: null },
      applicationPackets: [],
    } as unknown as Awaited<ReturnType<typeof prisma.application.findUnique>>);

    const response = await GET(new Request("http://localhost/api/applications/app_1/assistant-package"), {
      params: { id: "app_1" },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "A generated resume and cover letter are required before assisted form filling.",
    });
  });

  it("requires a direct application URL before assisted form filling", async () => {
    findApplicationMock.mockResolvedValue({
      status: "ready_to_apply",
      jobPosting: { applicationUrl: "https://wellfound.com/jobs/123" },
      resume: { id: "resume_1" },
      coverLetter: { id: "letter_1" },
      user: { profile: null },
      applicationPackets: [],
    } as unknown as Awaited<ReturnType<typeof prisma.application.findUnique>>);

    const response = await GET(new Request("http://localhost/api/applications/app_1/assistant-package"), {
      params: { id: "app_1" },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Direct application URL required"),
      applicationUrlQuality: expect.objectContaining({
        launchable: false,
        kind: "auth_or_paywall",
      }),
    });
  });

  it("exports selected application answers with the local assistant package", async () => {
    findApplicationMock.mockResolvedValue({
      id: "app_1",
      status: "ready_to_apply",
      notes: "Review before submit.",
      jobPosting: {
        id: "job_1",
        company: "Linear",
        title: "Senior Frontend Engineer",
        applicationUrl: "https://linear.app/apply",
        atsProvider: "greenhouse",
      },
      resume: { id: "resume_1" },
      coverLetter: { id: "letter_1", body: "Cover letter body." },
      user: {
        email: "candidate@example.com",
        name: "Carl Welch",
        profile: {
          fullName: "Carl Welch",
          email: "candidate@example.com",
          phone: "555-0100",
          location: "Remote",
          linkedinUrl: "https://linkedin.example/carl",
          githubUrl: "https://github.example/carl",
          portfolioUrl: "https://portfolio.example",
          raceAnswer: "",
          genderAnswer: "",
          veteranStatusAnswer: "",
          disabilityAnswer: "",
        },
      },
      applicationPackets: [
        {
          id: "packet_1",
          applicationAnswersJson: [
            {
              question: "How did you find this role?",
              selectedOptionIndex: 0,
              selectedAt: "2026-05-15T00:00:00.000Z",
              options: [
                {
                  title: "Source",
                  answer: "I found it through a personal job discovery tool that monitors curated company career pages.",
                  evidence: ["Company source list"],
                  tone: "direct",
                  cautions: [],
                },
              ],
            },
            {
              question: "Unselected question",
              options: [
                {
                  title: "Ignore",
                  answer: "This should not export.",
                  evidence: [],
                  tone: "brief",
                  cautions: [],
                },
              ],
            },
          ],
        },
      ],
    } as unknown as Awaited<ReturnType<typeof prisma.application.findUnique>>);

    const response = await GET(new Request("http://localhost/api/applications/app_1/assistant-package"), {
      params: { id: "app_1" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.application.packetId).toBe("packet_1");
    expect(body.job.applicationHost).toBe("linear.app");
    expect(body.learning.fieldMemories).toEqual([]);
    expect(body.workflow.fieldAnswerUrl).toBe("http://localhost/api/applications/app_1/field-answer");
    expect(body.ashbyRisk).toBeNull();
    expect(findFieldMemoriesMock).toHaveBeenCalledWith(expect.objectContaining({
      atsProvider: "greenhouse",
      host: "linear.app",
    }));
    expect(body.materials.selectedApplicationAnswers).toEqual([
      {
        question: "How did you find this role?",
        title: "Source",
        answer: "I found it through a personal job discovery tool that monitors curated company career pages.",
        evidence: ["Company source list"],
        cautions: [],
        selectedAt: "2026-05-15T00:00:00.000Z",
      },
    ]);
    expect(body.safety.manualSubmitRequired).toBe(true);
  });

  it("forces Ashby packages into normal-browser manual submit mode", async () => {
    evaluateAutoSubmitEligibilityMock.mockResolvedValueOnce({
      allowed: true,
      reasons: [],
      effectiveAutoSubmitEnabled: true,
      override: null,
      companyPolicy: null,
      settings: {
        autoSubmitEnabled: true,
        requireApprovedPacket: true,
        requireNoOpenUserRequests: true,
        requireFreshAssistantRun: true,
        maxRunAgeMinutes: 30,
        allowDemographicSubmission: false,
      },
    });
    findApplicationMock.mockResolvedValue({
      id: "app_ashby",
      userId: "user_1",
      status: "ready_to_apply",
      notes: null,
      jobPosting: {
        id: "job_ashby",
        company: "Ashby Co",
        title: "Frontend Engineer",
        applicationUrl: "https://jobs.ashbyhq.com/acme/123",
        atsProvider: "ashby",
        description: "Build React and TypeScript product interfaces. 8+ years of experience preferred.",
        location: "Remote US",
        country: "United States",
        remoteType: "remote",
      },
      resume: { id: "resume_1", plainText: "Senior Frontend Engineer with React, TypeScript, SaaS, and dashboards.", markdown: "" },
      coverLetter: { id: "letter_1", body: "Cover letter body." },
      user: {
        email: "candidate@example.com",
        name: "Carl Welch",
        profile: {
          fullName: "Carl Welch",
          email: "candidate@example.com",
          phone: "",
          location: "Los Angeles, CA, United States",
          linkedinUrl: "",
          githubUrl: "",
          portfolioUrl: "",
          raceAnswer: "",
          genderAnswer: "",
          veteranStatusAnswer: "",
          disabilityAnswer: "",
          yearsExperience: 20,
        },
      },
      applicationPackets: [],
    } as unknown as Awaited<ReturnType<typeof prisma.application.findUnique>>);

    const response = await GET(new Request("http://localhost/api/applications/app_ashby/assistant-package"), {
      params: { id: "app_ashby" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.safety.autoSubmitAllowed).toBe(false);
    expect(body.safety.manualSubmitRequired).toBe(true);
    expect(body.safety.normalBrowserRecommended).toBe(true);
    expect(body.safety.autoSubmitReasons).toEqual([
      "Ashby applications use normal Chrome assisted fill with manual final submit to avoid anti-fraud friction.",
    ]);
    expect(body.ashbyRisk).toMatchObject({
      enabled: true,
      atsProvider: "ashby",
      checklist: expect.arrayContaining([
        expect.objectContaining({ category: "work_authorization", status: "ready", suggestedAnswer: "Yes" }),
        expect.objectContaining({ category: "sponsorship", status: "ready", suggestedAnswer: "No" }),
        expect.objectContaining({ category: "required_experience", status: "ready", suggestedAnswer: "20" }),
      ]),
    });
  });
});
