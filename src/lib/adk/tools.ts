export type AdkToolRisk = "read_only" | "guarded_mutation";

export type AdkToolRegistration = {
  id: string;
  displayName: string;
  risk: AdkToolRisk;
  description: string;
};

const adkTools: AdkToolRegistration[] = [
  {
    id: "dashboard_summary",
    displayName: "Dashboard Summary",
    risk: "read_only",
    description: "Reads high-level job, application, blocker, and outcome counts.",
  },
  {
    id: "application_queue_state",
    displayName: "Application Queue State",
    risk: "read_only",
    description: "Reads Apply Sprint state, ready applications, blockers, and follow-ups.",
  },
  {
    id: "job_pipeline_state",
    displayName: "Job Pipeline State",
    risk: "read_only",
    description: "Reads job review, approval, rejection, duplicate, and profile-match state.",
  },
  {
    id: "candidate_profile_context",
    displayName: "Candidate Profile Context",
    risk: "read_only",
    description: "Reads compact candidate profile, skills, approved evidence, and project context.",
  },
  {
    id: "market_intelligence_context",
    displayName: "Market Intelligence Context",
    risk: "read_only",
    description: "Reads local market-intelligence inputs and review-only recommendations.",
  },
  {
    id: "jolene_app_search",
    displayName: "Jolene App Search",
    risk: "read_only",
    description: "Lets Jolene inspect app records across jobs, applications, generated materials, blockers, and agent runs.",
  },
  {
    id: "jolene_safe_workflow_runner",
    displayName: "Jolene Safe Workflow Runner",
    risk: "guarded_mutation",
    description: "Lets Jolene start safe internal workflows such as search, dedupe, email sync, command center, and market intelligence.",
  },
  {
    id: "jolene_guarded_mutation_planner",
    displayName: "Jolene Guarded Mutation Planner",
    risk: "guarded_mutation",
    description: "Lets Jolene plan approvals, rejections, repairs, retries, and bulk changes that require confirmation before execution.",
  },
];

export function listAdkToolRegistrations() {
  return adkTools;
}

export function getAdkToolRegistration(id: string) {
  return adkTools.find((tool) => tool.id === id) ?? null;
}
