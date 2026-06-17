import { beforeEach, describe, expect, it, vi } from "vitest";
import { runRecruitingSearchOptimization } from "@/lib/agents/recruiting-search-optimization";
import { requireSingleUser } from "@/lib/auth/single-user";
import { runJoleneChiefOfStaffAgent } from "@/lib/jolene/chief-of-staff";
import { runJoleneEmailOperationsAgent } from "@/lib/jolene/email-ops";
import { runJoleneOperatingLoopAgent } from "@/lib/jolene/operating-loop";
import { buildRunConfirmationModal, handleSlackRunModalSubmission, parseRunModalMetadata } from "@/lib/slack/modals";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth/single-user", () => ({
  requireSingleUser: vi.fn(),
}));

vi.mock("@/lib/jolene/chief-of-staff", () => ({
  runJoleneChiefOfStaffAgent: vi.fn(),
}));

vi.mock("@/lib/jolene/operating-loop", () => ({
  runJoleneOperatingLoopAgent: vi.fn(),
}));

vi.mock("@/lib/agents/recruiting-search-optimization", () => ({
  runRecruitingSearchOptimization: vi.fn(),
}));

vi.mock("@/lib/jolene/email-ops", () => ({
  runJoleneEmailOperationsAgent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentRunEvent: {
      create: vi.fn(),
    },
    notificationLog: {
      create: vi.fn(),
    },
  },
}));

const requireSingleUserMock = vi.mocked(requireSingleUser);
const runChiefMock = vi.mocked(runJoleneChiefOfStaffAgent);
const runLoopMock = vi.mocked(runJoleneOperatingLoopAgent);
const runSearchTeamMock = vi.mocked(runRecruitingSearchOptimization);
const runEmailOpsMock = vi.mocked(runJoleneEmailOperationsAgent);
const agentRunEventCreateMock = vi.mocked(prisma.agentRunEvent.create);
const notificationLogCreateMock = vi.mocked(prisma.notificationLog.create);

describe("Slack run confirmation modals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-token");
    vi.stubEnv("SLACK_APP_TOKEN", "xapp-token");
    vi.stubEnv("SLACK_OPS_CHANNEL_ID", "COPS");
    vi.stubEnv("SLACK_APPROVALS_CHANNEL_ID", "CAPPROVALS");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    requireSingleUserMock.mockResolvedValue({ id: "user_1" } as never);
    agentRunEventCreateMock.mockResolvedValue({ id: "event_1" } as never);
    notificationLogCreateMock.mockResolvedValue({ id: "log_1" } as never);
  });

  it("builds a confirmation modal with explicit external-action boundaries", () => {
    const modal = buildRunConfirmationModal("search-team");
    const metadata = parseRunModalMetadata(modal.private_metadata);
    const serialized = JSON.stringify(modal);

    expect(metadata).toEqual({ kind: "run_internal", command: "search-team" });
    expect(serialized).toContain("What Slack will not do");
    expect(serialized).toContain("submit applications");
  });

  it("runs Jolene through the existing service and audits the Slack decision", async () => {
    runChiefMock.mockResolvedValue({
      run: { id: "run_1" },
      output: { priorities: [{ id: "priority_1" }], approvalRequests: [{ proposalId: "proposal_1" }] },
    } as never);

    const result = await handleSlackRunModalSubmission({ command: "jolene", slackUserId: "U1" });

    expect(result).toMatchObject({ runId: "run_1", href: "http://localhost:3000/dashboard" });
    expect(runChiefMock).toHaveBeenCalledWith({ userId: "user_1", source: "chat" });
    expect(agentRunEventCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ agentRunId: "run_1", type: "slack_internal_run_started" }),
    }));
    expect(notificationLogCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "slack", status: "executed" }),
    }));
  });

  it("dispatches each supported internal run command", async () => {
    runLoopMock.mockResolvedValue({ run: { id: "run_loop" }, output: { recommendedActions: [] } } as never);
    runSearchTeamMock.mockResolvedValue({ run: { id: "run_search" }, output: { changes: [] } } as never);
    runEmailOpsMock.mockResolvedValue({ run: { id: "run_email" }, output: { scanned: 2, findingsCreated: 1, calendarDrafts: 0 } } as never);

    await handleSlackRunModalSubmission({ command: "loop", slackUserId: "U1" });
    await handleSlackRunModalSubmission({ command: "search-team", slackUserId: "U1" });
    await handleSlackRunModalSubmission({ command: "email-ops", slackUserId: "U1" });

    expect(runLoopMock).toHaveBeenCalledWith({ userId: "user_1", source: "chat" });
    expect(runSearchTeamMock).toHaveBeenCalledWith({ userId: "user_1", mode: "active" });
    expect(runEmailOpsMock).toHaveBeenCalledWith({ userId: "user_1", source: "chat" });
  });

  it("rejects unauthorized Slack users before starting internal work", async () => {
    vi.stubEnv("SLACK_ALLOWED_USER_IDS", "U_ALLOWED");

    await expect(handleSlackRunModalSubmission({ command: "jolene", slackUserId: "U_BLOCKED" }))
      .rejects.toThrow("not allowed");

    expect(runChiefMock).not.toHaveBeenCalled();
  });
});
