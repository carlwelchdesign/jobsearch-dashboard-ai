import { AgentType, type AgentRunStatus, type AgentType as AgentTypeValue } from "@prisma/client";
import { agentRuntimeSource, listAdkAgentRegistrations, listAdkOperatorRegistrations, type AgentRuntimeSource } from "@/lib/adk/registry";
import type { AgentActionPolicyKind } from "@/lib/agents/action-policy";
import { prisma } from "@/lib/prisma";
import { skillRegistry } from "@/lib/skills/registry";
import type { SkillDefinition } from "@/lib/skills/types";

export type AgentRosterItem = {
  agentType: AgentTypeValue;
  label: string;
  ownerArea: string;
  runtime: AgentRuntimeSource;
  allowedTools: string[];
  forbiddenActions: string[];
  sideEffects: string[];
  approvalRequired: boolean;
  actionPolicyKind: AgentActionPolicyKind;
  currentStatus: AgentRunStatus | "IDLE";
  latestRunId: string | null;
  lastRunAt: Date | null;
  childRuns: number;
  blockedActions: number;
  lastEvalScore: number | null;
  lastEvalStatus: string | null;
};

type AgentRunForRoster = Awaited<ReturnType<typeof loadRosterRuns>>[number];

const ownerAreas: Partial<Record<AgentTypeValue, string>> = {
  CANDIDATE_INTELLIGENCE: "Candidate data",
  RESUME_STRATEGY: "Application materials",
  COVER_LETTER_WRITER: "Application materials",
  JOB_FIT_SCORER: "Job review",
  SEARCH_PROFILE_MANAGER: "Search strategy",
  RECRUITER_INTELLIGENCE: "Outreach",
  PORTFOLIO_MATCH: "Application packet",
  GITHUB_PORTFOLIO_REVIEW: "Portfolio evidence",
  APPLICATION_QA: "Trust and QA",
  INTERVIEW_PREP: "Interview workflow",
  OUTCOME_LEARNING: "Outcome learning",
  COMPENSATION_OPPORTUNITY: "Offer strategy",
  NETWORKING_STRATEGY: "Networking",
  COMPANY_RESEARCH: "Company research",
  ANTI_GENERIC_WRITING: "Trust and QA",
  DUPLICATE_STALE_JOB_DETECTOR: "Search quality",
  SEARCH_EXPANSION: "Search strategy",
  RECRUITING_SEARCH_DIRECTOR: "Search optimization",
  SEARCH_YIELD_ANALYST: "Search optimization",
  SEARCH_PROFILE_EDITOR: "Search optimization",
  SOURCE_QUALITY_ANALYST: "Search optimization",
  MATCH_CALIBRATION_REVIEWER: "Search optimization",
  OUTCOME_RECRUITER: "Search optimization",
  DAILY_COMMAND_CENTER: "Command Center",
  RECRUITING_AGENCY: "Apply Sprint",
  MARKET_INTELLIGENCE: "Market intelligence",
  LINKEDIN_CONTENT: "Public content",
  JOLENE_CHIEF_OF_STAFF: "Jolene",
  JOLENE_OPERATING_LOOP: "Jolene",
  JOLENE_EMAIL_OPERATIONS: "Email Ops",
  EMAIL_INBOX_SCOUT: "Email Ops",
  EMAIL_APPLICATION_MATCHER: "Email Ops",
  EMAIL_OUTCOME_CLASSIFIER: "Email Ops",
  EMAIL_SCHEDULING_COORDINATOR: "Email Ops",
  EMAIL_ACTION_DRAFTER: "Email Ops",
  EMAIL_PRIVACY_REVIEWER: "Email Ops",
  EMAIL_OPS_REPORTER: "Email Ops",
  SYSTEM_ARCHITECTURE: "Architecture",
};

export async function buildAgentRoster(): Promise<AgentRosterItem[]> {
  const runs = await loadRosterRuns();
  const latestByType = new Map<AgentTypeValue, AgentRunForRoster>();
  const blockedByType = new Map<AgentTypeValue, number>();
  const childRunsByParent = new Map<string, number>();

  for (const run of runs) {
    if (!latestByType.has(run.agentType)) latestByType.set(run.agentType, run);
    if (run.parentRunId) childRunsByParent.set(run.parentRunId, (childRunsByParent.get(run.parentRunId) ?? 0) + 1);
    blockedByType.set(run.agentType, (blockedByType.get(run.agentType) ?? 0) + run.events.filter(isBlockedActionEvent).length);
  }

  const skillsByAgentType = new Map<AgentTypeValue, SkillDefinition>();
  for (const skill of Object.values(skillRegistry) as SkillDefinition[]) {
    if (skill.agentType) skillsByAgentType.set(skill.agentType, skill);
  }
  const adkByAgentType = new Map(listAdkAgentRegistrations().map((agent) => [agent.agentType, agent]));
  const joleneOperatorTools = listAdkOperatorRegistrations().flatMap((operator) => operator.tools);

  return (Object.values(AgentType) as AgentTypeValue[]).map((agentType) => {
    const skill = skillsByAgentType.get(agentType);
    const latestRun = latestByType.get(agentType);
    const adkRegistration = adkByAgentType.get(agentType);
    const policyKind = skill ? actionPolicyKindForSkill(skill) : "read_only";
    const registryTools = skill?.defaultPolicy.allowedTools ?? [];
    const adkTools = adkRegistration?.tools ?? (agentType.startsWith("JOLENE_") ? joleneOperatorTools : []);
    const lastEvaluation = latestRun?.qualityEvaluations[0] ?? null;
    return {
      agentType,
      label: skill?.label ?? labelFromAgentType(agentType),
      ownerArea: ownerAreas[agentType] ?? "Agent platform",
      runtime: agentRuntimeSource(agentType, latestRun?.graphThreadId),
      allowedTools: unique([...registryTools, ...adkTools]),
      forbiddenActions: unique(skill?.defaultPolicy.forbiddenActions ?? defaultForbiddenActions(agentType)),
      sideEffects: unique(skill?.defaultPolicy.sideEffects ?? ["none"]),
      approvalRequired: policyKind === "guarded_mutation" || policyKind === "external_blocked",
      actionPolicyKind: policyKind,
      currentStatus: latestRun?.status ?? "IDLE",
      latestRunId: latestRun?.id ?? null,
      lastRunAt: latestRun?.createdAt ?? null,
      childRuns: latestRun ? childRunsByParent.get(latestRun.id) ?? 0 : 0,
      blockedActions: blockedByType.get(agentType) ?? 0,
      lastEvalScore: lastEvaluation?.score ?? null,
      lastEvalStatus: lastEvaluation?.status ?? null,
    };
  });
}

function loadRosterRuns() {
  return prisma.agentRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      events: { orderBy: { createdAt: "desc" }, take: 20 },
      qualityEvaluations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

function actionPolicyKindForSkill(skill: SkillDefinition): AgentActionPolicyKind {
  if (skill.defaultPolicy.externalAction === "manual_submit_required") return "guarded_mutation";
  if (skill.riskLevel === "HIGH") return "guarded_mutation";
  if (skill.defaultPolicy.externalAction === "draft_only") return "proposal";
  if (skill.defaultPolicy.mutatesLocalData) return "safe_internal";
  return "read_only";
}

function isBlockedActionEvent(event: { type: string; message: string }) {
  return /\b(blocked|denied|rejected|external_blocked|approval_required|unauthorized)\b/i.test(`${event.type} ${event.message}`);
}

function defaultForbiddenActions(agentType: AgentTypeValue) {
  if (agentType === "LINKEDIN_CONTENT") return ["publish_linkedin_without_approval", "claim_without_provenance"];
  if (agentType.startsWith("EMAIL_") || agentType === "JOLENE_EMAIL_OPERATIONS") return ["send_email_without_approval", "write_calendar"];
  return ["external_submit", "send_email", "write_calendar", "publish_linkedin"];
}

function labelFromAgentType(agentType: AgentTypeValue) {
  return agentType.toLowerCase().split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
