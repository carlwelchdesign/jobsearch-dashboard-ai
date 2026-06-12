import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAssistantRunFeedback, updateApplicationAutomationRunFromLog } from "@/lib/applications/automation-runs";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("fs", () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => "ASSISTANT_EVENT {\"type\":\"workflow_started\",\"message\":\"Started.\"}"),
}));

vi.mock("@/lib/applications/automation-runs", () => ({
  updateApplicationAutomationRunFromLog: vi.fn(),
  buildAssistantRunFeedback: vi.fn(),
}));

vi.mock("@/lib/applications/outcomes", () => ({
  recordApplicationOutcome: vi.fn(),
}));

vi.mock("@/lib/notifications/send", () => ({
  sendNotification: vi.fn(),
}));

vi.mock("@/lib/agent-user-requests", () => ({
  createAgentUserRequest: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    applicationEvent: {
      findFirst: vi.fn(),
    },
    applicationOutcome: {
      findFirst: vi.fn(),
    },
    application: {
      findUnique: vi.fn(),
    },
    agentUserRequest: {
      findFirst: vi.fn(),
    },
  },
}));

const findEventMock = vi.mocked(prisma.applicationEvent.findFirst);
const updateRunMock = vi.mocked(updateApplicationAutomationRunFromLog);
const buildFeedbackMock = vi.mocked(buildAssistantRunFeedback);

describe("GET /api/applications/[id]/assistant-log", () => {
  beforeEach(() => {
    findEventMock.mockReset();
    updateRunMock.mockReset();
    buildFeedbackMock.mockReset();
  });

  it("returns structured diagnostics and timeline with the raw log", async () => {
    const logPath = `${process.cwd()}/.assistant-logs/app_1.log`;
    findEventMock.mockResolvedValue({
      createdAt: new Date("2026-06-11T10:00:00Z"),
      payload: { logPath, pid: 123 },
    } as unknown as Awaited<ReturnType<typeof prisma.applicationEvent.findFirst>>);
    updateRunMock.mockResolvedValue({
      id: "run_1",
      status: "RUNNING",
      blockerType: null,
      blockerMessage: null,
    } as Awaited<ReturnType<typeof updateApplicationAutomationRunFromLog>>);
    buildFeedbackMock.mockReturnValue({
      diagnostics: {
        phase: "launching",
        severity: "info",
        status: "RUNNING",
        statusLabel: "running",
        summary: "The assistant run is in progress.",
        reason: null,
        nextAction: "Wait for the next event, or refresh the run if the browser is no longer open.",
        currentAction: "Started.",
        blockerType: null,
        lastEventType: "workflow_started",
        lastEventMessage: "Started.",
        counts: { detected: null, filled: null, learned: null, ignored: null, activeForAutofill: null, needsReview: null, uploaded: null, skipped: null, observed: null },
      },
      timeline: [{ type: "workflow_started", message: "Started.", severity: "info" }],
    });

    const response = await GET(new Request("http://localhost/api/applications/app_1/assistant-log"), {
      params: { id: "app_1" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      pid: 123,
      diagnostics: {
        phase: "launching",
        currentAction: "Started.",
      },
      timeline: [{ type: "workflow_started", message: "Started." }],
      log: "ASSISTANT_EVENT {\"type\":\"workflow_started\",\"message\":\"Started.\"}",
    });
    expect(buildFeedbackMock).toHaveBeenCalledWith(expect.objectContaining({
      log: "ASSISTANT_EVENT {\"type\":\"workflow_started\",\"message\":\"Started.\"}",
    }));
  });
});
