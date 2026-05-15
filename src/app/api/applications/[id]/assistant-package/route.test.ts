import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateAutoSubmitEligibility } from "@/lib/applications/auto-submit-policy";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/applications/auto-submit-policy", () => ({
  evaluateAutoSubmitEligibility: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      findUnique: vi.fn(),
    },
  },
}));

const evaluateAutoSubmitEligibilityMock = vi.mocked(evaluateAutoSubmitEligibility);
const findApplicationMock = vi.mocked(prisma.application.findUnique);

describe("GET /api/applications/[id]/assistant-package", () => {
  beforeEach(() => {
    evaluateAutoSubmitEligibilityMock.mockReset();
    evaluateAutoSubmitEligibilityMock.mockResolvedValue({
      allowed: false,
      reasons: ["Auto-submit is disabled in settings."],
      effectiveAutoSubmitEnabled: false,
      override: null,
      settings: {
        autoSubmitEnabled: false,
        requireApprovedPacket: true,
        requireNoOpenUserRequests: true,
        requireFreshAssistantRun: true,
        maxRunAgeMinutes: 30,
        allowDemographicSubmission: false,
      },
    });
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
});
