import type { Prisma } from "@prisma/client";
import {
  type AssistantWorkflowEvent,
  type AssistantWorkflowField,
  type AssistantWorkflowCommand,
  type AssistantWorkflowState,
  type SerializedAssistantWorkflowStatus,
  persistWorkflowState,
  serializeWorkflowStatus,
  workflowEvent,
} from "@/lib/applications/assistant-workflow";
import { requireLaunchableApplicationUrl } from "@/lib/applications/application-url-quality";
import { launchApplicationAssistant, type LaunchAssistantResult } from "@/lib/applications/launch-assistant";
import { langSmithTraceMetadata, traceWorkflowStep } from "@/lib/observability/langsmith";
import { prisma } from "@/lib/prisma";

export type AssistantWorkflowStartResult = LaunchAssistantResult & {
  workflow: SerializedAssistantWorkflowStatus;
};

let graphPromise: Promise<any> | null = null;

export async function startApplicationAssistantWorkflow(applicationId: string, origin: string): Promise<AssistantWorkflowStartResult> {
  const graphThreadId = `application-assistant:${applicationId}:${Date.now()}`;
  const graph = await assistantWorkflowGraph();
  const state = await traceWorkflowStep(
    "assistant.workflow.start",
    { applicationId, graphThreadId, originHost: safeHost(origin) },
    () => graph.invoke(
      {
        applicationId,
        origin,
        graphThreadId,
        automationRunId: null,
        currentNode: "start",
        status: "RUNNING",
        error: null,
        fields: [],
        pendingCommand: null,
        pendingFieldId: null,
        pendingUserRequestId: null,
        filledFields: [],
        skippedFields: [],
        blockedFields: [],
        observedManualFields: [],
        events: [],
      },
      { configurable: { thread_id: graphThreadId, checkpoint_ns: "" } },
    ),
  ) as AssistantWorkflowState;
  if (!state.automationRunId) throw new Error("Assistant workflow did not create an automation run.");

  const run = await prisma.applicationAutomationRun.findUnique({
    where: { id: state.automationRunId },
    include: { application: true, jobPosting: true },
  });
  if (!run) throw new Error("Assistant automation run was not found after workflow launch.");
  await prisma.applicationAutomationRun.update({
    where: { id: run.id },
    data: {
      observabilityJson: {
        ...(langSmithTraceMetadata() as Record<string, unknown>),
        graphThreadId,
        lastTraceStep: "assistant.workflow.start",
      } as Prisma.InputJsonValue,
    },
  });

  return {
    ok: true,
    pid: run.pid ?? undefined,
    automationRunId: run.id,
    logPath: run.logPath ?? "",
    message: `Assistant launched for ${run.jobPosting.company} - ${run.jobPosting.title}. Review the browser, then submit manually.`,
    manualSubmitRequired: true,
    application: {
      id: run.application.id,
      company: run.jobPosting.company,
      title: run.jobPosting.title,
      applicationUrl: run.jobPosting.applicationUrl,
    },
    workflow: serializeWorkflowStatus(run),
  };
}

async function assistantWorkflowGraph() {
  graphPromise ??= buildAssistantWorkflowGraph();
  return graphPromise;
}

async function buildAssistantWorkflowGraph() {
  const [{ Annotation, END, START, StateGraph }, { PostgresSaver }] = await Promise.all([
    import("@langchain/langgraph"),
    import("@langchain/langgraph-checkpoint-postgres"),
  ]);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for LangGraph Postgres checkpointing.");
  const checkpointer = PostgresSaver.fromConnString(databaseUrl);
  await checkpointer.setup();

  const AssistantWorkflowAnnotation = Annotation.Root({
    applicationId: Annotation<string>(),
    origin: Annotation<string>(),
    graphThreadId: Annotation<string>(),
    automationRunId: Annotation<string | null>(),
    currentNode: Annotation<string>(),
    status: Annotation<AssistantWorkflowState["status"]>(),
    error: Annotation<string | null>(),
    fields: Annotation<AssistantWorkflowField[]>({
      reducer: (_: AssistantWorkflowField[], right: AssistantWorkflowField[]) => right,
      default: () => [],
    }),
    pendingCommand: Annotation<AssistantWorkflowCommand | null>(),
    pendingFieldId: Annotation<string | null>(),
    pendingUserRequestId: Annotation<string | null>(),
    filledFields: Annotation<string[]>({
      reducer: (_: string[], right: string[]) => right,
      default: () => [],
    }),
    skippedFields: Annotation<string[]>({
      reducer: (_: string[], right: string[]) => right,
      default: () => [],
    }),
    blockedFields: Annotation<string[]>({
      reducer: (_: string[], right: string[]) => right,
      default: () => [],
    }),
    observedManualFields: Annotation<string[]>({
      reducer: (_: string[], right: string[]) => right,
      default: () => [],
    }),
    events: Annotation<AssistantWorkflowEvent[]>({
      reducer: (left: AssistantWorkflowEvent[], right: AssistantWorkflowEvent[]) => [...left, ...right],
      default: () => [],
    }),
  });

  return new StateGraph(AssistantWorkflowAnnotation)
    .addNode("loadPackage", async (state: AssistantWorkflowState) => {
      const application = await prisma.application.findUnique({
        where: { id: state.applicationId },
        include: { coverLetter: true, jobPosting: true, resume: true },
      });
      if (!application) throw new Error("Application not found.");
      if (application.status !== "ready_to_apply") throw new Error("Prepare the application package first.");
      if (!application.jobPosting.applicationUrl) throw new Error("This job does not have an application URL.");
      requireLaunchableApplicationUrl(application.jobPosting.applicationUrl);
      if (!application.resume || !application.coverLetter) throw new Error("A generated resume and cover letter are required.");
      return {
        currentNode: "loadPackage",
        events: [workflowEvent("loadPackage", "Application package validated for assistant workflow.")],
      };
    })
    .addNode("launchBrowser", async (state: AssistantWorkflowState) => {
      const launched = await launchApplicationAssistant(state.applicationId, state.origin);
      const nextState: AssistantWorkflowState = {
        ...state,
        automationRunId: launched.automationRunId,
        currentNode: "launchBrowser",
        status: "RUNNING",
        events: [workflowEvent("launchBrowser", "Playwright browser runner launched.", {
          automationRunId: launched.automationRunId,
          pid: launched.pid,
          logPath: launched.logPath,
        })],
      };
      await persistWorkflowState(launched.automationRunId, {
        ...nextState,
        events: [...state.events, ...nextState.events],
      });
      return nextState;
    })
    .addNode("awaitFieldInventory", async (state: AssistantWorkflowState) => {
      const nextState: AssistantWorkflowState = {
        ...state,
        currentNode: "awaitFieldInventory",
        status: "RUNNING",
        events: [workflowEvent("awaitFieldInventory", "Assistant browser is opening and waiting to report form fields.")],
      };
      if (state.automationRunId) {
        await persistWorkflowState(state.automationRunId, {
          ...nextState,
          events: [...state.events, ...nextState.events],
        });
      }
      return nextState;
    })
    .addEdge(START, "loadPackage")
    .addEdge("loadPackage", "launchBrowser")
    .addEdge("launchBrowser", "awaitFieldInventory")
    .addEdge("awaitFieldInventory", END)
    .compile({ checkpointer });
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
