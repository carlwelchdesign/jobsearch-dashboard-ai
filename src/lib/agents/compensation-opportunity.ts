import type { JobPosting, JobSearchProfile } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import { prisma } from "@/lib/prisma";

export type CompensationOpportunityInput = {
  applicationId: string;
  userId?: string;
};

export type CompensationOpportunityOutput = {
  applicationId: string;
  company: string;
  role: string;
  opportunityScore: number;
  compensationAssessment: string;
  remoteAssessment: string;
  freshnessAssessment: string;
  strategicValue: string[];
  negotiationPrep: string[];
  risks: string[];
  recommendedAction: "PURSUE" | "PURSUE_WITH_QUESTIONS" | "SAVE_FOR_LATER" | "DEPRIORITIZE";
  confidence: number;
  reasoningSummary: string;
};

type CompensationJob = Pick<JobPosting, "company" | "title" | "location" | "remoteType" | "salaryMin" | "salaryMax" | "salaryCurrency" | "lastSeenAt" | "description" | "staleScore">;
type CompensationProfile = Pick<JobSearchProfile, "name" | "remotePreference" | "salaryMin" | "salaryMax" | "salaryCurrency" | "includeUnknownSalary" | "industries" | "keywordsPreferred"> | null;

export async function runCompensationOpportunityAgent(input: CompensationOpportunityInput) {
  return runAgent<CompensationOpportunityInput, CompensationOpportunityOutput>({
    agentType: "COMPENSATION_OPPORTUNITY",
    input,
    userId: input.userId,
    execute: async () => {
      const application = await prisma.application.findUnique({
        where: { id: input.applicationId },
        include: {
          jobPosting: true,
          jobProfileMatch: {
            include: { jobSearchProfile: true },
          },
        },
      });
      if (!application) throw new Error("Application not found.");

      return buildCompensationOpportunity({
        applicationId: application.id,
        job: application.jobPosting,
        profile: application.jobProfileMatch?.jobSearchProfile ?? null,
      });
    },
  });
}

export function buildCompensationOpportunity({
  applicationId,
  job,
  profile,
}: {
  applicationId: string;
  job: CompensationJob;
  profile: CompensationProfile;
}): CompensationOpportunityOutput {
  const salarySignal = scoreSalary(job, profile);
  const remoteSignal = scoreRemote(job, profile);
  const freshnessSignal = scoreFreshness(job);
  const strategicSignal = scoreStrategicValue(job, profile);
  const opportunityScore = clamp(Math.round(salarySignal.score * 0.32 + remoteSignal.score * 0.24 + freshnessSignal.score * 0.18 + strategicSignal.score * 0.26));
  const risks = [...salarySignal.risks, ...remoteSignal.risks, ...freshnessSignal.risks];

  return {
    applicationId,
    company: job.company,
    role: job.title,
    opportunityScore,
    compensationAssessment: salarySignal.assessment,
    remoteAssessment: remoteSignal.assessment,
    freshnessAssessment: freshnessSignal.assessment,
    strategicValue: strategicSignal.signals,
    negotiationPrep: buildNegotiationPrep(job, profile, salarySignal.risks),
    risks,
    recommendedAction: recommendAction(opportunityScore, risks),
    confidence: confidence(job, profile),
    reasoningSummary: "Evaluated opportunity from saved salary, remote/location, freshness, stale risk, target profile, and job-description signals. No market data or external compensation claims were inferred.",
  };
}

function scoreSalary(job: CompensationJob, profile: CompensationProfile) {
  const targetMin = profile?.salaryMin ?? null;
  const currency = job.salaryCurrency ?? profile?.salaryCurrency ?? "USD";
  const risks: string[] = [];

  if (!job.salaryMin && !job.salaryMax) {
    risks.push("Salary range is missing.");
    return {
      score: profile?.includeUnknownSalary === false ? 42 : 62,
      risks,
      assessment: targetMin
        ? `No salary range is saved. Ask whether the range meets or exceeds ${currency} ${targetMin.toLocaleString()}.`
        : "No salary range is saved. Ask for the range before investing heavy effort.",
    };
  }

  const low = job.salaryMin ?? job.salaryMax ?? 0;
  const high = job.salaryMax ?? job.salaryMin ?? 0;
  if (targetMin && high < targetMin) {
    risks.push(`Saved salary range appears below target minimum of ${currency} ${targetMin.toLocaleString()}.`);
  }

  const score = targetMin
    ? high >= targetMin ? low >= targetMin ? 90 : 74 : 45
    : 78;

  return {
    score,
    risks,
    assessment: `Saved salary range: ${currency} ${low.toLocaleString()}${high !== low ? ` to ${high.toLocaleString()}` : ""}${targetMin ? `. Target minimum: ${currency} ${targetMin.toLocaleString()}.` : "."}`,
  };
}

function scoreRemote(job: CompensationJob, profile: CompensationProfile) {
  const preference = profile?.remotePreference ?? "any";
  const location = `${job.location ?? ""} ${job.remoteType}`.toLowerCase();
  const risks: string[] = [];
  let score = 68;

  if (preference === "any") score = 80;
  else if (preference === "remote_us_only") score = /remote|united states|us|u\.s\./.test(location) ? 88 : 48;
  else if (preference === "remote_global") score = /remote|global|worldwide|distributed/.test(location) ? 90 : 50;
  else if (preference === "remote_europe") score = /remote|europe|emea|eu/.test(location) ? 86 : 48;
  else if (preference === "hybrid") score = /hybrid/.test(location) ? 86 : 54;
  else if (preference === "onsite_relocation") score = /onsite|hybrid|relocation/.test(location) ? 78 : 46;

  if (score < 60) risks.push(`Remote/location signal may not match ${profile?.name ?? "the target profile"}.`);

  return {
    score,
    risks,
    assessment: `Role location is ${job.location ?? "unknown"} with ${job.remoteType} mode. Profile preference is ${preference}.`,
  };
}

function scoreFreshness(job: CompensationJob) {
  const ageDays = Math.max(0, Math.floor((Date.now() - job.lastSeenAt.getTime()) / 86_400_000));
  const risks: string[] = [];
  let score = ageDays <= 7 ? 92 : ageDays <= 21 ? 78 : ageDays <= 45 ? 62 : 42;
  if (job.staleScore >= 45) {
    score = Math.min(score, 45);
    risks.push(`Stale score is ${job.staleScore}.`);
  }
  if (ageDays > 45) risks.push(`Job was last seen ${ageDays} days ago.`);
  return {
    score,
    risks,
    assessment: `Last seen ${ageDays} days ago. Stale score is ${job.staleScore}.`,
  };
}

function scoreStrategicValue(job: CompensationJob, profile: CompensationProfile) {
  const text = `${job.title} ${job.description} ${profile?.industries ?? ""} ${profile?.keywordsPreferred ?? ""}`.toLowerCase();
  const signals: string[] = [];
  if (/\bsecurity|identity|auth|webauthn|passkey\b/.test(text)) signals.push("Security/identity positioning value.");
  if (/\bai|llm|agent|openai|automation\b/.test(text)) signals.push("AI product positioning value.");
  if (/\bdesign system|storybook|frontend platform\b/.test(text)) signals.push("Design systems or frontend platform value.");
  if (/\bdashboard|analytics|visualization|data\b/.test(text)) signals.push("Data-rich UI and dashboard value.");
  if (/\bmission|defense|geospatial|operator|simulation\b/.test(text)) signals.push("Mission software or visualization value.");
  if (/\bfull.?stack|next\.?js|node|postgres|api\b/.test(text)) signals.push("Full-stack SaaS execution value.");

  return {
    score: Math.min(95, 52 + signals.length * 9),
    signals: signals.length ? signals.slice(0, 6) : ["General senior product engineering value."],
  };
}

function buildNegotiationPrep(job: CompensationJob, profile: CompensationProfile, salaryRisks: string[]) {
  const prep = [
    "Clarify base salary, bonus, equity, benefits, and location-adjustment policy before investing late-stage interview time.",
    "Ask whether remote status is permanent, hybrid, location-limited, or team-dependent.",
  ];
  if (!job.salaryMin && !job.salaryMax) prep.unshift("Ask for the approved compensation range early.");
  if (salaryRisks.length) prep.push("Confirm whether the saved range is flexible for senior/staff-level scope.");
  if (profile?.salaryMin) prep.push(`Keep target floor anchored at ${profile.salaryCurrency} ${profile.salaryMin.toLocaleString()} unless strategic value justifies a tradeoff.`);
  return prep.slice(0, 5);
}

function recommendAction(score: number, risks: string[]): CompensationOpportunityOutput["recommendedAction"] {
  if (score >= 78 && risks.length <= 1) return "PURSUE";
  if (score >= 65) return "PURSUE_WITH_QUESTIONS";
  if (score >= 52) return "SAVE_FOR_LATER";
  return "DEPRIORITIZE";
}

function confidence(job: CompensationJob, profile: CompensationProfile) {
  let score = 0.44;
  if (job.salaryMin || job.salaryMax) score += 0.2;
  if (job.location) score += 0.12;
  if (profile) score += 0.12;
  if (job.description.length > 800) score += 0.1;
  return Math.min(0.9, score);
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
