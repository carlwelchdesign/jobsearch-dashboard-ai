import type { AgentRun, Prisma } from "@prisma/client";
import { executeJoleneDelegatedWork, runJoleneChiefOfStaffAgent, type JoleneChiefOutput, type JoleneDelegatedWork } from "@/lib/jolene/chief-of-staff";
import { prisma } from "@/lib/prisma";
import { runAgent } from "@/lib/agents/run-agent";

export type JoleneOperatingLoopInput = {
  userId?: string;
  source?: "manual" | "scheduled" | "dashboard" | "chat";
};

export type JoleneOperatingLoopAction = {
  id: string;
  actionId: JoleneDelegatedWork["actionId"];
  label: string;
  detail: string;
  href: string;
  reason: string;
  risk: JoleneDelegatedWork["risk"];
  status: "proposed" | "executed" | "skipped" | "failed";
  childRunId?: string;
  error?: string;
};

export type JoleneOperatingLoopOutput = {
  generatedAt: string;
  title: "Jolene Operating Loop";
  summary: string;
  autonomyPolicy: "propose_first";
  signalSummary: string[];
  recommendedActions: JoleneOperatingLoopAction[];
  skippedActions: Array<{ id: string; label: string; reason: string }>;
  approvalRequests: Array<{ proposalId: string; label: string; reason: string }>;
  childRuns: Array<{ role: string; runId: string; agentType: string; status: string }>;
  chiefRunId: string;
  chiefBriefSummary: string;
  rationale: string;
};

export async function runJoleneOperatingLoopAgent(input: JoleneOperatingLoopInput = {}) {
  const user = input.userId
    ? await prisma.user.findUnique({ where: { id: input.userId } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user exists. Run seed first.");

  return runAgent<JoleneOperatingLoopInput, JoleneOperatingLoopOutput>({
    agentType: "JOLENE_OPERATING_LOOP",
    input: { ...input, source: input.source ?? "manual" },
    userId: user.id,
    execute: async (run) => {
      const chief = await runJoleneChiefOfStaffAgent({
        userId: user.id,
        source: input.source ?? "manual",
        parentRunId: run.id,
      });
      const output = buildJoleneOperatingLoopOutput(chief.output, chief.run);
      await prisma.agentRunEvent.create({
        data: {
          agentRunId: run.id,
          type: "operating_loop_planned",
          message: `Jolene Operating Loop produced ${output.recommendedActions.length} proposed action(s) and ${output.skippedActions.length} skipped action(s).`,
          payloadJson: toJsonInput({
            chiefRunId: chief.run.id,
            proposalIds: output.recommendedActions.map((action) => action.id),
            skippedIds: output.skippedActions.map((action) => action.id),
          }),
        },
      });
      return output;
    },
  });
}

export async function getLatestJoleneOperatingLoop(userId?: string | null) {
  return prisma.agentRun.findFirst({
    where: {
      agentType: "JOLENE_OPERATING_LOOP",
      status: "COMPLETED",
      ...(userId ? { userId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function approveJoleneOperatingLoopActions(input: {
  userId: string;
  runId: string;
  proposalIds: string[];
}) {
  const run = await prisma.agentRun.findFirst({
    where: { id: input.runId, userId: input.userId, agentType: "JOLENE_OPERATING_LOOP", status: "COMPLETED" },
  });
  if (!run) throw new Error("Jolene Operating Loop run not found.");

  const output = parseOperatingLoopOutput(run.outputJson);
  const requested = new Set(input.proposalIds);
  const selected = output.recommendedActions.filter((action) => requested.has(action.id) && action.status === "proposed");
  if (!selected.length) throw new Error("No matching proposed operating-loop action was found.");

  const executed: JoleneOperatingLoopAction[] = [];
  for (const action of selected) {
    try {
      const work = toDelegatedWork(action);
      const result = await executeJoleneDelegatedWork(work, input.userId, run.id);
      executed.push({
        ...action,
        status: result.status,
        detail: result.detail,
        href: result.href ?? action.href,
        childRunId: result.childRunId,
      });
    } catch (error) {
      executed.push({
        ...action,
        status: "failed",
        error: error instanceof Error ? error.message : "Operating-loop action failed.",
      });
    }
  }

  const executedById = new Map(executed.map((action) => [action.id, action]));
  const nextOutput: JoleneOperatingLoopOutput = {
    ...output,
    recommendedActions: output.recommendedActions.map((action) => executedById.get(action.id) ?? action),
    approvalRequests: output.approvalRequests.filter((request) => !requested.has(request.proposalId)),
    childRuns: [
      ...output.childRuns,
      ...executed.flatMap((action) => action.childRunId ? [{ role: action.label, runId: action.childRunId, agentType: action.actionId, status: action.status }] : []),
    ],
  };

  await prisma.$transaction([
    prisma.agentRun.update({
      where: { id: run.id },
      data: { outputJson: toJsonInput(nextOutput) },
    }),
    prisma.agentRunEvent.create({
      data: {
        agentRunId: run.id,
        type: "operating_loop_actions_approved",
        message: `Approved ${executed.length} Jolene Operating Loop action${executed.length === 1 ? "" : "s"}.`,
        payloadJson: toJsonInput({ proposalIds: input.proposalIds, executed }),
      },
    }),
  ]);

  return {
    runId: run.id,
    executed,
    message: `Jolene Operating Loop executed ${executed.filter((action) => action.status === "executed").length} action${executed.length === 1 ? "" : "s"}.`,
  };
}

export function buildJoleneOperatingLoopOutput(chief: JoleneChiefOutput, chiefRun: Pick<AgentRun, "id" | "agentType" | "status">): JoleneOperatingLoopOutput {
  const recommendedActions = chief.delegatedWork.map((work) => ({
    id: `loop_${work.id}`,
    actionId: work.actionId,
    label: work.label,
    detail: work.detail,
    href: work.href,
    reason: `${work.label} remains propose-first. Jolene can execute it only after explicit approval.`,
    risk: work.risk,
    status: "proposed" as const,
  }));
  const skippedActions = [
    {
      id: "external-actions-blocked",
      label: "External actions",
      reason: "No LinkedIn publishing, application submission, employer contact, email sending, or external calendar writes are allowed from the operating loop.",
    },
    ...(chief.blockers.length
      ? [{
          id: "blocked-work-held",
          label: "Blocked work",
          reason: `${chief.blockers.length} blocker(s) must be cleared before Jolene compounds downstream automation.`,
        }]
      : []),
  ];
  const signalSummary = [
    ...chief.evidence,
    ...chief.blockers.map((blocker) => `Blocker: ${blocker}`),
    ...chief.risks.map((risk) => `Risk: ${risk}`),
  ].slice(0, 10);
  const approvalRequests = recommendedActions.map((action) => ({
    proposalId: action.id,
    label: action.label,
    reason: action.reason,
  }));
  return {
    generatedAt: chief.generatedAt,
    title: "Jolene Operating Loop",
    summary: recommendedActions.length
      ? `Jolene planned ${recommendedActions.length} internal action${recommendedActions.length === 1 ? "" : "s"} and is waiting for approval.`
      : "Jolene refreshed the operating brief and found no internal action that needs approval right now.",
    autonomyPolicy: "propose_first",
    signalSummary,
    recommendedActions,
    skippedActions,
    approvalRequests,
    childRuns: [{ role: "Chief of Staff brief", runId: chiefRun.id, agentType: chiefRun.agentType, status: chiefRun.status }],
    chiefRunId: chiefRun.id,
    chiefBriefSummary: chief.summary,
    rationale: "The operating loop is the scheduler/planner layer under Jolene. It refreshes the Chief of Staff brief, proposes internal child-agent work, and keeps risky or external actions gated.",
  };
}

function toDelegatedWork(action: JoleneOperatingLoopAction): JoleneDelegatedWork {
  return {
    id: action.id,
    actionId: action.actionId,
    label: action.label,
    detail: action.detail,
    href: action.href,
    risk: action.risk,
    status: "proposed",
  };
}

function parseOperatingLoopOutput(value: unknown): JoleneOperatingLoopOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Jolene Operating Loop run has no output.");
  const output = value as JoleneOperatingLoopOutput;
  if (!Array.isArray(output.recommendedActions) || !Array.isArray(output.approvalRequests)) throw new Error("Jolene Operating Loop output is missing proposals.");
  return output;
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
