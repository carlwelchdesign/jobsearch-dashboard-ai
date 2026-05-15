import type { JobEvaluation, JobPosting, JobSource } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";

export type CompanyResearchInput = {
  applicationId: string;
  userId?: string;
};

export type CompanyResearchOutput = {
  applicationId: string;
  company: string;
  role: string;
  brief: string;
  roleThemes: string[];
  likelyTeamNeeds: string[];
  positioningAngles: string[];
  questionsToAnswer: string[];
  risks: string[];
  sourceNotes: string[];
  confidence: number;
  reasoningSummary: string;
};

type ResearchJob = Pick<JobPosting, "company" | "title" | "location" | "remoteType" | "description" | "salaryMin" | "salaryMax" | "applicationUrl" | "rawData" | "atsProvider"> & {
  source: Pick<JobSource, "name" | "type" | "config"> | null;
  evaluations: Array<Pick<JobEvaluation, "strengths" | "risks" | "missingKeywords" | "recommendedResumeProfile">>;
};

export async function runCompanyResearchAgent(input: CompanyResearchInput) {
  return runAgent<CompanyResearchInput, CompanyResearchOutput>({
    agentType: "COMPANY_RESEARCH",
    input,
    userId: input.userId,
    execute: async () => {
      const application = await prisma.application.findUnique({
        where: { id: input.applicationId },
        include: {
          jobPosting: {
            include: {
              evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
              source: true,
            },
          },
        },
      });
      if (!application) throw new Error("Application not found.");

      return buildCompanyResearch({
        applicationId: application.id,
        job: application.jobPosting,
      });
    },
  });
}

export function buildCompanyResearch({ applicationId, job }: { applicationId: string; job: ResearchJob }): CompanyResearchOutput {
  const jobText = `${job.title} ${job.description}`.toLowerCase();
  const roleThemes = inferRoleThemes(jobText);
  const likelyTeamNeeds = inferTeamNeeds(jobText);
  const evaluation = job.evaluations[0];
  const strengths = jsonArray(evaluation?.strengths);
  const risks = Array.from(new Set([...jsonArray(evaluation?.risks), ...inferCompanyRisks(job)]));
  const positioningAngles = buildPositioningAngles(job, roleThemes, strengths, evaluation?.recommendedResumeProfile ?? null);
  const sourceNotes = buildSourceNotes(job);

  return {
    applicationId,
    company: job.company,
    role: job.title,
    brief: buildBrief(job, roleThemes, likelyTeamNeeds),
    roleThemes,
    likelyTeamNeeds,
    positioningAngles,
    questionsToAnswer: buildQuestions(job, roleThemes),
    risks,
    sourceNotes,
    confidence: job.description.length >= 1200 ? 0.82 : job.description.length >= 500 ? 0.68 : 0.5,
    reasoningSummary: "Built a company/job brief from the saved job description, source metadata, and latest fit evaluation. No external facts were inferred.",
  };
}

function buildBrief(job: ResearchJob, roleThemes: string[], likelyTeamNeeds: string[]) {
  const location = job.location ? ` Location is listed as ${job.location} with ${job.remoteType} mode.` : "";
  const salary = job.salaryMin || job.salaryMax ? ` Salary data is ${[job.salaryMin, job.salaryMax].filter(Boolean).join(" to ")}.` : "";
  return `${job.company} is evaluating candidates for ${job.title}.${location}${salary} The saved description points most strongly to ${roleThemes.slice(0, 3).join(", ") || "senior product engineering"}. The likely team need is ${likelyTeamNeeds[0] ?? "someone who can clarify ambiguous product requirements and deliver reliable software"}.`;
}

function inferRoleThemes(text: string) {
  const themes = new Set<string>();
  if (/\breact|frontend|front-end|ui|web\b/.test(text)) themes.add("React/frontend product UI");
  if (/\btypescript|javascript|next\.?js\b/.test(text)) themes.add("TypeScript and modern web architecture");
  if (/\bdesign system|storybook|component library|frontend platform\b/.test(text)) themes.add("design systems and frontend platform");
  if (/\bauth|identity|security|webauthn|passkey|compliance\b/.test(text)) themes.add("security and identity workflows");
  if (/\bai|llm|agent|openai|automation|copilot\b/.test(text)) themes.add("AI product workflows");
  if (/\bdata|dashboard|analytics|visualization|reporting\b/.test(text)) themes.add("data-rich dashboards and visualization");
  if (/\bapi|node|postgres|backend|full.?stack\b/.test(text)) themes.add("full-stack SaaS delivery");
  if (/\bmission|defense|geospatial|operator|simulation|autonomy\b/.test(text)) themes.add("mission software and operational tooling");
  if (themes.size === 0) themes.add("senior product engineering");
  return Array.from(themes).slice(0, 7);
}

function inferTeamNeeds(text: string) {
  const needs = new Set<string>();
  if (/\bscale|performance|reliability|latency\b/.test(text)) needs.add("improve reliability and performance without slowing product delivery");
  if (/\bcross-functional|designer|product manager|stakeholder\b/.test(text)) needs.add("work cleanly across product, design, and engineering");
  if (/\bambiguous|0 to 1|startup|ownership|lead\b/.test(text)) needs.add("take ambiguous work from problem framing through shipped product");
  if (/\bdesign system|component\b/.test(text)) needs.add("raise UI consistency and component quality across teams");
  if (/\bsecurity|compliance|identity|auth\b/.test(text)) needs.add("make complex security workflows usable and trustworthy");
  if (/\bdata|dashboard|reporting|analytics\b/.test(text)) needs.add("turn complex data into clear operational interfaces");
  if (needs.size === 0) needs.add("ship high-quality product features with senior judgment");
  return Array.from(needs).slice(0, 6);
}

function buildPositioningAngles(job: ResearchJob, themes: string[], strengths: string[], resumeProfile: string | null) {
  const angles = new Set<string>();
  if (resumeProfile) angles.add(`Lead with the ${resumeProfile} resume variant.`);
  for (const theme of themes.slice(0, 3)) {
    angles.add(`Anchor examples around ${theme}.`);
  }
  for (const strength of strengths.slice(0, 3)) {
    angles.add(`Use evidence for ${strength}.`);
  }
  if (angles.size === 0) angles.add(`Position as a senior engineer who can reduce execution risk for ${job.company}'s ${job.title} work.`);
  return Array.from(angles).slice(0, 6);
}

function buildQuestions(job: ResearchJob, themes: string[]) {
  const questions = [
    `What problem should the ${job.title} hire solve first at ${job.company}?`,
    "What does strong execution look like in the first 90 days?",
  ];
  if (themes.some((theme) => /frontend|design systems|platform/i.test(theme))) questions.push("Where is the frontend architecture helping or slowing product teams today?");
  if (themes.some((theme) => /security|identity/i.test(theme))) questions.push("What are the hardest UX tradeoffs in the security or identity workflows?");
  if (themes.some((theme) => /AI/i.test(theme))) questions.push("How does the team evaluate AI output quality and user trust?");
  if (themes.some((theme) => /data|visualization/i.test(theme))) questions.push("Which data workflows are hardest for users to understand or act on?");
  return questions.slice(0, 6);
}

function inferCompanyRisks(job: ResearchJob) {
  const risks: string[] = [];
  if (job.description.length < 450) risks.push("Job description is thin, so fit confidence is limited.");
  if (!job.salaryMin && !job.salaryMax) risks.push("Salary range is not available in the saved job data.");
  if (!job.applicationUrl) risks.push("Application URL is missing.");
  if (/\bclearance required\b/i.test(job.description)) risks.push("Role may require clearance.");
  return risks;
}

function buildSourceNotes(job: ResearchJob) {
  const notes = [
    job.source ? `Source: ${job.source.name} (${job.source.type}).` : "Source is not attached.",
    `ATS provider: ${job.atsProvider}.`,
  ];
  if (job.applicationUrl) notes.push("Application URL is saved.");
  const rawData = job.rawData && typeof job.rawData === "object" && !Array.isArray(job.rawData) ? job.rawData as Record<string, unknown> : {};
  if (rawData.companySource === true) notes.push("Found through the curated company source list.");
  return notes;
}
