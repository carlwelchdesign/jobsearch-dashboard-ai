import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureSlackThreadReply, openSlackOpportunityRoom } from "@/lib/slack/opportunity-room";
import { postSlackMessage, logSlackAction } from "@/lib/slack/post";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/slack/post", () => ({
  postSlackMessage: vi.fn(),
  logSlackAction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    application: {
      findFirst: vi.fn(),
    },
    jobPosting: {
      findFirst: vi.fn(),
    },
    recruiterOutreach: {
      findMany: vi.fn(),
    },
    slackThreadLink: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const postSlackMessageMock = vi.mocked(postSlackMessage);
const logSlackActionMock = vi.mocked(logSlackAction);
const userFindFirstMock = vi.mocked(prisma.user.findFirst);
const userCountMock = vi.mocked(prisma.user.count);
const applicationFindFirstMock = vi.mocked(prisma.application.findFirst);
const jobPostingFindFirstMock = vi.mocked(prisma.jobPosting.findFirst);
const recruiterOutreachFindManyMock = vi.mocked(prisma.recruiterOutreach.findMany);
const slackThreadFindUniqueMock = vi.mocked(prisma.slackThreadLink.findUnique);
const slackThreadFindFirstMock = vi.mocked(prisma.slackThreadLink.findFirst);
const slackThreadCreateMock = vi.mocked(prisma.slackThreadLink.create);
const slackThreadUpdateMock = vi.mocked(prisma.slackThreadLink.update);

describe("Slack opportunity rooms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("JOB_SEARCH_OS_USER_ID", "");
    vi.stubEnv("SEED_USER_EMAIL", "");
    vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-token");
    vi.stubEnv("SLACK_APP_TOKEN", "xapp-token");
    vi.stubEnv("SLACK_OPS_CHANNEL_ID", "COPS");
    vi.stubEnv("SLACK_APPROVALS_CHANNEL_ID", "CAPPROVALS");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    userFindFirstMock.mockResolvedValue({ id: "user_1", email: "user@example.com" } as never);
    userCountMock.mockResolvedValue(1);
    applicationFindFirstMock.mockResolvedValue(null);
    recruiterOutreachFindManyMock.mockResolvedValue([]);
    slackThreadFindUniqueMock.mockResolvedValue(null);
    slackThreadUpdateMock.mockResolvedValue({ id: "thread_1" } as never);
    logSlackActionMock.mockResolvedValue({ id: "log_1" } as never);
  });

  it("creates a root thread and stores the app-owned mapping", async () => {
    jobPostingFindFirstMock.mockResolvedValue(jobRecord() as never);
    postSlackMessageMock
      .mockResolvedValueOnce({ status: "sent", channelId: "COPS", ts: "123.000" })
      .mockResolvedValueOnce({ status: "sent", channelId: "COPS", ts: "124.000" });
    slackThreadCreateMock.mockResolvedValue({
      id: "thread_1",
      userId: "user_1",
      entityType: "JOB",
      entityId: "job_1",
      channelId: "COPS",
      threadTs: "123.000",
    } as never);
    slackThreadFindUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "thread_1",
        userId: "user_1",
        entityType: "JOB",
        entityId: "job_1",
        channelId: "COPS",
        threadTs: "123.000",
      } as never);

    const result = await openSlackOpportunityRoom("job_1");

    expect(result.created).toBe(true);
    expect(postSlackMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      channel: "ops",
      payload: expect.objectContaining({ kind: "opportunity_room_root", entityType: "JOB", entityId: "job_1" }),
    }));
    expect(slackThreadCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "user_1", entityType: "JOB", entityId: "job_1", threadTs: "123.000" }),
    }));
    expect(postSlackMessageMock).toHaveBeenLastCalledWith(expect.objectContaining({ threadTs: "123.000" }));
  });

  it("captures trusted coach replies for mapped threads", async () => {
    slackThreadFindFirstMock.mockResolvedValue({
      id: "thread_1",
      userId: "user_1",
      entityType: "APPLICATION",
      entityId: "app_1",
      channelId: "COPS",
      threadTs: "123.000",
      status: "ACTIVE",
    } as never);

    const result = await captureSlackThreadReply({
      channelId: "COPS",
      threadTs: "123.000",
      messageTs: "124.000",
      slackUserId: "U_COACH",
      text: "This story needs stronger metrics.",
    });

    expect(result).toEqual({ captured: true, slackThreadLinkId: "thread_1" });
    expect(logSlackActionMock).toHaveBeenCalledWith(expect.objectContaining({
      subject: "Slack coach note captured",
      body: "This story needs stronger metrics.",
      payload: expect.objectContaining({ slackThreadLinkId: "thread_1", slackUserId: "U_COACH" }),
    }));
    expect(slackThreadUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "thread_1" } }));
  });
});

function jobRecord() {
  return {
    id: "job_1",
    title: "Staff Frontend Engineer",
    company: "Acme",
    location: "Remote",
    remoteType: "remote",
    salaryMin: 150000,
    salaryMax: 190000,
    salaryCurrency: "USD",
    applicationUrl: "https://jobs.example/apply",
    description: "Own the frontend platform and collaborate across product teams.",
    applications: [],
    matches: [
      {
        id: "match_1",
        overallScore: 93,
        recommendedAction: "APPLY_NOW",
        aiExplanation: "Strong frontend platform fit.",
        strongestMatches: ["React platform work"],
        concerns: ["Need compensation confirmation"],
      },
    ],
    recruiterOutreach: [],
  };
}
