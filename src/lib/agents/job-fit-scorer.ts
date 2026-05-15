import type { CandidateEvidence, JobEvaluation, JobPosting, JobRecommendedAction, JobSearchProfile, Prisma } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import { retrieveCandidateEvidence } from "@/lib/evidence/retrieval";
import { jsonArray } from "@/lib/json";
import { scoreJobForProfile } from "@/lib/job-search/scoring";
import { prisma } from "@/lib/prisma";

export type JobFitScoringInput = {
  jobPostingId: string;
  jobSearchProfileId: string;
  userId?: string;
};

export type JobFitScoringOutput = {
  evaluationId: string;
  fitScore: number;
  opportunityScore: number;
  confidenceScore: number;
  recommendedAction: JobRecommendedAction;
  recommendedResumeProfile: string | null;
  strengths: string[];
  risks: string[];
  missingKeywords: string[];
  evidenceRefs: string[];
  explanation: string;
};

type EvaluationDraft = Omit<JobFitScoringOutput, "evaluationId">;

export async function runJobFitScoringAgent(input: JobFitScoringInput) {
  return runAgent<JobFitScoringInput, JobFitScoringOutput>({
    agentType: "JOB_FIT_SCORER",
    input,
    userId: input.userId,
    execute: async () => {
      const [job, profile, candidateProfile] = await Promise.all([
        prisma.jobPosting.findUnique({ where: { id: input.jobPostingId }, include: { source: true } }),
        prisma.jobSearchProfile.findUnique({ where: { id: input.jobSearchProfileId } }),
        prisma.userProfile.findFirst({ where: input.userId ? { userId: input.userId } : undefined, orderBy: { createdAt: "asc" } }),
      ]);

      if (!job) throw new Error("Job posting not found.");
      if (!profile) throw new Error("Search profile not found.");

      const evidence = candidateProfile
        ? await retrieveCandidateEvidence({
            jobId: job.id,
            searchProfileId: profile.id,
            query: buildEvidenceQuery(job, profile),
            candidateProfileId: candidateProfile.id,
            confidenceMinimum: "INFERRED",
            usableFor: "resume",
            limit: 10,
          })
        : [];
      const draft = buildJobEvaluation({ job, profile, evidence });
      const evaluation = await persistJobEvaluation(job.id, profile.id, draft);
      await persistCompatibleMatch(job.id, profile.id, draft);

      return {
        evaluationId: evaluation.id,
        ...draft,
      };
    },
  });
}

export function buildJobEvaluation({
  job,
  profile,
  evidence,
}: {
  job: Pick<JobPosting, "title" | "company" | "location" | "description" | "salaryMin" | "salaryMax" | "remoteType" | "lastSeenAt"> & { source?: { name: string } | null };
  profile: JobSearchProfile;
  evidence: CandidateEvidence[];
}): EvaluationDraft {
  const baseline = scoreJobForProfile(job, profile);
  const required = jsonArray(profile.keywordsRequired);
  const preferred = jsonArray(profile.keywordsPreferred);
  const jobText = [job.title, job.company, job.location ?? "", job.description].join(" ").toLowerCase();
  const evidenceRefs = evidence.map((item) => item.id);
  const evidenceMatches = evidence
    .filter((item) => textHasAny(jobText, [item.title, ...jsonArray(item.tags)]))
    .map((item) => item.title)
    .slice(0, 5);
  const evidenceSupportScore = clamp(45 + evidence.length * 6 + evidenceMatches.length * 7);
  const fitScore = clamp(Math.round(baseline.overallScore * 0.72 + evidenceSupportScore * 0.28));
  const opportunityScore = calculateOpportunityScore(job, profile, baseline);
  const confidenceScore = calculateConfidenceScore(job, profile, evidence, required, preferred);
  const missingKeywords = Array.from(new Set([...baseline.missingKeywords, ...required.filter((term) => !jobText.includes(term.toLowerCase()))]));
  const risks = Array.from(new Set([...baseline.concerns, ...opportunityRisks(job, profile), ...confidenceRisks(confidenceScore, evidence.length)]));
  const strengths = Array.from(new Set([...baseline.strongestMatches, ...evidenceMatches])).slice(0, 10);
  const recommendedAction = recommendAction(fitScore, opportunityScore, confidenceScore, risks);
  const recommendedResumeProfile = recommendResumeProfile(jobText, strengths);

  return {
    fitScore,
    opportunityScore,
    confidenceScore,
    recommendedAction,
    recommendedResumeProfile,
    strengths,
    risks,
    missingKeywords,
    evidenceRefs,
    explanation: explainEvaluation({ job, profile, fitScore, opportunityScore, confidenceScore, strengths, risks, recommendedAction }),
  };
}

async function persistJobEvaluation(jobPostingId: string, jobSearchProfileId: string, draft: EvaluationDraft): Promise<JobEvaluation> {
  const data = {
    fitScore: draft.fitScore,
    opportunityScore: draft.opportunityScore,
    confidenceScore: draft.confidenceScore,
    recommendedAction: draft.recommendedAction,
    recommendedResumeProfile: draft.recommendedResumeProfile,
    strengths: draft.strengths as Prisma.InputJsonValue,
    risks: draft.risks as Prisma.InputJsonValue,
    missingKeywords: draft.missingKeywords as Prisma.InputJsonValue,
    evidenceRefs: draft.evidenceRefs as Prisma.InputJsonValue,
    explanation: draft.explanation,
  };

  return prisma.jobEvaluation.upsert({
    where: {
      jobPostingId_jobSearchProfileId: {
        jobPostingId,
        jobSearchProfileId,
      },
    },
    update: data,
    create: {
      jobPostingId,
      jobSearchProfileId,
      ...data,
    },
  });
}

async function persistCompatibleMatch(jobPostingId: string, jobSearchProfileId: string, draft: EvaluationDraft) {
  const existing = await prisma.jobProfileMatch.findUnique({
    where: {
      jobPostingId_jobSearchProfileId: {
        jobPostingId,
        jobSearchProfileId,
      },
    },
  });

  return prisma.jobProfileMatch.upsert({
    where: {
      jobPostingId_jobSearchProfileId: {
        jobPostingId,
        jobSearchProfileId,
      },
    },
    update: {
      overallScore: draft.fitScore,
      skillFit: draft.fitScore,
      compensationFit: draft.opportunityScore,
      strongestMatches: draft.strengths as Prisma.InputJsonValue,
      concerns: draft.risks as Prisma.InputJsonValue,
      missingKeywords: draft.missingKeywords as Prisma.InputJsonValue,
      recommendedAction: humanRecommendedAction(draft.recommendedAction),
      aiExplanation: draft.explanation,
      status: existing?.status ?? "needs_review",
    },
    create: {
      jobPostingId,
      jobSearchProfileId,
      status: "needs_review",
      overallScore: draft.fitScore,
      titleFit: draft.fitScore,
      skillFit: draft.fitScore,
      seniorityFit: draft.fitScore,
      industryFit: draft.fitScore,
      compensationFit: draft.opportunityScore,
      remoteFit: draft.opportunityScore,
      relocationFit: draft.opportunityScore,
      strongestMatches: draft.strengths as Prisma.InputJsonValue,
      concerns: draft.risks as Prisma.InputJsonValue,
      missingKeywords: draft.missingKeywords as Prisma.InputJsonValue,
      recommendedAction: humanRecommendedAction(draft.recommendedAction),
      aiExplanation: draft.explanation,
    },
  });
}

function buildEvidenceQuery(job: JobPosting, profile: JobSearchProfile) {
  return [
    job.title,
    job.company,
    job.location ?? "",
    ...jsonArray(profile.titles),
    ...jsonArray(profile.keywordsRequired),
    ...jsonArray(profile.keywordsPreferred),
    ...jsonArray(profile.industries),
    job.description.slice(0, 1200),
  ].join(" ");
}

function calculateOpportunityScore(job: Pick<JobPosting, "description" | "salaryMin" | "salaryMax" | "remoteType" | "lastSeenAt"> & { source?: { name: string } | null }, profile: JobSearchProfile, baseline: ReturnType<typeof scoreJobForProfile>) {
  const ageDays = Math.max(0, Math.floor((Date.now() - job.lastSeenAt.getTime()) / 86_400_000));
  const freshness = ageDays <= 7 ? 92 : ageDays <= 21 ? 78 : ageDays <= 45 ? 62 : 44;
  const salary = job.salaryMin || profile.includeUnknownSalary ? 78 : 42;
  const source = job.source?.name ? 78 : 60;
  const descriptionQuality = job.description.length > 1200 ? 82 : job.description.length > 400 ? 68 : 45;

  return clamp(Math.round(baseline.remoteFit * 0.22 + baseline.compensationFit * 0.18 + freshness * 0.22 + salary * 0.14 + source * 0.1 + descriptionQuality * 0.14));
}

function calculateConfidenceScore(job: Pick<JobPosting, "description" | "salaryMin" | "salaryMax" | "location">, profile: JobSearchProfile, evidence: CandidateEvidence[], required: string[], preferred: string[]) {
  const description = job.description.length > 1200 ? 30 : job.description.length > 400 ? 22 : 10;
  const evidenceScore = Math.min(30, evidence.length * 5);
  const profileSpecificity = Math.min(20, (jsonArray(profile.titles).length + required.length + preferred.length) * 3);
  const concreteJobData = (job.salaryMin || job.salaryMax ? 10 : 0) + (job.location ? 10 : 0);

  return clamp(description + evidenceScore + profileSpecificity + concreteJobData);
}

function opportunityRisks(job: Pick<JobPosting, "salaryMin" | "salaryMax" | "lastSeenAt">, profile: JobSearchProfile) {
  const risks: string[] = [];
  if (!job.salaryMin && !job.salaryMax && !profile.includeUnknownSalary) risks.push("Salary is unknown for a profile that filters on compensation.");
  const ageDays = Math.max(0, Math.floor((Date.now() - job.lastSeenAt.getTime()) / 86_400_000));
  if (ageDays > 45) risks.push("Job may be stale based on last seen date.");
  return risks;
}

function confidenceRisks(confidenceScore: number, evidenceCount: number) {
  const risks: string[] = [];
  if (evidenceCount === 0) risks.push("No approved candidate evidence was retrieved for this role.");
  if (confidenceScore < 50) risks.push("Evaluation confidence is low because job or evidence data is incomplete.");
  return risks;
}

function recommendAction(fitScore: number, opportunityScore: number, confidenceScore: number, risks: string[]): JobRecommendedAction {
  if (confidenceScore < 45) return "NEEDS_REVIEW";
  if (risks.some((risk) => /excluded terms|excluded company/i.test(risk))) return "REJECT";
  if (fitScore >= 86 && opportunityScore >= 72) return "APPLY_NOW";
  if (fitScore >= 74 && opportunityScore >= 62) return "MAYBE_APPLY";
  if (fitScore >= 65 || opportunityScore >= 76) return "SAVE_FOR_LATER";
  return "REJECT";
}

function recommendResumeProfile(jobText: string, strengths: string[]) {
  const text = `${jobText} ${strengths.join(" ")}`.toLowerCase();
  if (/\b(security|identity|auth|authentication|passkey|webauthn|compliance)\b/.test(text)) return "Security SaaS / Identity";
  if (/\b(ai|llm|agent|openai|machine learning|ml tooling)\b/.test(text)) return "AI Product Engineer";
  if (/\b(defense|mission|geospatial|simulation|operator|autonomy)\b/.test(text)) return "Defense / Mission Software UI";
  if (/\b(design system|storybook|component library|frontend platform)\b/.test(text)) return "Design Systems / Platform UI";
  if (/\b(full stack|backend|node|api|postgres|saas)\b/.test(text)) return "Full-Stack SaaS";
  return "Senior Frontend / Product Engineering";
}

function explainEvaluation({
  job,
  profile,
  fitScore,
  opportunityScore,
  confidenceScore,
  strengths,
  risks,
  recommendedAction,
}: {
  job: Pick<JobPosting, "title" | "company">;
  profile: Pick<JobSearchProfile, "name">;
  fitScore: number;
  opportunityScore: number;
  confidenceScore: number;
  strengths: string[];
  risks: string[];
  recommendedAction: JobRecommendedAction;
}) {
  const strengthText = strengths.length ? `Strongest signals: ${strengths.slice(0, 4).join(", ")}.` : "No strong approved-evidence signals were found.";
  const riskText = risks.length ? `Risks: ${risks.slice(0, 3).join(", ")}.` : "No major blocking risks were detected.";
  return `${job.title} at ${job.company} was evaluated against ${profile.name}. Fit ${fitScore}, opportunity ${opportunityScore}, confidence ${confidenceScore}. Recommended action: ${humanRecommendedAction(recommendedAction)}. ${strengthText} ${riskText}`;
}

function humanRecommendedAction(action: JobRecommendedAction) {
  const labels: Record<JobRecommendedAction, string> = {
    APPLY_NOW: "Apply now",
    MAYBE_APPLY: "Maybe apply",
    SAVE_FOR_LATER: "Save for later",
    REJECT: "Reject",
    NEEDS_REVIEW: "Needs review",
  };
  return labels[action];
}

function textHasAny(text: string, terms: string[]) {
  return terms.some((term) => term.length >= 3 && text.includes(term.toLowerCase()));
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
