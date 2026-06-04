import { JobMatchStatus, type AgentRun, type Prisma } from "@prisma/client";
import { applicationJobKeySet, hasApplicationForJob } from "@/lib/applications/job-filters";
import { uniqueMatchesByCanonicalJob } from "@/lib/job-search/unique-matches";
import { isJobSuppressed, loadJobSuppressionState } from "@/lib/jobs/suppression";
import { langSmithTraceMetadata, traceWorkflowStep } from "@/lib/observability/langsmith";
import { createQualityExampleFromAgentRun } from "@/lib/observability/quality";
import { prisma } from "@/lib/prisma";
import { runSkill } from "@/lib/skills/run-skill";
import { DEFAULT_RECRUITING_AGENCY_LIMIT, MAX_RECRUITING_AGENCY_LIMIT } from "@/lib/applications/recruiting-agency-constants";

const WORKFLOW_VERSION = "recruiting-agency-graph-v1";
export type RecruitingAgencyTrigger = "manual" | "cron" | "search_auto";

export type RecruitingAgencyRunInput = {
  minimumScore?: number;
  limit?: number;
  triggeredBy?: RecruitingAgencyTrigger;
  parentRunId?: string;
  onStarted?: (agentRunId: string) => Promise<void>;
};

export type RecruitingAgencyRunResult = {
  agentRunId: string;
  requested: {
    minimumScore: number;
    limit: number;
    triggeredBy: RecruitingAgencyTrigger;
  };
  approved: number;
  prepared: number;
  failed: number;
  skipped: number;
  results: Array<{
    matchId: string;
    jobId: string;
    applicationId?: string;
    company: string;
    title: string;
    score: number;
    status: "ready_to_apply" | "approved" | "skipped" | "failed";
    error?: string;
  }>;
  message: string;
};

type AgencyCandidate = Awaited<ReturnType<typeof findAgencyCandidates>>[number];

type RecruitingAgencyWorkflowState = {
  agentRunId: string;
  graphThreadId: string;
  userId: string;
  minimumScore: number;
  limit: number;
  triggeredBy: RecruitingAgencyTrigger;
  currentNode: string;
  candidates: AgencyCandidate[];
  results: RecruitingAgencyRunResult["results"];
  output: RecruitingAgencyRunResult | null;
  error: string | null;
};

let agencyGraphPromise: Promise<any> | null = null;

export async function runRecruitingAgency(input: RecruitingAgencyRunInput = {}): Promise<RecruitingAgencyRunResult> {
  const minimumScore = input.minimumScore ?? 90;
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_RECRUITING_AGENCY_LIMIT, 1), MAX_RECRUITING_AGENCY_LIMIT);
  const triggeredBy = input.triggeredBy ?? "manual";
  const parentRunId = input.parentRunId;
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) throw new Error("No user exists. Run seed first.");

  const graphThreadId = `recruiting-agency:${user.id}:${Date.now()}`;
  const initialState: Omit<RecruitingAgencyWorkflowState, "agentRunId"> = {
    graphThreadId,
    userId: user.id,
    minimumScore,
    limit,
    triggeredBy,
    currentNode: "start",
    candidates: [],
    results: [],
    output: null,
    error: null,
  };
  const agentRun = await prisma.agentRun.create({
    data: {
      userId: user.id,
      agentType: "RECRUITING_AGENCY",
      inputJson: toJsonValue({ minimumScore, limit, triggeredBy }),
      observabilityJson: {
        ...(langSmithTraceMetadata() as Record<string, unknown>),
        graphThreadId,
        workflowVersion: WORKFLOW_VERSION,
      } as Prisma.InputJsonValue,
      graphThreadId,
      currentNode: "start",
      workflowVersion: WORKFLOW_VERSION,
      parentRunId,
      workflowStateJson: toJsonValue(initialState),
      status: "RUNNING",
    },
  });
  const workflowState: RecruitingAgencyWorkflowState = {
    ...initialState,
    agentRunId: agentRun.id,
  };
  if (input.onStarted) await input.onStarted(agentRun.id).catch(() => null);

  try {
    const finalState = await invokeRecruitingAgencyWorkflow(workflowState);
    if (!finalState.output) throw new Error("Recruiting agency workflow completed without output.");
    return finalState.output;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown agency failure";
    await createAgencyRunEvent(agentRun.id, "run_failed", `Recruiting agency failed: ${message}`, { error: message }).catch(() => null);
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: "FAILED",
        error: message,
        currentNode: "run_failed",
        workflowStateJson: toJsonValue({ ...workflowState, currentNode: "run_failed", error: message }),
      },
    }).catch(() => null);
    await createQualityExampleFromAgentRun(agentRun.id, "RECRUITING_AGENCY", "WORKFLOW_FAILURE").catch(() => null);
    throw error;
  }
}

async function invokeRecruitingAgencyWorkflow(state: RecruitingAgencyWorkflowState) {
  if (process.env.VITEST) return runRecruitingAgencyWorkflowSequentially(state);
  const graph = await recruitingAgencyGraph();
  return traceWorkflowStep(
    "recruiting-agency.workflow.run",
    { graphThreadId: state.graphThreadId, workflowVersion: WORKFLOW_VERSION, limit: state.limit, minimumScore: state.minimumScore },
    () => graph.invoke(state, { configurable: { thread_id: state.graphThreadId, checkpoint_ns: "" } }),
  ) as Promise<RecruitingAgencyWorkflowState>;
}

async function recruitingAgencyGraph() {
  agencyGraphPromise ??= buildRecruitingAgencyGraph();
  return agencyGraphPromise;
}

async function buildRecruitingAgencyGraph() {
  const [{ Annotation, END, START, StateGraph }, { PostgresSaver }] = await Promise.all([
    import("@langchain/langgraph"),
    import("@langchain/langgraph-checkpoint-postgres"),
  ]);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for LangGraph Postgres checkpointing.");
  const checkpointer = PostgresSaver.fromConnString(databaseUrl);
  await checkpointer.setup();

  const AgencyAnnotation = Annotation.Root({
    agentRunId: Annotation<string>(),
    graphThreadId: Annotation<string>(),
    userId: Annotation<string>(),
    minimumScore: Annotation<number>(),
    limit: Annotation<number>(),
    triggeredBy: Annotation<RecruitingAgencyTrigger>(),
    currentNode: Annotation<string>(),
    candidates: Annotation<AgencyCandidate[]>({
      reducer: (_, right) => right,
      default: () => [],
    }),
    results: Annotation<RecruitingAgencyRunResult["results"]>({
      reducer: (_, right) => right,
      default: () => [],
    }),
    output: Annotation<RecruitingAgencyRunResult | null>(),
    error: Annotation<string | null>(),
  });

  return new StateGraph(AgencyAnnotation)
    .addNode("loadPolicy", loadAgencyPolicyNode)
    .addNode("findCandidates", findAgencyCandidatesNode)
    .addNode("processCandidates", processAgencyCandidatesNode)
    .addNode("finalizeRun", finalizeAgencyRunNode)
    .addEdge(START, "loadPolicy")
    .addEdge("loadPolicy", "findCandidates")
    .addEdge("findCandidates", "processCandidates")
    .addEdge("processCandidates", "finalizeRun")
    .addEdge("finalizeRun", END)
    .compile({ checkpointer });
}

async function runRecruitingAgencyWorkflowSequentially(state: RecruitingAgencyWorkflowState) {
  let next = { ...state, ...(await loadAgencyPolicyNode(state)) };
  next = { ...next, ...(await findAgencyCandidatesNode(next)) };
  next = { ...next, ...(await processAgencyCandidatesNode(next)) };
  next = { ...next, ...(await finalizeAgencyRunNode(next)) };
  return next;
}

async function loadAgencyPolicyNode(state: RecruitingAgencyWorkflowState): Promise<Partial<RecruitingAgencyWorkflowState>> {
  await createAgencyRunEvent(state.agentRunId, "run_started", `Recruiting agency started with a ${state.minimumScore}+ score threshold.`, {
    minimumScore: state.minimumScore,
    limit: state.limit,
    triggeredBy: state.triggeredBy,
    workflowVersion: WORKFLOW_VERSION,
  });
  const next = { ...state, currentNode: "loadPolicy" };
  await persistAgencyWorkflowState(next);
  return { currentNode: next.currentNode };
}

async function findAgencyCandidatesNode(state: RecruitingAgencyWorkflowState): Promise<Partial<RecruitingAgencyWorkflowState>> {
  const candidates = await findAgencyCandidates({ userId: state.userId, minimumScore: state.minimumScore, limit: state.limit });
  await createAgencyRunEvent(state.agentRunId, "candidates_found", `Found ${candidates.length} eligible agency candidate${candidates.length === 1 ? "" : "s"}.`, {
    count: candidates.length,
    requestedLimit: state.limit,
  });
  const next = { ...state, candidates, currentNode: "findCandidates" };
  await persistAgencyWorkflowState(next);
  return { candidates, currentNode: next.currentNode };
}

async function processAgencyCandidatesNode(state: RecruitingAgencyWorkflowState): Promise<Partial<RecruitingAgencyWorkflowState>> {
  const results: RecruitingAgencyRunResult["results"] = [];
  for (const candidate of state.candidates) {
    try {
      const candidatePayload = candidateEventPayload(candidate);
      await persistAgencyWorkflowState({ ...state, results, currentNode: "evaluateCandidate" });
      await createAgencyRunEvent(state.agentRunId, "candidate_evaluating", `Evaluating ${candidate.jobPosting.company} - ${candidate.jobPosting.title}.`, candidatePayload);
      const approval = await runSkill({
        skillId: "approve_agency_match",
        input: { userId: state.userId, matchId: candidate.id, minimumScore: state.minimumScore },
        userId: state.userId,
      });
      if (approval.appliedAdjustments.length) {
        await createAgencyRunEvent(state.agentRunId, "learning_applied", `Applied ${approval.appliedAdjustments.length} agency learning adjustment${approval.appliedAdjustments.length === 1 ? "" : "s"} while evaluating ${candidate.jobPosting.company}.`, {
          ...candidatePayload,
          adjustmentIds: approval.appliedAdjustments.map((adjustment) => adjustment.id),
          categories: approval.appliedAdjustments.map((adjustment) => objectValue(adjustment.patchJson).category).filter(Boolean),
        });
      }
      await persistAgencyWorkflowState({ ...state, results, currentNode: "approveCandidate" });
      await createAgencyRunEvent(state.agentRunId, "match_approved", `Approved ${candidate.jobPosting.company} - ${candidate.jobPosting.title} at ${candidate.overallScore}.`, candidatePayload);
      await persistAgencyWorkflowState({ ...state, results, currentNode: "prepareApplicationPacket" });
      await createAgencyRunEvent(state.agentRunId, "packet_started", `Preparing application packet for ${candidate.jobPosting.company}.`, candidatePayload);
      const prepared = await runSkill({
        skillId: "prepare_application_packet",
        input: { jobPostingId: candidate.jobPostingId, userId: state.userId },
        userId: state.userId,
      });
      const output = prepared.output as { application: { id: string } };
      results.push({
        matchId: candidate.id,
        jobId: candidate.jobPostingId,
        applicationId: output.application.id,
        company: candidate.jobPosting.company,
        title: candidate.jobPosting.title,
        score: candidate.overallScore,
        status: "ready_to_apply",
      });
      await createAgencyRunEvent(state.agentRunId, "packet_ready", `Packet ready for ${candidate.jobPosting.company} - ${candidate.jobPosting.title}.`, {
        ...candidatePayload,
        applicationId: output.application.id,
      });
    } catch (error) {
      const application = await prisma.application.findFirst({
        where: { userId: state.userId, jobPostingId: candidate.jobPostingId },
        select: { id: true },
      });
      const errorMessage = error instanceof Error ? error.message : "Unknown agency failure";
      results.push({
        matchId: candidate.id,
        jobId: candidate.jobPostingId,
        applicationId: application?.id,
        company: candidate.jobPosting.company,
        title: candidate.jobPosting.title,
        score: candidate.overallScore,
        status: "failed",
        error: errorMessage,
      });
      await createAgencyRunEvent(state.agentRunId, "candidate_failed", `${candidate.jobPosting.company} - ${candidate.jobPosting.title} failed: ${errorMessage}`, {
        ...candidateEventPayload(candidate),
        applicationId: application?.id,
        error: errorMessage,
      });
    }
    await persistAgencyWorkflowState({ ...state, results, currentNode: "recordCandidateResult" });
  }
  return { results, currentNode: "processCandidates" };
}

async function finalizeAgencyRunNode(state: RecruitingAgencyWorkflowState): Promise<Partial<RecruitingAgencyWorkflowState>> {
  const prepared = state.results.filter((result) => result.status === "ready_to_apply").length;
  const failed = state.results.filter((result) => result.status === "failed").length;
  const skipped = Math.max(0, state.limit - state.results.length);
  const output: RecruitingAgencyRunResult = {
    agentRunId: state.agentRunId,
    requested: { minimumScore: state.minimumScore, limit: state.limit, triggeredBy: state.triggeredBy },
    approved: state.results.length,
    prepared,
    failed,
    skipped,
    results: state.results,
    message: `Recruiting agency prepared ${prepared} application package${prepared === 1 ? "" : "s"} from ${state.results.length} approved match${state.results.length === 1 ? "" : "es"}. ${failed} failed.`,
  };

  if (skipped > 0) {
    await createAgencyRunEvent(state.agentRunId, "candidate_skipped", `${skipped} requested slot${skipped === 1 ? " was" : "s were"} skipped because no eligible untracked match was available.`, {
      skipped,
      requestedLimit: state.limit,
      processed: state.results.length,
    });
  }
  await createAgencyRunEvent(state.agentRunId, "run_completed", output.message, {
    approved: output.approved,
    prepared: output.prepared,
    failed: output.failed,
    skipped: output.skipped,
  });
  const next = { ...state, currentNode: "finalizeRun", output };
  await prisma.agentRun.update({
    where: { id: state.agentRunId },
    data: {
      status: "COMPLETED",
      currentNode: "finalizeRun",
      outputJson: toJsonValue(output),
      workflowStateJson: toJsonValue(next),
    },
  });
  if (failed > 0) {
    await createQualityExampleFromAgentRun(state.agentRunId, "RECRUITING_AGENCY", "CANDIDATE_FAILURE").catch(() => null);
  }
  return { currentNode: "finalizeRun", output };
}

export async function getRecruitingAgencyRunStatus(input: { runId?: string | null } = {}) {
  const include = {
    events: {
      orderBy: { createdAt: "asc" as const },
      take: 100,
    },
  };
  const run = input.runId
    ? await prisma.agentRun.findFirst({
      where: { id: input.runId, agentType: "RECRUITING_AGENCY" },
      include,
    })
    : (await prisma.agentRun.findFirst({
      where: { agentType: "RECRUITING_AGENCY", status: { in: ["PENDING", "RUNNING"] } },
      include,
      orderBy: { createdAt: "desc" },
    })) ?? await prisma.agentRun.findFirst({
      where: { agentType: "RECRUITING_AGENCY" },
      include,
      orderBy: { createdAt: "desc" },
    });
  if (!run) return null;
  return serializeRecruitingAgencyRun(run);
}

function serializeRecruitingAgencyRun(run: AgentRun & { events: Array<{ id: string; type: string; message: string; payloadJson: Prisma.JsonValue; createdAt: Date }> }) {
  const events = run.events.map((event) => ({
    id: event.id,
    type: event.type,
    message: event.message,
    payload: event.payloadJson,
    createdAt: event.createdAt.toISOString(),
  }));
  const totals = agencyTotalsFromEvents(events);
  return {
    id: run.id,
    status: run.status,
    error: run.error,
    graphThreadId: run.graphThreadId,
    currentNode: run.currentNode,
    workflowVersion: run.workflowVersion,
    startedAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    totals,
    current: currentAgencyActivity(events),
    events,
  };
}

function agencyTotalsFromEvents(events: Array<{ type: string; payload: Prisma.JsonValue }>) {
  const candidatesFound = events.find((event) => event.type === "candidates_found")?.payload as { count?: number } | undefined;
  return {
    found: candidatesFound?.count ?? 0,
    processed: events.filter((event) => event.type === "packet_ready" || event.type === "candidate_failed").length,
    approved: events.filter((event) => event.type === "match_approved").length,
    prepared: events.filter((event) => event.type === "packet_ready").length,
    failed: events.filter((event) => event.type === "candidate_failed").length,
    skipped: events.reduce((total, event) => {
      if (event.type !== "candidate_skipped") return total;
      const payload = event.payload as { skipped?: number } | undefined;
      return total + (payload?.skipped ?? 1);
    }, 0),
  };
}

function currentAgencyActivity(events: Array<{ type: string; payload: Prisma.JsonValue; message: string }>) {
  const latest = [...events].reverse().find((event) => ["candidate_evaluating", "match_approved", "packet_started", "packet_ready", "candidate_failed", "run_completed", "run_failed"].includes(event.type));
  if (!latest) return null;
  return {
    type: latest.type,
    message: latest.message,
    payload: latest.payload,
  };
}

async function createAgencyRunEvent(agentRunId: string, type: string, message: string, payload: unknown = {}) {
  return prisma.agentRunEvent.create({
    data: {
      agentRunId,
      type,
      message,
      payloadJson: toJsonValue(payload),
    },
  });
}

async function persistAgencyWorkflowState(state: RecruitingAgencyWorkflowState) {
  await prisma.agentRun.update({
    where: { id: state.agentRunId },
    data: {
      graphThreadId: state.graphThreadId,
      currentNode: state.currentNode,
      workflowVersion: WORKFLOW_VERSION,
      workflowStateJson: toJsonValue(state),
    },
  });
}

function candidateEventPayload(candidate: Awaited<ReturnType<typeof findAgencyCandidates>>[number]) {
  return {
    matchId: candidate.id,
    jobId: candidate.jobPostingId,
    company: candidate.jobPosting.company,
    title: candidate.jobPosting.title,
    score: candidate.overallScore,
    profile: candidate.jobSearchProfile.name,
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function findAgencyCandidates({ userId, minimumScore, limit }: { userId: string; minimumScore: number; limit: number }) {
  const [applications, rawMatches, suppressionState] = await Promise.all([
    prisma.application.findMany({
      where: { userId },
      select: {
        status: true,
        jobPosting: {
          select: {
            company: true,
            title: true,
            location: true,
            lastSeenAt: true,
          },
        },
      },
    }),
    prisma.jobProfileMatch.findMany({
      where: {
        status: JobMatchStatus.needs_review,
        overallScore: { gte: minimumScore },
        jobPosting: {
          applicationUrl: { not: null },
        },
      },
      include: {
        jobPosting: true,
        jobSearchProfile: { select: { name: true } },
      },
      orderBy: [{ overallScore: "desc" }, { updatedAt: "desc" }],
      take: limit * 5,
    }),
    loadJobSuppressionState(userId),
  ]);
  const applicationKeys = applicationJobKeySet(applications);
  return uniqueMatchesByCanonicalJob(
    rawMatches.filter((match) => !hasApplicationForJob(match.jobPosting, applicationKeys) && !isJobSuppressed(match.jobPosting, suppressionState)),
  ).slice(0, limit);
}
