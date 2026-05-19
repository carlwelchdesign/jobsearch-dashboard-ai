import type { AgentType } from "@prisma/client";
import { getAdkToolRegistration } from "@/lib/adk/tools";

export type AgentRuntimeSource = "service" | "langgraph" | "adk";
export type AdkAgentRisk = "read_only" | "guarded_mutation";

export type AdkAgentRegistration = {
  id: string;
  displayName: string;
  agentType: AgentType;
  runtime: AgentRuntimeSource;
  risk: AdkAgentRisk;
  tools: string[];
  description: string;
};

export type AdkOperatorRegistration = Omit<AdkAgentRegistration, "agentType"> & {
  operatorType: "jolene";
};

const adkManagedAgents: AdkAgentRegistration[] = [
  {
    id: "daily-command-center",
    displayName: "Daily Command Center",
    agentType: "DAILY_COMMAND_CENTER",
    runtime: "adk",
    risk: "read_only",
    tools: ["dashboard_summary", "application_queue_state", "job_pipeline_state", "candidate_profile_context"],
    description: "Creates a prioritized daily operating plan from local app state.",
  },
  {
    id: "market-intelligence",
    displayName: "Market Intelligence",
    agentType: "MARKET_INTELLIGENCE",
    runtime: "adk",
    risk: "read_only",
    tools: ["market_intelligence_context", "job_pipeline_state", "candidate_profile_context"],
    description: "Synthesizes market and local pipeline signals into review-only recommendations.",
  },
];

const adkManagedOperators: AdkOperatorRegistration[] = [
  {
    id: "jolene-app-operator",
    displayName: "Jolene App Operator",
    operatorType: "jolene",
    runtime: "adk",
    risk: "guarded_mutation",
    tools: ["jolene_app_search", "jolene_safe_workflow_runner", "jolene_guarded_mutation_planner"],
    description: "Plans and executes app-aware Jolene operations with confirmation gates for risky changes.",
  },
];

const langGraphAgentTypes = new Set<AgentType>(["RECRUITING_AGENCY"]);

export function isAdkEnabled() {
  return process.env.ADK_ENABLED === "true";
}

export function adkModelName() {
  return process.env.ADK_MODEL || "gemini-2.5-flash";
}

export function getAdkAgentRegistration(agentType: AgentType) {
  return adkManagedAgents.find((agent) => agent.agentType === agentType) ?? null;
}

export function shouldUseAdkControlPlane(agentType: AgentType) {
  return isAdkEnabled() && Boolean(getAdkAgentRegistration(agentType));
}

export function agentRuntimeSource(agentType: AgentType, graphThreadId?: string | null): AgentRuntimeSource {
  if (graphThreadId || langGraphAgentTypes.has(agentType)) return "langgraph";
  if (shouldUseAdkControlPlane(agentType)) return "adk";
  return "service";
}

export function adkObservabilityMetadata(agentType: AgentType) {
  const registration = getAdkAgentRegistration(agentType);
  if (!registration || !isAdkEnabled()) return null;
  return {
    enabled: true,
    agentId: registration.id,
    model: adkModelName(),
    risk: registration.risk,
    tools: registration.tools,
    mode: "control_plane_wrap",
  };
}

export function listAdkAgentRegistrations() {
  return adkManagedAgents;
}

export function getAdkJoleneOperatorRegistration() {
  return adkManagedOperators.find((operator) => operator.operatorType === "jolene") ?? null;
}

export function listAdkOperatorRegistrations() {
  return adkManagedOperators;
}

export function validateAdkAgentRegistry() {
  return [...adkManagedAgents, ...adkManagedOperators].flatMap((agent) => {
    const errors: string[] = [];
    for (const toolId of agent.tools) {
      const tool = getAdkToolRegistration(toolId);
      if (!tool) {
        errors.push(`${agent.id} references unknown ADK tool ${toolId}.`);
      } else if (agent.risk === "read_only" && tool.risk !== "read_only") {
        errors.push(`${agent.id} is read-only but references guarded mutation tool ${toolId}.`);
      }
    }
    return errors;
  });
}
