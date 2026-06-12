import { beforeEach, describe, expect, it, vi } from "vitest";
import { runJobFitScoringAgent } from "@/lib/agents/job-fit-scorer";
import { approveBestCapturedJobMatch } from "@/lib/applications/approval";
import { captureManualJob } from "@/lib/jobs/manual-capture";
import { appendLinkedInLeadQueriesToSearchBacklog, captureLinkedInReviewLead } from "@/lib/linkedin/job-leads";
import { createProfileFromZeroMatchCapture } from "@/lib/profiles/capture-profile-learning";
import { POST } from "./route";

vi.mock("@/lib/agents/job-fit-scorer", () => ({
  runJobFitScoringAgent: vi.fn(),
}));

vi.mock("@/lib/jobs/manual-capture", () => ({
  captureManualJob: vi.fn(),
}));

vi.mock("@/lib/linkedin/job-leads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/linkedin/job-leads")>();
  return {
    ...actual,
    appendLinkedInLeadQueriesToSearchBacklog: vi.fn(),
    captureLinkedInReviewLead: vi.fn(),
  };
});

vi.mock("@/lib/applications/approval", () => ({
  approveBestCapturedJobMatch: vi.fn(),
}));

vi.mock("@/lib/profiles/capture-profile-learning", () => ({
  createProfileFromZeroMatchCapture: vi.fn(),
}));

const captureManualJobMock = vi.mocked(captureManualJob);
const appendLinkedInLeadQueriesToSearchBacklogMock = vi.mocked(appendLinkedInLeadQueriesToSearchBacklog);
const captureLinkedInReviewLeadMock = vi.mocked(captureLinkedInReviewLead);
const approveBestCapturedJobMatchMock = vi.mocked(approveBestCapturedJobMatch);
const createProfileFromZeroMatchCaptureMock = vi.mocked(createProfileFromZeroMatchCapture);
const runJobFitScoringAgentMock = vi.mocked(runJobFitScoringAgent);

describe("/api/jobs/capture", () => {
  beforeEach(() => {
    runJobFitScoringAgentMock.mockReset();
    captureManualJobMock.mockReset();
    appendLinkedInLeadQueriesToSearchBacklogMock.mockReset();
    appendLinkedInLeadQueriesToSearchBacklogMock.mockResolvedValue(null);
    captureLinkedInReviewLeadMock.mockReset();
    approveBestCapturedJobMatchMock.mockReset();
    createProfileFromZeroMatchCaptureMock.mockReset();
    createProfileFromZeroMatchCaptureMock.mockResolvedValue({ created: false, profile: null, reason: "No profile needed." });
    approveBestCapturedJobMatchMock.mockResolvedValue(null);
    runJobFitScoringAgentMock.mockResolvedValue({
      output: { evaluationId: "eval_1", fitScore: 82, opportunityScore: 80, confidenceScore: 72 },
    } as unknown as Awaited<ReturnType<typeof runJobFitScoringAgent>>);
    vi.unstubAllEnvs();
  });

  it("captures a browser job payload through the manual capture service", async () => {
    captureManualJobMock.mockResolvedValue({
      job: { id: "job_1", company: "Acme", title: "Senior Frontend Engineer" },
      matches: [],
      created: true,
    } as unknown as Awaited<ReturnType<typeof captureManualJob>>);
    createProfileFromZeroMatchCaptureMock.mockResolvedValue({
      created: true,
      profile: { id: "profile_1", name: "AI-Native Enterprise Product Frontend" },
      reason: "Created from zero-match Chrome capture for Acme - Senior Frontend Engineer.",
    });

    const response = await POST(new Request("http://localhost/api/jobs/capture", {
      method: "POST",
      body: JSON.stringify({
        pageUrl: "https://acme.example/jobs/123",
        pageTitle: "Senior Frontend Engineer | Acme",
        company: "Acme",
        selectedText: "React TypeScript product UI role.",
      }),
    }));

    expect(captureManualJobMock).toHaveBeenCalledWith(expect.objectContaining({
      company: "Acme",
      title: "Senior Frontend Engineer",
      description: "React TypeScript product UI role.",
      pageUrl: "https://acme.example/jobs/123",
      sourceName: "Chrome Capture",
    }));
    expect(response.status).toBe(201);
    expect(createProfileFromZeroMatchCaptureMock).toHaveBeenCalledWith(expect.objectContaining({ id: "job_1" }));
    expect(runJobFitScoringAgentMock).toHaveBeenCalledWith({
      jobPostingId: "job_1",
      jobSearchProfileId: "profile_1",
    });
    expect(approveBestCapturedJobMatchMock).toHaveBeenCalledWith({ jobPostingId: "job_1" });
    await expect(response.json()).resolves.toMatchObject({
      job: { id: "job_1" },
      jobId: "job_1",
      jobUrl: "/jobs/job_1",
      initialMatchCount: 0,
      matchCount: 1,
      profileCreated: true,
      profileName: "AI-Native Enterprise Product Frontend",
      profileUrl: "/profiles",
      approved: false,
      application: null,
      applicationUrl: null,
      message: "Captured job from browser.",
    });
  });

  it("approves the persisted captured match and returns the application tracker", async () => {
    captureManualJobMock.mockResolvedValue({
      job: { id: "job_1", company: "Acme", title: "Senior Frontend Engineer" },
      matches: [{ id: "match_1" }],
      created: true,
    } as unknown as Awaited<ReturnType<typeof captureManualJob>>);
    approveBestCapturedJobMatchMock.mockResolvedValue({
      match: { id: "match_1" },
      application: { id: "app_1", status: "approved" },
    } as unknown as Awaited<ReturnType<typeof approveBestCapturedJobMatch>>);

    const response = await POST(new Request("http://localhost/api/jobs/capture", {
      method: "POST",
      body: JSON.stringify({
        pageUrl: "https://acme.example/jobs/123",
        pageTitle: "Senior Frontend Engineer | Acme",
        company: "Acme",
        selectedText: "React TypeScript product UI role.",
      }),
    }));

    expect(response.status).toBe(201);
    expect(approveBestCapturedJobMatchMock).toHaveBeenCalledWith({ jobPostingId: "job_1" });
    await expect(response.json()).resolves.toMatchObject({
      approved: true,
      application: { id: "app_1", status: "approved" },
      applicationUrl: "/applications/app_1",
    });
  });

  it("does not create a search profile when capture already matches an existing profile", async () => {
    captureManualJobMock.mockResolvedValue({
      job: { id: "job_1", company: "Acme", title: "Senior Frontend Engineer" },
      matches: [{ id: "match_1" }],
      created: true,
    } as unknown as Awaited<ReturnType<typeof captureManualJob>>);

    const response = await POST(new Request("http://localhost/api/jobs/capture", {
      method: "POST",
      body: JSON.stringify({
        pageUrl: "https://acme.example/jobs/123",
        pageTitle: "Senior Frontend Engineer | Acme",
        company: "Acme",
        selectedText: "React TypeScript product UI role.",
      }),
    }));

    expect(response.status).toBe(201);
    expect(createProfileFromZeroMatchCaptureMock).not.toHaveBeenCalled();
    expect(runJobFitScoringAgentMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      matchCount: 1,
      initialMatchCount: 1,
      profileCreated: false,
      profileName: null,
      profileUrl: null,
    });
  });

  it("returns a validation error for invalid URLs", async () => {
    const response = await POST(new Request("http://localhost/api/jobs/capture", {
      method: "POST",
      body: JSON.stringify({
        pageUrl: "not-a-url",
      }),
    }));

    expect(response.status).toBe(400);
    expect(captureManualJobMock).not.toHaveBeenCalled();
  });

  it("requires the optional browser extension token when configured", async () => {
    vi.stubEnv("BROWSER_EXTENSION_TOKEN", "local-token");

    const response = await POST(new Request("http://localhost/api/jobs/capture", {
      method: "POST",
      body: JSON.stringify({
        pageUrl: "https://acme.example/jobs/123",
      }),
    }));

    expect(response.status).toBe(401);
    expect(captureManualJobMock).not.toHaveBeenCalled();
  });

  it("marks detailed LinkedIn job captures as LinkedIn leads and queues original-posting queries", async () => {
    captureManualJobMock.mockResolvedValue({
      job: { id: "job_1", company: "Acme", title: "Senior Frontend Engineer" },
      matches: [{ id: "match_1" }],
      created: true,
    } as unknown as Awaited<ReturnType<typeof captureManualJob>>);

    const response = await POST(new Request("http://localhost/api/jobs/capture", {
      method: "POST",
      body: JSON.stringify({
        pageUrl: "https://www.linkedin.com/jobs/view/123456789",
        company: "Acme",
        title: "Senior Frontend Engineer",
        location: "Remote US",
        selectedText: "Acme is hiring a Senior Frontend Engineer for React TypeScript product UI work with accessibility ownership.",
      }),
    }));

    expect(captureManualJobMock).toHaveBeenCalledWith(expect.objectContaining({
      rawData: expect.objectContaining({
        leadSource: "linkedin",
        linkedInJobUrl: "https://www.linkedin.com/jobs/view/123456789",
        needsManualText: false,
        originalPostingQueries: expect.arrayContaining([
          expect.stringContaining("-site:linkedin.com"),
        ]),
      }),
    }));
    expect(appendLinkedInLeadQueriesToSearchBacklogMock).toHaveBeenCalledWith(expect.arrayContaining([
      expect.stringContaining('"Senior Frontend Engineer" "Acme"'),
    ]));
    await expect(response.json()).resolves.toMatchObject({
      leadSource: "linkedin",
      linkedInJobUrl: "https://www.linkedin.com/jobs/view/123456789",
      needsManualText: false,
    });
  });

  it("saves bare LinkedIn job URLs as review-only leads instead of scoring them", async () => {
    captureLinkedInReviewLeadMock.mockResolvedValue({
      job: { id: "job_lead_1", company: "LinkedIn lead", title: "LinkedIn job lead needs details" },
      created: true,
      metadata: {
        leadSource: "linkedin",
        linkedInJobUrl: "https://www.linkedin.com/jobs/view/987654321",
        needsManualText: true,
        originalPostingQueries: [],
      },
    } as unknown as Awaited<ReturnType<typeof captureLinkedInReviewLead>>);

    const response = await POST(new Request("http://localhost/api/jobs/capture", {
      method: "POST",
      body: JSON.stringify({
        pageUrl: "https://www.linkedin.com/jobs/view/987654321",
        pageTitle: "Software Engineer | LinkedIn",
      }),
    }));

    expect(response.status).toBe(202);
    expect(captureManualJobMock).not.toHaveBeenCalled();
    expect(approveBestCapturedJobMatchMock).not.toHaveBeenCalled();
    expect(captureLinkedInReviewLeadMock).toHaveBeenCalledWith(expect.objectContaining({
      pageUrl: "https://www.linkedin.com/jobs/view/987654321",
    }));
    await expect(response.json()).resolves.toMatchObject({
      jobId: "job_lead_1",
      leadSource: "linkedin",
      needsManualText: true,
      message: expect.stringContaining("Saved LinkedIn job lead for review"),
    });
  });
});
