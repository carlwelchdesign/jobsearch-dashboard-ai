import { JobMatchStatus, Prisma, type SkillAdjustment } from "@prisma/client";
import { z } from "zod";
import { applicationJobKeySet, hasApplicationForJob } from "@/lib/applications/job-filters";
import { isJobSuppressed, loadJobSuppressionState } from "@/lib/jobs/suppression";
import { prisma } from "@/lib/prisma";
import { applyNumericThresholdAdjustments, applyQualityProposalRuleAdjustments } from "@/lib/skills/adjustments";
import type { SkillDefinition, SkillId } from "@/lib/skills/types";

const anyOutput = z.unknown();
const optionalUser = { userId: z.string().optional() };
const applicationInput = z.object({ applicationId: z.string(), ...optionalUser });
const jobProfileInput = z.object({ jobPostingId: z.string(), jobSearchProfileId: z.string(), ...optionalUser });
const jobInput = z.object({ jobPostingId: z.string().optional(), limit: z.number().int().optional(), ...optionalUser });

const lowRiskPolicy = {
  mutatesLocalData: false,
  externalAction: "none" as const,
  autoApplyLearningKinds: ["THRESHOLD", "WARNING", "STYLE_RULE", "GUIDANCE", "QA_CHECK"],
};

const localMutationPolicy = {
  mutatesLocalData: true,
  externalAction: "none" as const,
  autoApplyLearningKinds: ["THRESHOLD", "WARNING", "STYLE_RULE", "GUIDANCE", "QA_CHECK"],
};

const manualSubmitPolicy = {
  mutatesLocalData: true,
  externalAction: "manual_submit_required" as const,
  autoApplyLearningKinds: ["THRESHOLD", "WARNING", "STYLE_RULE", "GUIDANCE", "QA_CHECK"],
};

export const skillRegistry = {
  candidate_intelligence: {
    id: "candidate_intelligence",
    label: "Candidate Intelligence",
    agentType: "CANDIDATE_INTELLIGENCE",
    riskLevel: "LOW",
    inputSchema: z.object({
      candidateProfileId: z.string(),
      userId: z.string().optional(),
      sourceType: z.enum(["RESUME_UPLOAD", "USER_INPUT", "GITHUB_REPO", "LINKEDIN", "APPLICATION_HISTORY", "INTERVIEW_NOTE", "GENERATED_BUT_APPROVED"]),
      sourceRef: z.string().optional(),
      notes: z.array(z.object({ title: z.string(), content: z.string() })),
    }),
    outputSchema: anyOutput,
    defaultPolicy: localMutationPolicy,
    execute: async (input: any) => (await (await import("@/lib/agents/candidate-intelligence")).runCandidateIntelligenceAgent(input)).output,
  },
  resume_strategy: {
    id: "resume_strategy",
    label: "Resume Strategy",
    agentType: "RESUME_STRATEGY",
    riskLevel: "LOW",
    inputSchema: jobProfileInput,
    outputSchema: anyOutput,
    defaultPolicy: lowRiskPolicy,
    execute: async (input: any) => (await (await import("@/lib/agents/resume-strategy")).runResumeStrategyAgent(input)).output,
  },
  cover_letter_writer: {
    id: "cover_letter_writer",
    label: "Cover Letter Writer",
    agentType: "COVER_LETTER_WRITER",
    riskLevel: "HIGH",
    inputSchema: z.object({ jobPostingId: z.string(), ...optionalUser }),
    outputSchema: anyOutput,
    defaultPolicy: manualSubmitPolicy,
    execute: async (input: any) => (await import("@/lib/applications/prepare-package")).prepareApplicationPackage(input.jobPostingId),
  },
  job_fit_scorer: {
    id: "job_fit_scorer",
    label: "Job Fit Scorer",
    agentType: "JOB_FIT_SCORER",
    riskLevel: "LOW",
    inputSchema: jobProfileInput,
    outputSchema: anyOutput,
    defaultPolicy: localMutationPolicy,
    applyAdjustments: (input: any, adjustments: SkillAdjustment[]) => applyQualityProposalRuleAdjustments(input, adjustments),
    execute: async (input: any) => (await (await import("@/lib/agents/job-fit-scorer")).runJobFitScoringAgent(input)).output,
  },
  search_profile_manager: {
    id: "search_profile_manager",
    label: "Search Profile Manager",
    agentType: "SEARCH_PROFILE_MANAGER",
    riskLevel: "LOW",
    inputSchema: z.object(optionalUser),
    outputSchema: anyOutput,
    defaultPolicy: localMutationPolicy,
    applyAdjustments: (input: any, adjustments: SkillAdjustment[]) => applyQualityProposalRuleAdjustments(input, adjustments),
    execute: async (input: any) => (await (await import("@/lib/agents/search-profile-manager")).runSearchProfileManagerAgent(input)).output,
  },
  recruiter_intelligence: {
    id: "recruiter_intelligence",
    label: "Recruiter Intelligence",
    agentType: "RECRUITER_INTELLIGENCE",
    riskLevel: "HIGH",
    inputSchema: z.object({ applicationId: z.string().optional(), jobPostingId: z.string().optional(), contactId: z.string().optional(), ...optionalUser }),
    outputSchema: anyOutput,
    defaultPolicy: { ...localMutationPolicy, externalAction: "draft_only" as const },
    execute: async (input: any) => (await (await import("@/lib/agents/recruiter-intelligence")).runRecruiterIntelligenceAgent(input)).output,
  },
  portfolio_match: skillForApplication("portfolio_match", "Portfolio Match", "PORTFOLIO_MATCH", async (input) => (await import("@/lib/agents/portfolio-match")).runPortfolioMatchAgent(input)),
  github_portfolio_review: {
    id: "github_portfolio_review",
    label: "GitHub Portfolio Review",
    agentType: "GITHUB_PORTFOLIO_REVIEW",
    riskLevel: "LOW",
    inputSchema: z.object(optionalUser),
    outputSchema: anyOutput,
    defaultPolicy: lowRiskPolicy,
    execute: async (input: any) => (await (await import("@/lib/agents/github-portfolio-review")).runGithubPortfolioReviewAgent(input)).output,
  },
  application_qa: {
    id: "application_qa",
    label: "Application QA",
    agentType: "APPLICATION_QA",
    riskLevel: "LOW",
    inputSchema: z.object({
      jobPostingId: z.string(),
      userId: z.string().optional(),
      resumeMarkdown: z.string().nullable().optional(),
      coverLetterBody: z.string().nullable().optional(),
      evidenceRefs: z.array(z.string()).optional(),
    }),
    outputSchema: anyOutput,
    defaultPolicy: lowRiskPolicy,
    applyAdjustments: (input: any, adjustments: SkillAdjustment[]) => applyQualityProposalRuleAdjustments(input, adjustments),
    execute: async (input: any) => (await (await import("@/lib/agents/application-qa")).runApplicationQaAgent(input)).output,
  },
  interview_prep: skillForApplication("interview_prep", "Interview Prep", "INTERVIEW_PREP", async (input) => (await import("@/lib/agents/interview-prep")).runInterviewPrepAgent(input)),
  outcome_learning: {
    id: "outcome_learning",
    label: "Outcome Learning",
    agentType: "OUTCOME_LEARNING",
    riskLevel: "LOW",
    inputSchema: z.object(optionalUser),
    outputSchema: anyOutput,
    defaultPolicy: lowRiskPolicy,
    execute: async (input: any) => (await (await import("@/lib/agents/outcome-learning")).runOutcomeLearningAgent(input)).output,
  },
  compensation_opportunity: skillForApplication("compensation_opportunity", "Compensation Opportunity", "COMPENSATION_OPPORTUNITY", async (input) => (await import("@/lib/agents/compensation-opportunity")).runCompensationOpportunityAgent(input)),
  networking_strategy: {
    id: "networking_strategy",
    label: "Networking Strategy",
    agentType: "NETWORKING_STRATEGY",
    riskLevel: "LOW",
    inputSchema: z.object(optionalUser),
    outputSchema: anyOutput,
    defaultPolicy: lowRiskPolicy,
    execute: async (input: any) => (await (await import("@/lib/agents/networking-strategy")).runNetworkingStrategyAgent(input)).output,
  },
  company_research: skillForApplication("company_research", "Company Research", "COMPANY_RESEARCH", async (input) => (await import("@/lib/agents/company-research")).runCompanyResearchAgent(input)),
  anti_generic_writing: {
    id: "anti_generic_writing",
    label: "Anti-Generic Writing",
    agentType: "ANTI_GENERIC_WRITING",
    riskLevel: "LOW",
    inputSchema: z.object({
      jobPostingId: z.string(),
      userId: z.string().optional(),
      resumeMarkdown: z.string().nullable().optional(),
      coverLetterBody: z.string().nullable().optional(),
      evidenceRefs: z.array(z.string()).optional(),
    }),
    outputSchema: anyOutput,
    defaultPolicy: lowRiskPolicy,
    execute: async (input: any) => (await (await import("@/lib/agents/application-qa")).runApplicationQaAgent(input)).output,
  },
  duplicate_stale_job_detector: {
    id: "duplicate_stale_job_detector",
    label: "Duplicate/Stale Job Detector",
    agentType: "DUPLICATE_STALE_JOB_DETECTOR",
    riskLevel: "LOW",
    inputSchema: jobInput,
    outputSchema: anyOutput,
    defaultPolicy: localMutationPolicy,
    applyAdjustments: (input: any, adjustments: SkillAdjustment[]) => applyQualityProposalRuleAdjustments(input, adjustments),
    execute: async (input: any) => (await (await import("@/lib/agents/duplicate-stale-job-detector")).runDuplicateStaleJobDetectorAgent(input)).output,
  },
  search_expansion: {
    id: "search_expansion",
    label: "Search Expansion",
    agentType: "SEARCH_EXPANSION",
    riskLevel: "LOW",
    inputSchema: z.object(optionalUser),
    outputSchema: anyOutput,
    defaultPolicy: lowRiskPolicy,
    execute: async (input: any) => (await (await import("@/lib/agents/search-expansion")).runSearchExpansionAgent(input)).output,
  },
  daily_command_center: {
    id: "daily_command_center",
    label: "Daily Command Center",
    agentType: "DAILY_COMMAND_CENTER",
    riskLevel: "LOW",
    inputSchema: z.object(optionalUser),
    outputSchema: anyOutput,
    defaultPolicy: lowRiskPolicy,
    execute: async (input: any) => (await (await import("@/lib/agents/daily-command-center")).runDailyCommandCenterAgent(input)).output,
  },
  recruiting_agency: {
    id: "recruiting_agency",
    label: "Recruiting Agency",
    agentType: "RECRUITING_AGENCY",
    riskLevel: "HIGH",
    inputSchema: z.object({
      minimumScore: z.number().int().min(0).max(100).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      triggeredBy: z.enum(["manual", "cron"]).optional(),
    }),
    outputSchema: anyOutput,
    defaultPolicy: manualSubmitPolicy,
    execute: async (input: any) => (await import("@/lib/applications/recruiting-agency")).runRecruitingAgency(input),
  },
  market_intelligence: {
    id: "market_intelligence",
    label: "Market Intelligence",
    agentType: "MARKET_INTELLIGENCE",
    riskLevel: "LOW",
    inputSchema: z.object({ userId: z.string().optional(), lookbackDays: z.number().int().min(7).max(180).optional() }),
    outputSchema: anyOutput,
    defaultPolicy: lowRiskPolicy,
    execute: async (input: any) => (await (await import("@/lib/agents/market-intelligence")).runMarketIntelligenceAgent(input)).output,
  },
  prepare_application_packet: {
    id: "prepare_application_packet",
    label: "Prepare Application Packet",
    riskLevel: "HIGH",
    inputSchema: z.object({ jobPostingId: z.string(), userId: z.string().optional() }),
    outputSchema: anyOutput,
    defaultPolicy: manualSubmitPolicy,
    execute: async (input: any) => (await import("@/lib/applications/prepare-package")).prepareApplicationPackage(input.jobPostingId),
  },
  approve_agency_match: {
    id: "approve_agency_match",
    label: "Approve Agency Match",
    riskLevel: "HIGH",
    inputSchema: z.object({ userId: z.string(), matchId: z.string(), minimumScore: z.number().int().min(0).max(100).default(90) }),
    outputSchema: anyOutput,
    defaultPolicy: localMutationPolicy,
    applyAdjustments: (input: any, adjustments: SkillAdjustment[]) => applyQualityProposalRuleAdjustments(
      applyNumericThresholdAdjustments(input, adjustments, "minimumScore", { min: 85, max: 98, maxDelta: 5 }),
      adjustments,
    ),
    execute: approveAgencyMatch,
  },
};

const registryCoverage: Record<SkillId, unknown> = skillRegistry;
void registryCoverage;

function skillForApplication(
  id: SkillId,
  label: string,
  agentType: NonNullable<SkillDefinition["agentType"]>,
  runner: (input: { applicationId: string; userId?: string }) => Promise<{ output: unknown }>,
): SkillDefinition<{ applicationId: string; userId?: string }, unknown> {
  return {
    id,
    label,
    agentType,
    riskLevel: "LOW",
    inputSchema: applicationInput,
    outputSchema: anyOutput,
    defaultPolicy: lowRiskPolicy,
    execute: async (input: any) => (await runner(input)).output,
  };
}

async function approveAgencyMatch(input: { userId: string; matchId: string; minimumScore: number; learningRules?: { agencyCandidateQuality?: boolean; appliedCategories?: string[] } }) {
  const candidate = await prisma.jobProfileMatch.findUnique({
    where: { id: input.matchId },
    include: { jobPosting: true, jobSearchProfile: { select: { name: true } } },
  });
  if (!candidate) throw new Error("Agency match not found.");
  if (candidate.status !== JobMatchStatus.needs_review) throw new Error("Agency match is no longer awaiting review.");
  if (candidate.overallScore < input.minimumScore) throw new Error("Agency match score is below the current approval threshold.");
  if (input.learningRules?.agencyCandidateQuality) {
    const learnedMinimum = Math.min(98, input.minimumScore + 3);
    const concerns = Array.isArray(candidate.concerns) ? candidate.concerns : [];
    if (candidate.overallScore < learnedMinimum || concerns.length > 0) {
      throw new Error("Active agency learning requires a cleaner, higher-confidence candidate before approval.");
    }
  }
  if (!candidate.jobPosting.applicationUrl) throw new Error("Agency match does not have an application URL.");

  const [existingApplications, suppressionState] = await Promise.all([
    prisma.application.findMany({
    where: { userId: input.userId },
    select: {
      status: true,
      jobPosting: { select: { company: true, title: true, location: true, lastSeenAt: true } },
    },
    }),
    loadJobSuppressionState(input.userId),
  ]);
  if (hasApplicationForJob(candidate.jobPosting, applicationJobKeySet(existingApplications))) {
    throw new Error("This job is already tracked as an application.");
  }
  if (isJobSuppressed(candidate.jobPosting, suppressionState)) {
    throw new Error("This job is suppressed by a previous rejection, application, archive, or company cooldown.");
  }

  await prisma.jobProfileMatch.update({
    where: { id: candidate.id },
    data: { status: JobMatchStatus.approved, reviewedAt: new Date() },
  });

  const application = await prisma.application.create({
    data: {
      userId: input.userId,
      jobPostingId: candidate.jobPostingId,
      jobProfileMatchId: candidate.id,
      status: JobMatchStatus.approved,
      approvedAt: new Date(),
      notes: "Recruiting agency auto-approved this high-confidence match.",
    },
  });

  await prisma.applicationEvent.create({
    data: {
      applicationId: application.id,
      type: "status_changed",
      payload: {
        source: "recruiting_agency",
        status: "approved",
        score: candidate.overallScore,
        jobProfileMatchId: candidate.id,
        profile: candidate.jobSearchProfile.name,
        appliedLearning: input.learningRules?.appliedCategories ?? [],
      } as Prisma.InputJsonValue,
    },
  });

  return { applicationId: application.id, jobId: candidate.jobPostingId, matchId: candidate.id };
}
