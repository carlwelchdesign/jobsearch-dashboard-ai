import { JobMatchStatus, Prisma, type SkillAdjustment } from "@prisma/client";
import { z } from "zod";
import { runApplicationQaAgent } from "@/lib/agents/application-qa";
import { runCandidateIntelligenceAgent } from "@/lib/agents/candidate-intelligence";
import { runCompanyResearchAgent } from "@/lib/agents/company-research";
import { runCompensationOpportunityAgent } from "@/lib/agents/compensation-opportunity";
import { runDailyCommandCenterAgent } from "@/lib/agents/daily-command-center";
import { runDuplicateStaleJobDetectorAgent } from "@/lib/agents/duplicate-stale-job-detector";
import { runGithubPortfolioReviewAgent } from "@/lib/agents/github-portfolio-review";
import { runInterviewPrepAgent } from "@/lib/agents/interview-prep";
import { runJobFitScoringAgent } from "@/lib/agents/job-fit-scorer";
import { runNetworkingStrategyAgent } from "@/lib/agents/networking-strategy";
import { runOutcomeLearningAgent } from "@/lib/agents/outcome-learning";
import { runPortfolioMatchAgent } from "@/lib/agents/portfolio-match";
import { runRecruiterIntelligenceAgent } from "@/lib/agents/recruiter-intelligence";
import { runResumeStrategyAgent } from "@/lib/agents/resume-strategy";
import { runSearchExpansionAgent } from "@/lib/agents/search-expansion";
import { runSearchProfileManagerAgent } from "@/lib/agents/search-profile-manager";
import { applicationJobKeySet, hasApplicationForJob } from "@/lib/applications/job-filters";
import { prepareApplicationPackage } from "@/lib/applications/prepare-package";
import { prisma } from "@/lib/prisma";
import { applyNumericThresholdAdjustments } from "@/lib/skills/adjustments";
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
    execute: async (input: any) => (await runCandidateIntelligenceAgent(input)).output,
  },
  resume_strategy: {
    id: "resume_strategy",
    label: "Resume Strategy",
    agentType: "RESUME_STRATEGY",
    riskLevel: "LOW",
    inputSchema: jobProfileInput,
    outputSchema: anyOutput,
    defaultPolicy: lowRiskPolicy,
    execute: async (input: any) => (await runResumeStrategyAgent(input)).output,
  },
  cover_letter_writer: {
    id: "cover_letter_writer",
    label: "Cover Letter Writer",
    agentType: "COVER_LETTER_WRITER",
    riskLevel: "HIGH",
    inputSchema: z.object({ jobPostingId: z.string(), ...optionalUser }),
    outputSchema: anyOutput,
    defaultPolicy: manualSubmitPolicy,
    execute: async (input: any) => prepareApplicationPackage(input.jobPostingId),
  },
  job_fit_scorer: {
    id: "job_fit_scorer",
    label: "Job Fit Scorer",
    agentType: "JOB_FIT_SCORER",
    riskLevel: "LOW",
    inputSchema: jobProfileInput,
    outputSchema: anyOutput,
    defaultPolicy: localMutationPolicy,
    execute: async (input: any) => (await runJobFitScoringAgent(input)).output,
  },
  search_profile_manager: {
    id: "search_profile_manager",
    label: "Search Profile Manager",
    agentType: "SEARCH_PROFILE_MANAGER",
    riskLevel: "LOW",
    inputSchema: z.object(optionalUser),
    outputSchema: anyOutput,
    defaultPolicy: localMutationPolicy,
    execute: async (input: any) => (await runSearchProfileManagerAgent(input)).output,
  },
  recruiter_intelligence: {
    id: "recruiter_intelligence",
    label: "Recruiter Intelligence",
    agentType: "RECRUITER_INTELLIGENCE",
    riskLevel: "HIGH",
    inputSchema: z.object({ applicationId: z.string().optional(), jobPostingId: z.string().optional(), contactId: z.string().optional(), ...optionalUser }),
    outputSchema: anyOutput,
    defaultPolicy: { ...localMutationPolicy, externalAction: "draft_only" as const },
    execute: async (input: any) => (await runRecruiterIntelligenceAgent(input)).output,
  },
  portfolio_match: skillForApplication("portfolio_match", "Portfolio Match", "PORTFOLIO_MATCH", runPortfolioMatchAgent),
  github_portfolio_review: {
    id: "github_portfolio_review",
    label: "GitHub Portfolio Review",
    agentType: "GITHUB_PORTFOLIO_REVIEW",
    riskLevel: "LOW",
    inputSchema: z.object(optionalUser),
    outputSchema: anyOutput,
    defaultPolicy: lowRiskPolicy,
    execute: async (input: any) => (await runGithubPortfolioReviewAgent(input)).output,
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
    execute: async (input: any) => (await runApplicationQaAgent(input)).output,
  },
  interview_prep: skillForApplication("interview_prep", "Interview Prep", "INTERVIEW_PREP", runInterviewPrepAgent),
  outcome_learning: {
    id: "outcome_learning",
    label: "Outcome Learning",
    agentType: "OUTCOME_LEARNING",
    riskLevel: "LOW",
    inputSchema: z.object(optionalUser),
    outputSchema: anyOutput,
    defaultPolicy: lowRiskPolicy,
    execute: async (input: any) => (await runOutcomeLearningAgent(input)).output,
  },
  compensation_opportunity: skillForApplication("compensation_opportunity", "Compensation Opportunity", "COMPENSATION_OPPORTUNITY", runCompensationOpportunityAgent),
  networking_strategy: {
    id: "networking_strategy",
    label: "Networking Strategy",
    agentType: "NETWORKING_STRATEGY",
    riskLevel: "LOW",
    inputSchema: z.object(optionalUser),
    outputSchema: anyOutput,
    defaultPolicy: lowRiskPolicy,
    execute: async (input: any) => (await runNetworkingStrategyAgent(input)).output,
  },
  company_research: skillForApplication("company_research", "Company Research", "COMPANY_RESEARCH", runCompanyResearchAgent),
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
    execute: async (input: any) => (await runApplicationQaAgent(input)).output,
  },
  duplicate_stale_job_detector: {
    id: "duplicate_stale_job_detector",
    label: "Duplicate/Stale Job Detector",
    agentType: "DUPLICATE_STALE_JOB_DETECTOR",
    riskLevel: "LOW",
    inputSchema: jobInput,
    outputSchema: anyOutput,
    defaultPolicy: localMutationPolicy,
    execute: async (input: any) => (await runDuplicateStaleJobDetectorAgent(input)).output,
  },
  search_expansion: {
    id: "search_expansion",
    label: "Search Expansion",
    agentType: "SEARCH_EXPANSION",
    riskLevel: "LOW",
    inputSchema: z.object(optionalUser),
    outputSchema: anyOutput,
    defaultPolicy: lowRiskPolicy,
    execute: async (input: any) => (await runSearchExpansionAgent(input)).output,
  },
  daily_command_center: {
    id: "daily_command_center",
    label: "Daily Command Center",
    agentType: "DAILY_COMMAND_CENTER",
    riskLevel: "LOW",
    inputSchema: z.object(optionalUser),
    outputSchema: anyOutput,
    defaultPolicy: lowRiskPolicy,
    execute: async (input: any) => (await runDailyCommandCenterAgent(input)).output,
  },
  prepare_application_packet: {
    id: "prepare_application_packet",
    label: "Prepare Application Packet",
    riskLevel: "HIGH",
    inputSchema: z.object({ jobPostingId: z.string(), userId: z.string().optional() }),
    outputSchema: anyOutput,
    defaultPolicy: manualSubmitPolicy,
    execute: async (input: any) => prepareApplicationPackage(input.jobPostingId),
  },
  approve_agency_match: {
    id: "approve_agency_match",
    label: "Approve Agency Match",
    riskLevel: "HIGH",
    inputSchema: z.object({ userId: z.string(), matchId: z.string(), minimumScore: z.number().int().min(0).max(100).default(90) }),
    outputSchema: anyOutput,
    defaultPolicy: localMutationPolicy,
    applyAdjustments: (input: any, adjustments: SkillAdjustment[]) => applyNumericThresholdAdjustments(input, adjustments, "minimumScore", { min: 85, max: 98, maxDelta: 5 }),
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

async function approveAgencyMatch(input: { userId: string; matchId: string; minimumScore: number }) {
  const candidate = await prisma.jobProfileMatch.findUnique({
    where: { id: input.matchId },
    include: { jobPosting: true, jobSearchProfile: { select: { name: true } } },
  });
  if (!candidate) throw new Error("Agency match not found.");
  if (candidate.status !== JobMatchStatus.needs_review) throw new Error("Agency match is no longer awaiting review.");
  if (candidate.overallScore < input.minimumScore) throw new Error("Agency match score is below the current approval threshold.");
  if (!candidate.jobPosting.applicationUrl) throw new Error("Agency match does not have an application URL.");

  const existingApplications = await prisma.application.findMany({
    where: { userId: input.userId },
    select: {
      status: true,
      jobPosting: { select: { company: true, title: true, location: true, lastSeenAt: true } },
    },
  });
  if (hasApplicationForJob(candidate.jobPosting, applicationJobKeySet(existingApplications))) {
    throw new Error("This job is already tracked as an application.");
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
      } as Prisma.InputJsonValue,
    },
  });

  return { applicationId: application.id, jobId: candidate.jobPostingId, matchId: candidate.id };
}
