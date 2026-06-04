import { Prisma, RemoteType, type JobPosting, type JobProfileMatch } from "@prisma/client";
import { z } from "zod";
import { runJobFitScoringAgent } from "@/lib/agents/job-fit-scorer";
import { parseStructuredOutput } from "@/lib/ai/openai";
import { tailorResumeForJob } from "@/lib/ai/resume";
import { createResumeStrategy, attachResumeQa } from "@/lib/applications/material-agents";
import { scoreJobForProfile } from "@/lib/job-search/scoring";
import { captureManualJob } from "@/lib/jobs/manual-capture";
import { prisma } from "@/lib/prisma";
import { checkAtsReadability } from "@/lib/resumes/ats";
import { selectResumeSourceBullets, summarizeResumeSourceBullets } from "@/lib/resumes/source-materials";

const sourceName = "Recruiter Opportunity";
const integrationSignalPattern = /\b(mcp|model context protocol|integration|integrate|systems?|api|salesforce|gong|zoominfo|ironclad|clm|legal workflow|harvey|simplelegal|logikcull|airtable|snowflake|data platform|workflow|automation)\b/i;
const supportedIntegrationStack = [
  "Model Context Protocol (MCP)",
  "agentic workflows",
  "RAG",
  "Next.js",
  "React",
  "TypeScript",
  "Prisma",
  "Postgres",
  "pgvector",
  "LangGraph",
  "LangSmith-style observability",
  "browser automation",
  "email outcome tracking",
  "application state reconciliation",
];
const requestedThirdPartySystems = [
  "Salesforce",
  "Gong",
  "ZoomInfo",
  "Ironclad",
  "Harvey AI",
  "SimpleLegal",
  "Logikcull",
  "Airtable",
  "Snowflake",
];

export const customOpportunityInferSchema = z.object({
  description: z.string().trim().min(30, "Paste at least a short recruiter role description.").max(100000),
});

export const customOpportunityGenerateSchema = customOpportunityInferSchema.extend({
  company: z.string().trim().max(300).optional(),
  title: z.string().trim().max(300).optional(),
  location: z.string().trim().max(300).optional(),
  remoteType: z.nativeEnum(RemoteType).optional(),
  applicationUrl: z.string().trim().url().optional().or(z.literal("")),
});

const inferredOpportunitySchema = z.object({
  company: z.string().nullable().default(null),
  title: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  remoteType: z.nativeEnum(RemoteType).nullable().default(null),
  applicationUrl: z.string().url().nullable().default(null),
});

export type CustomOpportunityDetails = z.infer<typeof inferredOpportunitySchema>;

export async function inferCustomOpportunityDetails(description: string): Promise<CustomOpportunityDetails> {
  const fallback = inferCustomOpportunityDetailsHeuristically(description);

  try {
    const inferred = await parseStructuredOutput({
      schema: inferredOpportunitySchema,
      schemaName: "infer_custom_opportunity",
      system:
        "Extract job opportunity fields from a pasted recruiter message or brief role description. " +
        "Return null for fields that are not present. Do not invent company names, job titles, URLs, or locations.",
      input: { description: description.slice(0, 12000) },
    });

    return normalizeInferredDetails({
      company: inferred?.company ?? fallback.company,
      title: inferred?.title ?? fallback.title,
      location: inferred?.location ?? fallback.location,
      remoteType: inferred?.remoteType ?? fallback.remoteType,
      applicationUrl: inferred?.applicationUrl ?? fallback.applicationUrl,
    });
  } catch (error) {
    console.warn("Custom opportunity inference failed; using heuristic fallback.", error);
    return fallback;
  }
}

export async function generateCustomOpportunityResume(input: z.infer<typeof customOpportunityGenerateSchema>) {
  const provided = normalizeInferredDetails({
    company: input.company || null,
    title: input.title || null,
    location: input.location || null,
    remoteType: input.remoteType || null,
    applicationUrl: input.applicationUrl || null,
  });
  const inferred = provided.company && provided.title ? provided : await inferCustomOpportunityDetails(input.description);
  const details = normalizeInferredDetails({
    company: provided.company ?? inferred.company ?? "Unknown company",
    title: provided.title ?? inferred.title ?? "Untitled role",
    location: provided.location ?? inferred.location,
    remoteType: provided.remoteType ?? inferred.remoteType ?? "unknown",
    applicationUrl: provided.applicationUrl ?? inferred.applicationUrl,
  });

  const captured = await captureManualJob({
    company: details.company ?? "Unknown company",
    title: details.title ?? "Untitled role",
    location: details.location,
    description: input.description,
    applicationUrl: details.applicationUrl,
    remoteType: details.remoteType ?? "unknown",
    sourceName,
    rawData: {
      captureSource: sourceName,
      originalBrief: input.description,
      inferredDetails: inferred,
    },
  });
  const match = await ensureCustomOpportunityMatch(captured.job);
  const resume = await createGeneratedResumeForMatch(captured.job.id, match.id);

  return {
    job: captured.job,
    match,
    resume,
    inferredDetails: details,
    jobUrl: `/jobs/${captured.job.id}`,
    resumeId: resume.id,
    pdfUrl: `/api/resumes/generated/${resume.id}/pdf`,
    textUrl: `/api/resumes/generated/${resume.id}/plain-text`,
    resumePreview: resume.plainText ?? resume.markdown,
    warnings: warningStrings(resume.generationNotes),
  };
}

async function ensureCustomOpportunityMatch(job: Pick<JobPosting, "id" | "company" | "title" | "description" | "location">): Promise<JobProfileMatch> {
  const existing = await prisma.jobProfileMatch.findFirst({
    where: { jobPostingId: job.id },
    orderBy: { overallScore: "desc" },
  });
  if (existing) return existing;

  const profiles = await prisma.jobSearchProfile.findMany({ where: { enabled: true } });
  if (profiles.length === 0) throw new Error("Create or enable a job search profile before generating a custom opportunity resume.");

  const bestProfile = [...profiles]
    .map((profile) => ({ profile, score: scoreJobForProfile(job, profile).overallScore }))
    .sort((a, b) => b.score - a.score)[0]?.profile;
  if (!bestProfile) throw new Error("No job search profile was available for this opportunity.");

  await runJobFitScoringAgent({
    jobPostingId: job.id,
    jobSearchProfileId: bestProfile.id,
  });

  const created = await prisma.jobProfileMatch.findUnique({
    where: {
      jobPostingId_jobSearchProfileId: {
        jobPostingId: job.id,
        jobSearchProfileId: bestProfile.id,
      },
    },
  });
  if (!created) throw new Error("Unable to score this custom opportunity.");

  return created;
}

async function createGeneratedResumeForMatch(jobPostingId: string, jobProfileMatchId: string) {
  const [job, user] = await Promise.all([
    prisma.jobPosting.findUnique({ where: { id: jobPostingId } }),
    prisma.user.findFirst({
      include: {
        profile: {
          include: {
            experienceBullets: { where: { truthLevel: "verified" }, orderBy: { createdAt: "desc" }, take: 100 },
            projects: { orderBy: { createdAt: "desc" }, take: 6 },
            githubRepositories: { orderBy: [{ pushedAt: "desc" }, { stars: "desc" }], take: 30 },
            resumeUploads: { where: { parsingStatus: "approved" }, orderBy: { updatedAt: "desc" }, take: 1 },
            workExperiences: { orderBy: { createdAt: "desc" }, take: 50 },
          },
        },
      },
    }),
  ]);
  if (!job || !user?.profile) throw new Error("Job and approved candidate profile are required.");

  const strategy = await createResumeStrategy({
    jobPostingId: job.id,
    jobSearchProfileId: jobProfileMatchId,
    userId: user.id,
  });
  const latestUploadId = user.profile.resumeUploads[0]?.id;
  const parsedUpload = user.profile.resumeUploads[0]?.parsedJson as { education?: string[]; certifications?: string[] } | undefined;
  const bullets = selectResumeSourceBullets(user.profile.experienceBullets, latestUploadId);
  const sourceMaterialSummary = summarizeResumeSourceBullets(bullets, latestUploadId);
  const emphasis = buildCustomOpportunityEmphasis({
    description: job.description,
    profileText: [
      user.profile.masterSummary,
      user.profile.professionalSummary,
      user.profile.coreSkills,
      user.profile.technicalSkills,
      user.profile.experienceBullets.map((bullet) => [bullet.text, bullet.keywords, bullet.sourceText].flat().join(" ")),
      user.profile.projects.map((project) => [project.name, project.description, project.technologies, project.highlights].flat().join(" ")),
      user.profile.githubRepositories.map((repo) => [repo.name, repo.fullName, repo.description, repo.language, repo.topics].flat().join(" ")),
      user.profile.workExperiences.map((work) => [work.company, work.title, work.summary, work.skills, work.achievements].flat().join(" ")),
    ].flat().filter(Boolean).join(" "),
  });
  const tailored = await tailorResumeForJob({
    userProfile: user.profile,
    job,
    bullets,
    projects: user.profile.projects,
    workExperiences: user.profile.workExperiences,
    githubRepositories: user.profile.githubRepositories,
    education: Array.isArray(parsedUpload?.education) ? parsedUpload.education : [],
    certifications: Array.isArray(parsedUpload?.certifications) ? parsedUpload.certifications : [],
  });
  const emphasized = applyCustomOpportunityEmphasis(tailored, job, emphasis);
  const atsChecks = checkAtsReadability(emphasized.plainTextResume);
  const resume = await prisma.generatedResume.create({
    data: {
      userId: user.id,
      jobPostingId: job.id,
      jobProfileMatchId,
      resumeUploadId: latestUploadId ?? null,
      markdown: emphasized.markdownResume,
      plainText: emphasized.plainTextResume,
      html: `<pre>${escapeHtml(emphasized.plainTextResume)}</pre>`,
      selectedBulletIds: emphasized.selectedExperienceBullets.map((selection) => selection.bulletId) as Prisma.InputJsonValue,
      keywordAlignment: emphasized.keywordAlignment as Prisma.InputJsonValue,
      generationNotes: {
        generatedBy: emphasized.generatedBy,
        warnings: [...emphasized.warnings, ...emphasis.warnings],
        unsupportedClaimsDetected: emphasized.unsupportedClaimsDetected,
        validation: emphasized.validation,
        selectedExperienceBullets: emphasized.selectedExperienceBullets,
        projectSelections: emphasized.projectSelections,
        sourceMaterialSummary,
        customOpportunityEmphasis: emphasis.enabled ? {
          focus: emphasis.focus,
          supportedStackTerms: emphasis.supportedStackTerms,
          unsupportedRequestedSystems: emphasis.unsupportedRequestedSystems,
        } : null,
        resumeStrategy: strategy,
        customOpportunity: true,
      } as Prisma.InputJsonValue,
      atsChecks: atsChecks as Prisma.InputJsonValue,
    },
  });
  const resumeQa = await attachResumeQa({ resume, userId: user.id, strategy });
  const reviewedResume = await prisma.generatedResume.update({
    where: { id: resume.id },
    data: { generationNotes: resumeQa.notes },
  });
  await prisma.jobProfileMatch.update({
    where: { id: jobProfileMatchId },
    data: { status: "resume_generated" },
  });

  return reviewedResume;
}

function inferCustomOpportunityDetailsHeuristically(description: string): CustomOpportunityDetails {
  const lines = description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const firstLine = lines[0] ?? "";
  const titleMatch =
    description.match(/\b(?:role|position|opening|opportunity|job title)\s*[:\-]\s*([^\n.]+)/i) ??
    firstLine.match(/\b((?:Sr\.?|Senior|Staff|Principal|Lead)?\s*(?:Integration|Systems Integration|MCP|Frontend|Front End|Full Stack|Software|Product|AI|Platform|UI|Web)[^\n,.;]{0,80}(?:Engineer|Developer|Architect|Lead))\b/i) ??
    description.match(/\b((?:Sr\.?|Senior|Staff|Principal|Lead)?\s*(?:Integration|Systems Integration|MCP)\s+Engineer)\b/i);
  const companyMatch =
    description.match(/\b(?:company|client)\s*[:\-]\s*([^\n.]+)/i) ??
    description.match(/\bat\s+([A-Z][A-Za-z0-9&.\- ]{2,80})(?:\s+is|\s+has|\s+for|\s*,|\s*\.)/);
  const locationMatch =
    description.match(/\b(?:location|based in)\s*[:\-]\s*([^\n.]+)/i) ??
    description.match(/\b(Remote(?:\s+\w+)?|Hybrid(?:\s+in\s+[A-Z][A-Za-z, ]+)?|Onsite(?:\s+in\s+[A-Z][A-Za-z, ]+)?)\b/i);
  const applicationUrl = description.match(/https?:\/\/[^\s)]+/i)?.[0] ?? null;
  const remoteType = inferRemoteType(description);

  return normalizeInferredDetails({
    company: cleanInferredValue(companyMatch?.[1]),
    title: cleanInferredValue(titleMatch?.[1]),
    location: cleanInferredValue(locationMatch?.[1]),
    remoteType,
    applicationUrl,
  });
}

function normalizeInferredDetails(details: Partial<CustomOpportunityDetails>): CustomOpportunityDetails {
  return {
    company: cleanInferredValue(details.company),
    title: cleanInferredValue(details.title),
    location: cleanInferredValue(details.location),
    remoteType: details.remoteType ?? null,
    applicationUrl: cleanUrl(details.applicationUrl),
  };
}

function inferRemoteType(description: string): RemoteType | null {
  if (/\bremote\b/i.test(description)) return "remote";
  if (/\bhybrid\b/i.test(description)) return "hybrid";
  if (/\bonsite|on-site|in office|in-office\b/i.test(description)) return "onsite";
  return null;
}

function cleanInferredValue(value: string | null | undefined) {
  const cleaned = value?.replace(/\s+/g, " ").replace(/[.;,]+$/, "").trim();
  return cleaned || null;
}

function cleanUrl(value: string | null | undefined) {
  const cleaned = cleanInferredValue(value);
  if (!cleaned) return null;
  try {
    return new URL(cleaned).toString();
  } catch {
    return null;
  }
}

function warningStrings(notes: Prisma.JsonValue): string[] {
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) return [];
  const values = notes as Record<string, unknown>;
  return [
    ...stringArray(values.warnings),
    ...stringArray(values.unsupportedClaimsDetected).map((item) => `Unsupported claim: ${item}`),
  ];
}

function buildCustomOpportunityEmphasis({ description, profileText }: { description: string; profileText: string }) {
  const enabled = integrationSignalPattern.test(description);
  const supportedStackTerms = enabled ? supportedIntegrationStack.filter((term) => hasSourceSupport(profileText, term)) : [];
  const unsupportedRequestedSystems = requestedThirdPartySystems.filter((system) => {
    if (!description.toLowerCase().includes(system.toLowerCase())) return false;
    return !hasSourceSupport(profileText, system);
  });

  return {
    enabled,
    focus: enabled ? "MCP and integration architecture for AI-enabled business workflows" : null,
    supportedStackTerms,
    unsupportedRequestedSystems,
    warnings: unsupportedRequestedSystems.map((system) => `Requested system not added as a claimed skill because it is not verified in approved evidence: ${system}.`),
  };
}

function applyCustomOpportunityEmphasis<T extends {
  markdownResume: string;
  plainTextResume: string;
  keywordAlignment: unknown;
}>(tailored: T, job: Pick<JobPosting, "title" | "description">, emphasis: ReturnType<typeof buildCustomOpportunityEmphasis>): T {
  if (!emphasis.enabled || emphasis.supportedStackTerms.length === 0) return tailored;

  const topTerms = emphasis.supportedStackTerms.slice(0, 9);
  const summarySentence =
    `Built an Agentic job search assistant using ${topTerms.slice(0, 6).join(", ")} to connect AI-assisted workflows, evidence retrieval, automation, and application-state operations.`;
  const markdownResume = emphasizeResumeText(tailored.markdownResume, summarySentence, topTerms);
  const plainTextResume = emphasizeResumeText(tailored.plainTextResume, summarySentence, topTerms);
  const keywordAlignment = withEmphasisKeywordAlignment(tailored.keywordAlignment, {
    matchedTerms: topTerms,
    missingTerms: emphasis.unsupportedRequestedSystems,
    notes: [
      `Custom opportunity emphasis applied for ${job.title}.`,
      "Unsupported requested systems were not added as claimed skills.",
    ],
  });

  return {
    ...tailored,
    markdownResume,
    plainTextResume,
    keywordAlignment,
  };
}

function emphasizeResumeText(resume: string, summarySentence: string, stackTerms: string[]) {
  const withSummary = replaceSection(resume, "Summary", (content) => {
    if (content.toLowerCase().includes("model context protocol") || content.toLowerCase().includes("mcp")) return content;
    return [summarySentence, content].filter(Boolean).join(" ");
  });
  return replaceSection(withSummary, "Skills", (content) => mergeSkillLine(content, stackTerms));
}

function replaceSection(text: string, sectionName: string, update: (content: string) => string) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => normalizeHeading(line) === sectionName.toLowerCase());
  if (start === -1) return text;
  const end = lines.findIndex((line, index) => index > start && Boolean(normalizeHeading(line)));
  const contentEnd = end === -1 ? lines.length : end;
  return [
    ...lines.slice(0, start + 1),
    update(lines.slice(start + 1, contentEnd).join("\n").trim()),
    "",
    ...lines.slice(contentEnd),
  ].join("\n").replace(/\n{3,}/g, "\n\n");
}

function normalizeHeading(line: string) {
  const trimmed = line.trim().replace(/^#{1,6}\s*/, "");
  if (/^(summary|skills|professional experience|projects|education|certifications)$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return "";
}

function mergeSkillLine(content: string, stackTerms: string[]) {
  const skills = Array.from(new Set([
    ...content.split(/,|\n/).map((item) => item.trim()).filter(Boolean),
    ...stackTerms,
  ]));
  return skills.join(", ");
}

function withEmphasisKeywordAlignment(existing: unknown, updates: { matchedTerms: string[]; missingTerms: string[]; notes: string[] }) {
  const base = existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {};
  return {
    ...base,
    matchedTerms: uniqueStrings([...stringArray(base.matchedTerms), ...updates.matchedTerms]),
    missingTerms: uniqueStrings([...stringArray(base.missingTerms), ...updates.missingTerms]),
    notes: uniqueStrings([...stringArray(base.notes), ...updates.notes]),
  };
}

function hasSourceSupport(sourceText: string, term: string) {
  const normalizedSource = normalizeSupportText(sourceText);
  const normalizedTerm = normalizeSupportText(term);
  if (normalizedSource.includes(normalizedTerm)) return true;
  const aliases: Record<string, string[]> = {
    "model context protocol mcp": ["mcp", "model context protocol"],
    "langsmith style observability": ["langsmith", "observability"],
    "email outcome tracking": ["email", "outcome tracking"],
    "application state reconciliation": ["application state", "reconciliation"],
    "postgres": ["postgresql", "postgres"],
    "pgvector": ["pgvector", "vector"],
  };
  return (aliases[normalizedTerm] ?? []).some((alias) => normalizedSource.includes(normalizeSupportText(alias)));
}

function normalizeSupportText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[char];
  });
}
