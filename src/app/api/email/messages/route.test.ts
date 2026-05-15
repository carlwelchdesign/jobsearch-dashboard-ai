import { beforeEach, describe, expect, it, vi } from "vitest";
import { ingestJobEmail } from "@/lib/email-response-agent";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";

vi.mock("@/lib/email-response-agent", () => ({
  ingestJobEmail: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
    emailMessageRecord: {
      findMany: vi.fn(),
    },
  },
}));

const findUserMock = vi.mocked(prisma.user.findFirst);
const findMessagesMock = vi.mocked(prisma.emailMessageRecord.findMany);
const ingestJobEmailMock = vi.mocked(ingestJobEmail);

describe("/api/email/messages", () => {
  beforeEach(() => {
    findUserMock.mockReset();
    findMessagesMock.mockReset();
    ingestJobEmailMock.mockReset();
  });

  it("lists classified email messages for the current user", async () => {
    findUserMock.mockResolvedValue({ id: "user_1" } as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    findMessagesMock.mockResolvedValue([
      {
        id: "email_1",
        subject: "Interview request",
        classification: "INTERVIEW_REQUEST",
      },
    ] as Awaited<ReturnType<typeof prisma.emailMessageRecord.findMany>>);

    const response = await GET(new Request("http://localhost/api/email/messages?classification=INTERVIEW_REQUEST"));

    expect(findMessagesMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: "user_1",
        classification: "INTERVIEW_REQUEST",
      },
      take: 50,
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ messages: [{ id: "email_1" }] });
  });

  it("ingests an email message through the response agent", async () => {
    findUserMock.mockResolvedValue({ id: "user_1" } as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    ingestJobEmailMock.mockResolvedValue({
      email: { id: "email_1" },
      classification: {
        classification: "SCHEDULING_REQUEST",
        confidenceScore: 84,
        actionRequired: true,
        recommendedOutcome: "RECRUITER_SCREEN",
        rationale: "Detected interview or scheduling language.",
      },
      match: {
        applicationId: "app_1",
        jobPostingId: "job_1",
      },
    } as Awaited<ReturnType<typeof ingestJobEmail>>);

    const response = await POST(new Request("http://localhost/api/email/messages", {
      method: "POST",
      body: JSON.stringify({
        from: "recruiter@acme.com",
        subject: "Availability for next step",
        snippet: "Can you share availability to schedule a call?",
      }),
    }));

    expect(ingestJobEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1",
      provider: "manual",
      from: "recruiter@acme.com",
      subject: "Availability for next step",
    }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      email: { id: "email_1" },
      match: { applicationId: "app_1" },
    });
  });
});
