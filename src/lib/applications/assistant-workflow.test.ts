import { beforeEach, describe, expect, it, vi } from "vitest";
import { findReusableAnswerMemories } from "@/lib/application-answer-memory";
import { createAgentUserRequest } from "@/lib/agent-user-requests";
import { prisma } from "@/lib/prisma";
import { ingestApplicationAssistantWorkflowEvent } from "./assistant-workflow";

vi.mock("@/lib/application-answer-memory", () => ({
  findReusableAnswerMemories: vi.fn(),
}));

vi.mock("@/lib/agent-user-requests", () => ({
  createAgentUserRequest: vi.fn(),
}));

vi.mock("@/lib/observability/langsmith", () => ({
  traceWorkflowStep: vi.fn((_name: string, _metadata: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      findUnique: vi.fn(),
    },
    applicationAutomationRun: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const findReusableAnswerMemoriesMock = vi.mocked(findReusableAnswerMemories);
const createAgentUserRequestMock = vi.mocked(createAgentUserRequest);
const findApplicationMock = vi.mocked(prisma.application.findUnique);
const findRunMock = vi.mocked(prisma.applicationAutomationRun.findFirst);
const findRunForActionsMock = vi.mocked(prisma.applicationAutomationRun.findUnique);
const findRunOrThrowMock = vi.mocked(prisma.applicationAutomationRun.findUniqueOrThrow);
const updateRunMock = vi.mocked(prisma.applicationAutomationRun.update);

describe("application assistant workflow learning mode", () => {
  beforeEach(() => {
    findReusableAnswerMemoriesMock.mockReset();
    findReusableAnswerMemoriesMock.mockResolvedValue([]);
    createAgentUserRequestMock.mockReset();
    createAgentUserRequestMock.mockResolvedValue({ id: "request_1" } as Awaited<ReturnType<typeof createAgentUserRequest>>);
    findApplicationMock.mockReset();
    (findApplicationMock as unknown as { mockResolvedValue: (value: unknown) => void }).mockResolvedValue({
      id: "app_1",
      userId: "user_1",
      coverLetter: null,
      jobPosting: { id: "job_1" },
      user: {
        id: "user_1",
        email: "carl@example.com",
        name: "Carl Welch",
        profile: {
          fullName: "Carl Welch",
          email: "carl@example.com",
          phone: "",
          linkedinUrl: "",
          githubUrl: "",
          portfolioUrl: "",
          location: "",
        },
      },
    });

    let workflowStateJson: unknown = {};
    const run = {
      id: "run_1",
      userId: "user_1",
      applicationId: "app_1",
      jobPostingId: "job_1",
      status: "RUNNING",
      graphThreadId: "thread_1",
      currentNode: null,
      workflowStateJson,
      actionsJson: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      currentUrl: null,
      logPath: null,
      pid: null,
      blockerType: null,
      blockerMessage: null,
      screenshotsJson: [],
      observabilityJson: {},
      startedAt: new Date(),
      finishedAt: null,
    };
    (findRunMock as unknown as { mockImplementation: (fn: () => Promise<unknown>) => void }).mockImplementation(async () => ({ ...run, workflowStateJson }));
    (findRunForActionsMock as unknown as { mockResolvedValue: (value: unknown) => void }).mockResolvedValue({ ...run, actionsJson: [] });
    (findRunOrThrowMock as unknown as { mockImplementation: (fn: () => Promise<unknown>) => void }).mockImplementation(async () => ({ ...run, workflowStateJson }));
    (updateRunMock as unknown as { mockImplementation: (fn: (input: { data: Record<string, unknown> }) => Promise<unknown>) => void }).mockImplementation(async (input) => {
      if ("workflowStateJson" in input.data) workflowStateJson = input.data.workflowStateJson;
      return { ...run, workflowStateJson };
    });
  });

  it("observes ordinary unknown required fields instead of opening Needs Me", async () => {
    const status = await ingestApplicationAssistantWorkflowEvent({
      applicationId: "app_1",
      event: {
        type: "field_inventory",
        fields: [{
          fieldId: "field_project",
          label: "Describe a complex frontend project.",
          inputType: "textarea",
          required: true,
          category: "custom",
          selector: "textarea#project",
        }],
      },
    });

    expect(createAgentUserRequestMock).not.toHaveBeenCalled();
    expect(status.currentNode).toBe("observeManualInput");
    expect(status.pendingCommand).toMatchObject({
      type: "observe",
      fieldId: "field_project",
    });
  });

  it("still opens approval requests for sensitive unknown fields", async () => {
    const status = await ingestApplicationAssistantWorkflowEvent({
      applicationId: "app_1",
      event: {
        type: "field_inventory",
        fields: [{
          fieldId: "field_salary",
          label: "What are your salary expectations?",
          inputType: "input",
          required: true,
          category: "custom",
          selector: "input#salary",
        }],
      },
    });

    expect(createAgentUserRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "UNKNOWN_ANSWER",
    }));
    expect(status.currentNode).toBe("pauseForUser");
    expect(status.pendingCommand).toMatchObject({
      type: "ask_user",
      fieldId: "field_salary",
    });
  });
});
