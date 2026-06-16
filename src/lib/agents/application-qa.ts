import type { JobPosting } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import { evaluateAshbyCriteriaVisibility, isAshbyApplication, type AshbyCriteriaVisibility } from "@/lib/applications/ashby-risk";
import { prisma } from "@/lib/prisma";
import type { QualityProposalLearningRules } from "@/lib/skills/adjustments";

export type ApplicationQaInput = {
  jobPostingId: string;
  userId?: string;
  resumeMarkdown?: string | null;
  coverLetterBody?: string | null;
  evidenceRefs?: string[];
  learningRules?: QualityProposalLearningRules;
};

export type ApplicationQaOutput = {
  status: "PASS" | "NEEDS_REVIEW";
  score: number;
  warnings: string[];
  unsupportedClaims: string[];
  styleViolations: string[];
  suggestedEdits: string[];
  evidenceRefs: string[];
  reasoningSummary: string;
  confidence: number;
  appliedLearning?: string[];
  ashbyCriteriaVisibility?: AshbyCriteriaVisibility;
};

export async function runApplicationQaAgent(input: ApplicationQaInput) {
  return runAgent<ApplicationQaInput, ApplicationQaOutput>({
    agentType: "APPLICATION_QA",
    input,
    userId: input.userId,
    execute: async () => {
      const job = await prisma.jobPosting.findUnique({ where: { id: input.jobPostingId } });
      if (!job) throw new Error("Job posting not found.");
      return reviewApplicationMaterials({
        job,
        resumeMarkdown: input.resumeMarkdown,
        coverLetterBody: input.coverLetterBody,
        evidenceRefs: input.evidenceRefs ?? [],
        learningRules: input.learningRules,
      });
    },
  });
}

export function reviewApplicationMaterials({
  job,
  resumeMarkdown,
  coverLetterBody,
  evidenceRefs,
  learningRules,
}: {
  job: Pick<JobPosting, "title" | "company" | "description"> & Partial<Pick<JobPosting, "atsProvider" | "applicationUrl">>;
  resumeMarkdown?: string | null;
  coverLetterBody?: string | null;
  evidenceRefs: string[];
  learningRules?: QualityProposalLearningRules;
}): ApplicationQaOutput {
  const resume = resumeMarkdown ?? "";
  const coverLetter = coverLetterBody ?? "";
  const combined = [resume, coverLetter].filter(Boolean).join("\n\n");
  const warnings: string[] = [];
  const unsupportedClaims: string[] = [];
  const styleViolations: string[] = [];
  const suggestedEdits: string[] = [];

  if (!resume && !coverLetter) warnings.push("No generated resume or cover letter was provided for QA.");
  if (resume && resume.length < 1500) warnings.push("Resume appears short for a senior role.");
  if (coverLetter && coverLetter.length > 2400) warnings.push("Cover letter is longer than recommended.");
  if (coverLetter && !mentionsCompanyOrRole(coverLetter, job)) warnings.push("Cover letter does not clearly anchor to the company or role.");
  if (evidenceRefs.length === 0) warnings.push("No evidence references are attached to these materials.");
  if (learningRules?.coverLetterFieldQa && !coverLetter) {
    warnings.push("Active learning: cover-letter fields have been missed before, so confirm whether this application needs a cover letter.");
    suggestedEdits.push("If the application asks why you want to join, paste or adapt the generated cover letter before submit.");
  }
  if (learningRules?.fieldClassificationQa) {
    warnings.push("Active learning: field-classification mistakes have been reported, so manually review unknown required fields before submit.");
  }
  const inferredVersionClaim = inferredVersionLanguage(resume);
  if (inferredVersionClaim) {
    unsupportedClaims.push(inferredVersionClaim);
    suggestedEdits.push("Remove inferred version language from the resume, or approve the exact version in the resume profile first.");
  }
  const ashbyCriteriaVisibility = resume && isAshbyApplication({ atsProvider: job.atsProvider, applicationUrl: job.applicationUrl })
    ? evaluateAshbyCriteriaVisibility({ jobTitle: job.title, jobDescription: job.description, resumeText: resume })
    : undefined;
  if (ashbyCriteriaVisibility?.warnings.length) {
    warnings.push(...ashbyCriteriaVisibility.warnings);
    suggestedEdits.push(...ashbyCriteriaVisibility.suggestedEdits);
  }

  if (/[—–]/.test(combined)) {
    styleViolations.push("Uses em dash or en dash punctuation.");
    suggestedEdits.push("Replace em dashes and en dashes with commas, periods, or parentheses.");
  }
  if (/\b(it'?s not\b.+\bit'?s\b|\bnot only\b.+\bbut also\b)/i.test(combined)) {
    styleViolations.push("Contains an obvious AI-style contrast construction.");
    suggestedEdits.push("Rewrite contrast phrases as direct statements.");
  }
  if (/\b(excited to apply|thrilled to apply|passionate about|game[- ]changer|cutting[- ]edge|world[- ]class|synergy|leverage my)\b/i.test(combined)) {
    styleViolations.push("Contains generic or inflated application language.");
    suggestedEdits.push("Replace generic enthusiasm with one specific reason the role matches verified experience.");
  }
  if (/\b\d+%|\$\d+|\b\d+x\b/i.test(combined) && !/\b\d+%|\$\d+|\b\d+x\b/i.test(resume)) {
    unsupportedClaims.push("Metric appears outside the resume evidence context. Confirm it exists in approved evidence.");
  }
  for (const claim of riskyClaims(combined)) {
    unsupportedClaims.push(claim);
  }

  const penalty = warnings.length * 8 + unsupportedClaims.length * 18 + styleViolations.length * 10;
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const status = unsupportedClaims.length || styleViolations.length || score < 78 || ashbyCriteriaVisibility?.status !== "ready" ? "NEEDS_REVIEW" : "PASS";

  return {
    status,
    score,
    warnings,
    unsupportedClaims,
    styleViolations,
    suggestedEdits,
    evidenceRefs,
    reasoningSummary: `Reviewed generated materials for ${job.company}'s ${job.title} role against truthfulness and style rules.`,
    confidence: combined.length > 1500 && evidenceRefs.length > 0 ? 0.84 : 0.62,
    appliedLearning: learningRules?.appliedCategories?.length ? learningRules.appliedCategories : undefined,
    ashbyCriteriaVisibility,
  };
}

function mentionsCompanyOrRole(text: string, job: Pick<JobPosting, "title" | "company">) {
  const normalized = text.toLowerCase();
  const companyToken = job.company.toLowerCase().split(/\s+/)[0];
  const roleToken = job.title.toLowerCase().split(/\s+/).find((part) => part.length > 4);
  return normalized.includes(companyToken) || Boolean(roleToken && normalized.includes(roleToken));
}

function riskyClaims(text: string) {
  const claims: string[] = [];
  const patterns = [
    { pattern: /\bmanaged a team of\b/i, label: "Claims people-management scope. Confirm approved evidence supports it." },
    { pattern: /\bmachine learning model\b|\btrained models\b|\bML research\b/i, label: "Claims ML research or model-training depth. Confirm approved evidence supports it." },
    { pattern: /\bKubernetes\b|\bTerraform\b|\bRust\b|\bGo\b/i, label: "Mentions infrastructure tooling that may need explicit evidence support." },
    { pattern: /\bclearance\b|\btop secret\b|\bTS\/SCI\b/i, label: "Mentions security clearance. Do not include without explicit verified evidence." },
  ];
  for (const item of patterns) {
    if (item.pattern.test(text)) claims.push(item.label);
  }
  return Array.from(new Set(claims));
}

function inferredVersionLanguage(text: string) {
  const lines = text.split("\n").filter((line) => /\b(tech used|react|typescript|node\.?js|next\.?js|angular|vue|\.net|java|python)\b/i.test(line));
  const risky = lines.find((line) => /\b(likely|estimated|inferred|available at the time|best guess|probably)\b/i.test(line));
  return risky ? `Contains unapproved inferred technology/version language: "${risky.slice(0, 140)}"` : null;
}
