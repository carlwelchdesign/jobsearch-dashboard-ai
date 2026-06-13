import type { AgentType, Prisma, SkillAdjustment } from "@prisma/client";
import type { z } from "zod";

export type SkillId =
  | "candidate_intelligence"
  | "resume_strategy"
  | "cover_letter_writer"
  | "job_fit_scorer"
  | "search_profile_manager"
  | "recruiter_intelligence"
  | "portfolio_match"
  | "github_portfolio_review"
  | "application_qa"
  | "interview_prep"
  | "outcome_learning"
  | "compensation_opportunity"
  | "networking_strategy"
  | "company_research"
  | "anti_generic_writing"
  | "duplicate_stale_job_detector"
  | "search_expansion"
  | "daily_command_center"
  | "recruiting_agency"
  | "market_intelligence"
  | "linkedin_content"
  | "prepare_application_packet"
  | "approve_agency_match";

export type SkillRiskLevel = "LOW" | "HIGH";

export type SkillPolicy = {
  mutatesLocalData: boolean;
  externalAction: "none" | "draft_only" | "manual_submit_required";
  autoApplyLearningKinds: string[];
};

export type SkillExecutionContext = {
  userId?: string | null;
  adjustments: SkillAdjustment[];
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
  appliedAdjustments: Array<{
    id: string;
    kind: string;
    rationale: string;
    patchJson: Prisma.JsonValue;
  }>;
};
