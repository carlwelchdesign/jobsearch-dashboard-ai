import { beforeEach, describe, expect, it, vi } from "vitest";
import { createThankYouDraft } from "@/lib/applications/thank-you-drafts";
import { POST } from "./route";

vi.mock("@/lib/applications/thank-you-drafts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/applications/thank-you-drafts")>()),
  createThankYouDraft: vi.fn(),
}));

const createThankYouDraftMock = vi.mocked(createThankYouDraft);

describe("POST /api/applications/[id]/thank-you-drafts", () => {
  beforeEach(() => {
    createThankYouDraftMock.mockReset();
  });

  it("creates a thank-you draft for a valid application", async () => {
    createThankYouDraftMock.mockResolvedValue({
      draft: {
        id: "draft_1",
        applicationId: "app_1",
        stage: "recruiter_screen",
        interviewerName: "Lavanya Shahani",
        emailSubject: "Thank you - Amplitude recruiter screen",
        emailBody: "Hi Lavanya,",
        linkedinBody: "Hi Lavanya, thank you.",
      },
      message: "Thank-you drafts created. Review and send manually.",
    } as Awaited<ReturnType<typeof createThankYouDraft>>);

    const response = await POST(new Request("http://localhost/api/applications/app_1/thank-you-drafts", {
      method: "POST",
      body: JSON.stringify({
        stage: "recruiter_screen",
        interviewerName: "Lavanya Shahani",
        interviewerTitle: "Principal Technical Recruiter / Talent Advisor",
        interviewerLinkedin: "https://www.linkedin.com/in/lavanyashahani/",
        interviewDate: "2026-06-03",
        notes: "First interview today.",
        tone: "professional",
      }),
    }), { params: { id: "app_1" } });

    expect(createThankYouDraftMock).toHaveBeenCalledWith({
      applicationId: "app_1",
      stage: "recruiter_screen",
      interviewerName: "Lavanya Shahani",
      interviewerTitle: "Principal Technical Recruiter / Talent Advisor",
      interviewerLinkedin: "https://www.linkedin.com/in/lavanyashahani/",
      interviewDate: new Date("2026-06-03T12:00:00.000Z"),
      notes: "First interview today.",
      tone: "professional",
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      draft: { id: "draft_1", stage: "recruiter_screen" },
      message: "Thank-you drafts created. Review and send manually.",
    });
  });

  it("rejects missing interviewer name before writing", async () => {
    const response = await POST(new Request("http://localhost/api/applications/app_1/thank-you-drafts", {
      method: "POST",
      body: JSON.stringify({ stage: "recruiter_screen", interviewerName: "" }),
    }), { params: { id: "app_1" } });

    expect(createThankYouDraftMock).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Interviewer name is required");
  });

  it("rejects invalid stages before writing", async () => {
    const response = await POST(new Request("http://localhost/api/applications/app_1/thank-you-drafts", {
      method: "POST",
      body: JSON.stringify({ stage: "coffee_chat", interviewerName: "Lavanya Shahani" }),
    }), { params: { id: "app_1" } });

    expect(createThankYouDraftMock).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Invalid enum value");
  });

  it("surfaces nonexistent application failures as a bad request", async () => {
    createThankYouDraftMock.mockRejectedValue(new Error("Application not found for thank-you draft."));

    const response = await POST(new Request("http://localhost/api/applications/missing/thank-you-drafts", {
      method: "POST",
      body: JSON.stringify({ stage: "recruiter_screen", interviewerName: "Lavanya Shahani" }),
    }), { params: { id: "missing" } });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Application not found for thank-you draft." });
  });
});
