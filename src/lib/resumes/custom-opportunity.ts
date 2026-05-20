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

const sourceName = "Recruiter Opportunity";

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
  const uploadBullets = latestUploadId
    ? user.profile.experienceBullets.filter((bullet) => bullet.sourceResumeUploadId === latestUploadId)
    : [];
  const parsedUpload = user.profile.resumeUploads[0]?.parsedJson as { education?: string[]; certifications?: string[] } | undefined;
  const bullets = uploadBullets.length >= 8 ? uploadBullets : user.profile.experienceBullets;
  const tailored = await tailorResumeForJob({
    userProfile: user.profile,
    job,
    bullets,
    projects: user.profile.projects,
    workExperiences: user.profile.workExperiences.filter((work) => !latestUploadId || work.sourceResumeUploadId === latestUploadId),
    githubRepositories: user.profile.githubRepositories,
    education: Array.isArray(parsedUpload?.education) ? parsedUpload.education : [],
    certifications: Array.isArray(parsedUpload?.certifications) ? parsedUpload.certifications : [],
  });
  const atsChecks = checkAtsReadability(tailored.plainTextResume);
  const resume = await prisma.generatedResume.create({
    data: {
      userId: user.id,
      jobPostingId: job.id,
      jobProfileMatchId,
      resumeUploadId: latestUploadId ?? null,
      markdown: tailored.markdownResume,
      plainText: tailored.plainTextResume,
      html: `<pre>${escapeHtml(tailored.plainTextResume)}</pre>`,
      selectedBulletIds: tailored.selectedExperienceBullets.map((selection) => selection.bulletId) as Prisma.InputJsonValue,
      keywordAlignment: tailored.keywordAlignment as Prisma.InputJsonValue,
      generationNotes: {
        generatedBy: tailored.generatedBy,
        warnings: tailored.warnings,
        unsupportedClaimsDetected: tailored.unsupportedClaimsDetected,
        validation: tailored.validation,
        selectedExperienceBullets: tailored.selectedExperienceBullets,
        projectSelections: tailored.projectSelections,
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
    firstLine.match(/\b((?:Senior|Staff|Principal|Lead)?\s*(?:Frontend|Front End|Full Stack|Software|Product|AI|Platform|UI|Web)[^\n,.;]{0,80}(?:Engineer|Developer|Architect|Lead))\b/i);
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
