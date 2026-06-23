import type { AgentType, Prisma, SkillAdjustment } from "@prisma/client";
import type { z } from "zod";
import type { ActionApproval, AgentActionPolicyKind } from "@/lib/agents/action-policy";

export type SkillId =
  | "candidate_intelligence"
  | "resume_strategy"
  | "cover_letter_writer"
  | "application_evidence_curator"
  | "hiring_manager_reviewer"
  | "job_fit_scorer"
  | "search_profile_manager"
  | "recruiter_intelligence"
  | "portfolio_match"
  | "github_portfolio_review"
  | "application_qa"
  | "ats_resume_reviewer"
  | "interview_prep"
  | "outcome_learning"
  | "compensation_opportunity"
  | "networking_strategy"
  | "company_research"
  | "anti_generic_writing"
  | "duplicate_stale_job_detector"
  | "search_expansion"
  | "daily_command_center"
  | "jolene_chief_of_staff"
  | "jolene_operating_loop"
  | "jolene_email_operations"
  | "email_inbox_scout"
  | "email_application_matcher"
  | "email_outcome_classifier"
  | "email_scheduling_coordinator"
  | "email_action_drafter"
  | "email_privacy_reviewer"
  | "email_ops_reporter"
  | "recruiting_agency"
  | "market_intelligence"
  | "linkedin_content"
  | "system_architecture"
  | "recruiting_search_director"
  | "search_yield_analyst"
  | "search_profile_editor"
  | "source_quality_analyst"
  | "match_calibration_reviewer"
  | "outcome_recruiter"
  | "prepare_application_packet"
  | "approve_agency_match";

export type SkillRiskLevel = "LOW" | "HIGH";

export type SkillPolicy = {
  mutatesLocalData: boolean;
  externalAction: "none" | "draft_only" | "manual_submit_required";
  autoApplyLearningKinds: string[];
  allowedTools?: string[];
  forbiddenActions?: string[];
  sideEffects?: string[];
};

export type SkillExecutionContext = {
  userId?: string | null;
  adjustments: SkillAdjustment[];
  approval?: ActionApproval | null;
};

export type SkillDefinition<TInput = unknown, TOutput = unknown> = {
  id: SkillId;
  label: string;
  agentType?: AgentType;
  riskLevel: SkillRiskLevel;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  defaultPolicy: SkillPolicy;
  execute: (input: TInput, context: SkillExecutionContext) => Promise<TOutput>;
  applyAdjustments?: (input: TInput, adjustments: SkillAdjustment[]) => TInput;
};

export type SkillRunResult<TOutput> = {
  skill: Pick<SkillDefinition, "id" | "label" | "agentType" | "riskLevel">;
  output: TOutput;
  policy: {
    kind: AgentActionPolicyKind;
    requiresApproval: boolean;
    approvedBy?: string;
  };
  appliedAdjustments: Array<{
    id: string;
    kind: string;
    rationale: string;
    patchJson: Prisma.JsonValue;
  }>;
};
