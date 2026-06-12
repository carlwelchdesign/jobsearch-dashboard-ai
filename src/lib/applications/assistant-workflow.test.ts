import { beforeEach, describe, expect, it, vi } from "vitest";
import { findReusableAnswerMemories } from "@/lib/application-answer-memory";
import { createAgentUserRequest } from "@/lib/agent-user-requests";
import { resolveApplicationFieldAnswer } from "@/lib/applications/field-answer-resolver";
import { storeObservedFieldLearning } from "@/lib/applications/field-learning";
import { prisma } from "@/lib/prisma";
import { ingestApplicationAssistantWorkflowEvent, recordApplicationAssistantWorkflowCommandResult } from "./assistant-workflow";

vi.mock("@/lib/application-answer-memory", () => ({
  findReusableAnswerMemories: vi.fn(),
}));

vi.mock("@/lib/agent-user-requests", () => ({
  createAgentUserRequest: vi.fn(),
}));

vi.mock("@/lib/applications/field-answer-resolver", () => ({
  resolveApplicationFieldAnswer: vi.fn(),
}));

vi.mock("@/lib/applications/field-learning", () => ({
  storeObservedFieldLearning: vi.fn(),
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
    jobPosting: {
      findUnique: vi.fn(),
    },
  },
}));

const findReusableAnswerMemoriesMock = vi.mocked(findReusableAnswerMemories);
const createAgentUserRequestMock = vi.mocked(createAgentUserRequest);
const resolveFieldAnswerMock = vi.mocked(resolveApplicationFieldAnswer);
const storeObservedFieldLearningMock = vi.mocked(storeObservedFieldLearning);
const findApplicationMock = vi.mocked(prisma.application.findUnique);
const findRunMock = vi.mocked(prisma.applicationAutomationRun.findFirst);
const findRunForActionsMock = vi.mocked(prisma.applicationAutomationRun.findUnique);
const findRunOrThrowMock = vi.mocked(prisma.applicationAutomationRun.findUniqueOrThrow);
const updateRunMock = vi.mocked(prisma.applicationAutomationRun.update);
const findJobPostingMock = vi.mocked(prisma.jobPosting.findUnique);

describe("application assistant workflow learning mode", () => {
  beforeEach(() => {
    findReusableAnswerMemoriesMock.mockReset();
    findReusableAnswerMemoriesMock.mockResolvedValue([]);
    resolveFieldAnswerMock.mockReset();
    resolveFieldAnswerMock.mockResolvedValue({
      answer: null,
      confidence: 0,
      sensitivity: "LOW",
      source: "none",
      autoFillAllowed: false,
      reason: "No generated answer.",
    });
    storeObservedFieldLearningMock.mockReset();
    storeObservedFieldLearningMock.mockResolvedValue({
      saved: 1,
      ignored: 0,
      activeForAutofill: 1,
      needsReview: 0,
      decisions: [],
    });
    createAgentUserRequestMock.mockReset();
    createAgentUserRequestMock.mockResolvedValue({ id: "request_1" } as Awaited<ReturnType<typeof createAgentUserRequest>>);
    findApplicationMock.mockReset();
    findJobPostingMock.mockReset();
    findJobPostingMock.mockResolvedValue({
      atsProvider: "ashby",
      applicationUrl: "https://jobs.example.com/apply",
    } as Awaited<ReturnType<typeof prisma.jobPosting.findUnique>>);
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

  it("observes ordinary unknown required fields when no generated answer is available", async () => {
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

  it("auto-fills high-confidence generated answers for safe application questions", async () => {
    resolveFieldAnswerMock.mockResolvedValue({
      answer: "I build clear React and TypeScript workflows for complex product surfaces.",
      confidence: 88,
      sensitivity: "MEDIUM",
      source: "generated",
      autoFillAllowed: true,
      reason: "Generated from application context.",
      generatedBy: "openai_structured_outputs",
    });

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
    expect(status.currentNode).toBe("resolveGeneratedFieldAnswer");
    expect(status.pendingCommand).toMatchObject({
      type: "fill",
      fieldId: "field_project",
      value: "I build clear React and TypeScript workflows for complex product surfaces.",
      reason: "Generated from application context.",
    });
    expect(status.latestEvent?.message).toContain("Generated answer for field");
  });

  it("learns accepted generated answers after successful fill commands", async () => {
    resolveFieldAnswerMock.mockResolvedValue({
      answer: "I build clear React and TypeScript workflows for complex product surfaces.",
      confidence: 88,
      sensitivity: "MEDIUM",
      source: "generated",
      autoFillAllowed: true,
      reason: "Generated from application context.",
      generatedBy: "openai_structured_outputs",
    });

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

    await recordApplicationAssistantWorkflowCommandResult({
      applicationId: "app_1",
      commandId: status.pendingCommand?.id ?? "",
      result: "success",
      message: "Filled generated answer.",
      valuePreview: "I build clear React and TypeScript workflows for complex product surfaces.",
    });

    expect(storeObservedFieldLearningMock).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: "app_1",
      atsProvider: "ashby",
      host: "jobs.example.com",
      fields: [expect.objectContaining({
        fieldKey: "field_project",
        source: "assistant_confirmation",
        answer: "I build clear React and TypeScript workflows for complex product surfaces.",
      })],
    }));
  });

  it("asks with a draft when a generated answer is not safe enough to auto-fill", async () => {
    resolveFieldAnswerMock.mockResolvedValue({
      answer: "Draft answer that needs review.",
      confidence: 70,
      sensitivity: "MEDIUM",
      source: "generated",
      autoFillAllowed: false,
      reason: "Generated answer needs review.",
      generatedBy: "deterministic_fallback",
    });

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

    expect(createAgentUserRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "UNKNOWN_ANSWER",
      contextJson: expect.objectContaining({
        suggestedAnswer: "Draft answer that needs review.",
      }),
    }));
    expect(status.currentNode).toBe("pauseForUser");
    expect(status.pendingCommand).toMatchObject({
      type: "ask_user",
      value: "Draft answer that needs review.",
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
