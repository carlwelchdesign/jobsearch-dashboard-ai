import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleSlackAction } from "@/lib/slack/actions";
import { actionValue, SLACK_ACTIONS } from "@/lib/slack/blocks";
import { approveJoleneDelegatedWork } from "@/lib/jolene/chief-of-staff";
import { approveJoleneOperatingLoopActions } from "@/lib/jolene/operating-loop";
import { applySearchProfileChange, rollbackSearchProfileChange } from "@/lib/agents/recruiting-search-optimization";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/jolene/chief-of-staff", () => ({
  approveJoleneDelegatedWork: vi.fn(),
}));

vi.mock("@/lib/jolene/operating-loop", () => ({
  approveJoleneOperatingLoopActions: vi.fn(),
}));

vi.mock("@/lib/agents/recruiting-search-optimization", () => ({
  applySearchProfileChange: vi.fn(),
  rollbackSearchProfileChange: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    agentRun: {
      findFirst: vi.fn(),
    },
    searchProfileChange: {
      findFirst: vi.fn(),
    },
    searchOptimizationRun: {
      findFirst: vi.fn(),
    },
    application: {
      findFirst: vi.fn(),
    },
    linkedInPostDraft: {
      findFirst: vi.fn(),
    },
    interviewPrepTask: {
      findFirst: vi.fn(),
    },
    recruiterOutreach: {
      findFirst: vi.fn(),
    },
    jobProfileMatch: {
      findFirst: vi.fn(),
    },
    agentRunEvent: {
      create: vi.fn(),
    },
    notificationLog: {
      create: vi.fn(),
    },
  },
}));

const userFindFirstMock = vi.mocked(prisma.user.findFirst);
const userFindUniqueMock = vi.mocked(prisma.user.findUnique);
const userCountMock = vi.mocked(prisma.user.count);
const agentRunFindFirstMock = vi.mocked(prisma.agentRun.findFirst);
const searchProfileChangeFindFirstMock = vi.mocked(prisma.searchProfileChange.findFirst);
const applicationFindFirstMock = vi.mocked(prisma.application.findFirst);
const agentRunEventCreateMock = vi.mocked(prisma.agentRunEvent.create);
const notificationLogCreateMock = vi.mocked(prisma.notificationLog.create);
const approveChiefMock = vi.mocked(approveJoleneDelegatedWork);
const approveLoopMock = vi.mocked(approveJoleneOperatingLoopActions);
const applyChangeMock = vi.mocked(applySearchProfileChange);
const rollbackChangeMock = vi.mocked(rollbackSearchProfileChange);

describe("Slack action handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("JOB_SEARCH_OS_USER_ID", "");
    vi.stubEnv("SEED_USER_EMAIL", "");
    vi.stubEnv("SLACK_BOT_TOKEN", "");
    vi.stubEnv("SLACK_APP_TOKEN", "");
    vi.stubEnv("SLACK_OPS_CHANNEL_ID", "");
    vi.stubEnv("SLACK_APPROVALS_CHANNEL_ID", "");
    vi.stubEnv("SLACK_ALLOWED_USER_IDS", "");
    vi.stubEnv("SLACK_COACH_USER_IDS", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("JOB_SEARCH_OS_APP_URL", "");
    userFindFirstMock.mockResolvedValue({ id: "user_1", email: "user@example.com" } as never);
    userFindUniqueMock.mockResolvedValue({ id: "user_1", email: "user@example.com" } as never);
    userCountMock.mockResolvedValue(1);
    agentRunFindFirstMock.mockResolvedValue({ userId: "user_1" } as never);
    notificationLogCreateMock.mockResolvedValue({ id: "log_1" } as never);
    agentRunEventCreateMock.mockResolvedValue({ id: "event_1" } as never);
  });

  it("approves Jolene delegated work through the existing service", async () => {
    approveChiefMock.mockResolvedValue({ runId: "run_1", executed: [], message: "Jolene executed 1 delegated action." } as never);

    const result = await handleSlackAction({
      actionId: SLACK_ACTIONS.approveChiefProposal,
      value: actionValue({ kind: "chief_proposal", runId: "run_1", proposalId: "proposal_1" }),
      slackUserId: "U1",
    });

    expect(result).toEqual({ ok: true, message: "Jolene executed 1 delegated action." });
    expect(agentRunFindFirstMock).toHaveBeenCalledWith({
      where: { id: "run_1", agentType: "JOLENE_CHIEF_OF_STAFF", status: "COMPLETED" },
      select: { userId: true },
    });
    expect(approveChiefMock).toHaveBeenCalledWith({ userId: "user_1", runId: "run_1", proposalIds: ["proposal_1"] });
    expect(notificationLogCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "slack", status: "executed" }),
    }));
  });

  it("approves operating loop work through the existing service", async () => {
    approveLoopMock.mockResolvedValue({ runId: "run_2", executed: [], message: "Jolene Operating Loop executed 1 action." } as never);

    const result = await handleSlackAction({
      actionId: SLACK_ACTIONS.approveOperatingLoopProposal,
      value: actionValue({ kind: "operating_loop_proposal", runId: "run_2", proposalId: "proposal_2" }),
      slackUserId: "U1",
    });

    expect(result.message).toBe("Jolene Operating Loop executed 1 action.");
    expect(agentRunFindFirstMock).toHaveBeenCalledWith({
      where: { id: "run_2", agentType: "JOLENE_OPERATING_LOOP", status: "COMPLETED" },
      select: { userId: true },
    });
    expect(approveLoopMock).toHaveBeenCalledWith({ userId: "user_1", runId: "run_2", proposalIds: ["proposal_2"] });
  });

  it("approves operating loop work for the run owner even when env resolves another user", async () => {
    vi.stubEnv("SEED_USER_EMAIL", "other@example.com");
    userFindUniqueMock.mockResolvedValue({ id: "env_user", email: "other@example.com" } as never);
    agentRunFindFirstMock.mockResolvedValue({ userId: "run_owner" } as never);
    approveLoopMock.mockResolvedValue({ runId: "run_2", executed: [], message: "Jolene Operating Loop executed 1 action." } as never);

    await handleSlackAction({
      actionId: SLACK_ACTIONS.approveOperatingLoopProposal,
      value: actionValue({ kind: "operating_loop_proposal", runId: "run_2", proposalId: "proposal_2" }),
      slackUserId: "U1",
    });

    expect(approveLoopMock).toHaveBeenCalledWith({ userId: "run_owner", runId: "run_2", proposalIds: ["proposal_2"] });
    expect(userFindUniqueMock).not.toHaveBeenCalled();
  });

  it("rejects high-risk search profile changes from Slack", async () => {
    searchProfileChangeFindFirstMock.mockResolvedValue({
      id: "change_1",
      userId: "user_1",
      riskLevel: "HIGH",
      status: "REVIEW_ONLY",
      agentRunId: "run_1",
    } as never);

    await expect(handleSlackAction({
      actionId: SLACK_ACTIONS.applySearchProfileChange,
      value: actionValue({ kind: "apply_search_profile_change", changeId: "change_1" }),
      slackUserId: "U1",
    })).rejects.toThrow("Only low-risk");
    expect(applyChangeMock).not.toHaveBeenCalled();
  });

  it("applies and audits low-risk search profile changes", async () => {
    searchProfileChangeFindFirstMock.mockResolvedValue({
      id: "change_1",
      userId: "user_1",
      riskLevel: "LOW",
      status: "REVIEW_ONLY",
      agentRunId: "run_1",
    } as never);
    applyChangeMock.mockResolvedValue({ id: "change_1" } as never);

    const result = await handleSlackAction({
      actionId: SLACK_ACTIONS.applySearchProfileChange,
      value: actionValue({ kind: "apply_search_profile_change", changeId: "change_1" }),
      slackUserId: "U1",
    });

    expect(result.message).toBe("Search profile change applied.");
    expect(agentRunEventCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "slack_search_profile_change_applied" }),
    }));
  });

  it("rejects rollback when the search profile change is not applied", async () => {
    searchProfileChangeFindFirstMock.mockResolvedValue({
      id: "change_1",
      userId: "user_1",
      status: "REVIEW_ONLY",
      agentRunId: "run_1",
    } as never);

    await expect(handleSlackAction({
      actionId: SLACK_ACTIONS.rollbackSearchProfileChange,
      value: actionValue({ kind: "rollback_search_profile_change", changeId: "change_1" }),
      slackUserId: "U1",
    })).rejects.toThrow("Only applied");
    expect(rollbackChangeMock).not.toHaveBeenCalled();
  });

  it("records V3 needs-evidence intent without mutating app state", async () => {
    vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-token");
    vi.stubEnv("SLACK_APP_TOKEN", "xapp-token");
    vi.stubEnv("SLACK_OPS_CHANNEL_ID", "COPS");
    vi.stubEnv("SLACK_APPROVALS_CHANNEL_ID", "CAPPROVALS");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    applicationFindFirstMock.mockResolvedValue({ userId: "user_1" } as never);

    const result = await handleSlackAction({
      actionId: SLACK_ACTIONS.needsEvidence,
      value: actionValue({ kind: "needs_evidence", entityType: "application", entityId: "app_1", agentRunId: "run_1" }),
      slackUserId: "U1",
    });

    expect(result.message).toContain("request for more evidence");
    expect(agentRunEventCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ agentRunId: "run_1", type: "slack_needs_evidence" }),
    }));
    expect(notificationLogCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ subject: "Slack requested more evidence", status: "executed" }),
    }));
  });

  it("allows coach users to record coach-note intent but not approve actions", async () => {
    vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-token");
    vi.stubEnv("SLACK_APP_TOKEN", "xapp-token");
    vi.stubEnv("SLACK_OPS_CHANNEL_ID", "COPS");
    vi.stubEnv("SLACK_APPROVALS_CHANNEL_ID", "CAPPROVALS");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("SLACK_ALLOWED_USER_IDS", "U_ALLOWED");
    vi.stubEnv("SLACK_COACH_USER_IDS", "U_COACH");
    applicationFindFirstMock.mockResolvedValue({ userId: "user_1" } as never);

    await expect(handleSlackAction({
      actionId: SLACK_ACTIONS.captureCoachNote,
      value: actionValue({ kind: "capture_coach_note", entityType: "application", entityId: "app_1" }),
      slackUserId: "U_COACH",
    })).resolves.toEqual(expect.objectContaining({ ok: true }));

    await expect(handleSlackAction({
      actionId: SLACK_ACTIONS.needsEvidence,
      value: actionValue({ kind: "needs_evidence", entityType: "application", entityId: "app_1" }),
      slackUserId: "U_COACH",
    })).rejects.toThrow("not allowed");
  });
});
