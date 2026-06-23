import { Prisma } from "@prisma/client";
import { tailorResumeForJob } from "@/lib/ai/resume";
import { requireLaunchableApplicationUrl } from "@/lib/applications/application-url-quality";
import { syncApplicationPacket } from "@/lib/applications/application-packets";
import { attachCoverLetterQa, attachResumeQa, createResumeStrategy } from "@/lib/applications/material-agents";
import { activeApplicationMaterialGuidance } from "@/lib/applications/material-guidance";
import { generateReviewedCoverLetterForJob } from "@/lib/applications/cover-letter-materials";
import {
  applicationMaterialQualityDetail,
  buildApplicationMaterialQuality,
  materialQualityJson,
  type ApplicationMaterialQuality,
} from "@/lib/applications/material-quality";
import { transitionApplicationState } from "@/lib/applications/state-transitions";
import { prisma } from "@/lib/prisma";
import { checkAtsReadability } from "@/lib/resumes/ats";
import {
  selectResumeSourceBullets,
  selectResumeSourceWorkExperiences,
  summarizeResumeSourceBullets,
} from "@/lib/resumes/source-materials";
import { syncMaterialClaimsForCoverLetter, syncMaterialClaimsForResume } from "@/lib/trust/material-claims";

export async function prepareApplicationPackage(jobId: string, options: { regenerateResume?: boolean; regenerateCoverLetter?: boolean } = {}) {
  const job = await prisma.jobPosting.findUnique({
    where: { id: jobId },
    include: {
      matches: { orderBy: { overallScore: "desc" } },
      resumes: { orderBy: { createdAt: "desc" }, take: 1 },
      coverLetters: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const user = await prisma.user.findFirst({
    include: {
      profile: {
        include: {
          experienceBullets: { where: { truthLevel: "verified" }, orderBy: { createdAt: "desc" }, take: 100 },
          projects: { orderBy: { createdAt: "desc" }, take: 5 },
          githubRepositories: { orderBy: [{ pushedAt: "desc" }, { stars: "desc" }], take: 30 },
          resumeUploads: { where: { parsingStatus: "approved" }, orderBy: { updatedAt: "desc" }, take: 1 },
          workExperiences: { orderBy: { createdAt: "desc" }, take: 50 },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!job || !user?.profile || !job.matches[0]) {
    throw new Error("Job, match, and approved candidate profile are required.");
  }
  requireLaunchableApplicationUrl(job.applicationUrl);

  const match = job.matches[0];
  let resume = options.regenerateResume ? null : job.resumes[0] ?? null;
  let coverLetter = options.regenerateResume || options.regenerateCoverLetter ? null : job.coverLetters[0] ?? null;
  const latestUploadId = user.profile.resumeUploads[0]?.id;
  const sourceBullets = selectResumeSourceBullets(user.profile.experienceBullets, latestUploadId);
  const sourceWorkExperiences = selectResumeSourceWorkExperiences(user.profile.workExperiences, latestUploadId);
  const sourceMaterialSummary = summarizeResumeSourceBullets(sourceBullets, latestUploadId);
  const parsedUpload = user.profile.resumeUploads[0]?.parsedJson as { education?: string[]; certifications?: string[] } | undefined;
  const strategy = await createResumeStrategy({
    jobPostingId: job.id,
    jobSearchProfileId: match.jobSearchProfileId,
    userId: user.id,
  });
  const writingGuidance = await activeApplicationMaterialGuidance(user.id);

  if (!resume) {
    const tailored = await tailorResumeForJob({
      userProfile: user.profile,
      job,
      bullets: sourceBullets,
      projects: user.profile.projects,
      workExperiences: sourceWorkExperiences,
      githubRepositories: user.profile.githubRepositories,
      education: Array.isArray(parsedUpload?.education) ? parsedUpload.education : [],
      certifications: Array.isArray(parsedUpload?.certifications) ? parsedUpload.certifications : [],
    });
    const atsChecks = checkAtsReadability(tailored.plainTextResume);
    resume = await prisma.generatedResume.create({
      data: {
        userId: user.id,
        jobPostingId: job.id,
        jobProfileMatchId: match.id,
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
          sourceMaterialSummary,
          preparedApplicationPackage: true,
          regeneratedMaterial: Boolean(options.regenerateResume),
        } as Prisma.InputJsonValue,
        atsChecks: atsChecks as Prisma.InputJsonValue,
      },
    });
    const resumeQa = await attachResumeQa({ resume, userId: user.id, strategy });
    resume = await prisma.generatedResume.update({
      where: { id: resume.id },
      data: { generationNotes: resumeQa.notes },
    });
  }
  await syncMaterialClaimsForResume(resume.id);

  if (!coverLetter) {
    const generated = await generateReviewedCoverLetterForJob({
      userId: user.id,
      userProfile: user.profile,
      job,
      jobSearchProfileId: match.jobSearchProfileId,
      bullets: sourceBullets,
      projects: user.profile.projects,
      workExperiences: sourceWorkExperiences,
      githubRepositories: user.profile.githubRepositories,
      tailoredResumeMarkdown: resume.markdown,
      writingGuidance,
      strategy,
    });
    coverLetter = await prisma.generatedCoverLetter.create({
      data: {
        userId: user.id,
        jobPostingId: job.id,
        jobProfileMatchId: match.id,
        body: generated.body,
        generationNotes: {
          generatedBy: generated.generatedBy,
          toneNotes: generated.toneNotes,
          warnings: generated.warnings,
          unsupportedClaimsDetected: generated.unsupportedClaimsDetected,
          generationFailure: generated.generationFailure,
          resumeId: resume.id,
          resumeStrategy: strategy,
          applicationEvidencePlan: generated.evidencePlan,
          hiringManagerReview: generated.hiringManagerReview,
          materialQuality: materialQualityJson(generated.materialQuality),
          rewriteAttempted: generated.rewriteAttempted,
          writingGuidance,
          preparedApplicationPackage: true,
          regeneratedMaterial: Boolean(options.regenerateResume || options.regenerateCoverLetter),
        } as Prisma.InputJsonValue,
      },
    });
    const coverLetterQa = await attachCoverLetterQa({
      coverLetter,
      resumeMarkdown: resume.markdown,
      userId: user.id,
      strategy,
    });
    const finalMaterialQuality = buildApplicationMaterialQuality({
      body: coverLetter.body,
      generatedBy: generated.generatedBy,
      evidencePlan: generated.evidencePlan,
      hiringManagerReview: generated.hiringManagerReview,
      applicationQa: coverLetterQa.qa,
      rewriteAttempted: generated.rewriteAttempted,
      generationFailure: generated.generationFailure,
    });
    coverLetter = await prisma.generatedCoverLetter.update({
      where: { id: coverLetter.id },
      data: {
        generationNotes: {
          ...jsonObject(coverLetterQa.notes),
          materialQuality: finalMaterialQuality,
        } as Prisma.InputJsonValue,
      },
    });
  }
  await syncMaterialClaimsForCoverLetter(coverLetter.id);
  const materialQuality = applicationMaterialQualityDetail(coverLetter.generationNotes);

  const existingApplication = await prisma.application.findFirst({
    where: { userId: user.id, jobPostingId: job.id },
  });
  const application = existingApplication
    ? await prisma.application.update({
        where: { id: existingApplication.id },
        data: {
          jobProfileMatchId: match.id,
          resumeId: resume.id,
          coverLetterId: coverLetter.id,
        },
      })
    : await prisma.application.create({
        data: {
          userId: user.id,
          jobPostingId: job.id,
          jobProfileMatchId: match.id,
          status: "approved",
          resumeId: resume.id,
          coverLetterId: coverLetter.id,
        },
      });

  let preparedApplication = application;
  if (materialQuality.launchable) {
    const transitioned = await transitionApplicationState({
      applicationId: application.id,
      toStatus: "ready_to_apply",
      source: "prepare_application_package",
      actor: { type: "system" },
      reason: "Application package prepared with generated resume and launchable cover letter.",
      note: mergeNotes(existingApplication?.notes ?? null),
      metadata: {
        jobProfileMatchId: match.id,
        resumeId: resume.id,
        coverLetterId: coverLetter.id,
        applicationUrl: job.applicationUrl,
        materialQuality,
        manualSubmissionRequired: true,
      },
      sideEffects: { syncPacket: false },
    });
    preparedApplication = transitioned.application;
  } else {
    const transitioned = await transitionApplicationState({
      applicationId: application.id,
      toStatus: "approved",
      source: "prepare_application_package_material_quality",
      actor: { type: "system" },
      reason: "Application material quality needs review before Apply Sprint.",
      note: materialReviewNote(existingApplication?.notes ?? null, materialQuality),
      metadata: {
        jobProfileMatchId: match.id,
        resumeId: resume.id,
        coverLetterId: coverLetter.id,
        applicationUrl: job.applicationUrl,
        materialQuality,
        manualSubmissionRequired: true,
      },
      sideEffects: { syncPacket: false },
    });
    preparedApplication = transitioned.application;
  }

  const packet = await syncApplicationPacket(application.id);

  return {
    application: preparedApplication,
    packet,
    resume,
    coverLetter,
    applicationUrl: job.applicationUrl,
    readyToApply: materialQuality.launchable,
    materialQuality,
    manualSubmissionRequired: true,
    message: materialQuality.launchable
      ? "Application package is ready. Open the job URL, review the filled materials, and submit manually."
      : `Application package saved for review, but not moved to Apply Sprint. ${materialQuality.reason}`,
  };
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

function mergeNotes(existing: string | null) {
  const note = "Application package prepared. Review materials and submit manually.";
  if (!existing) return note;
  return existing.includes(note) ? existing : `${existing}\n${note}`;
}

function materialReviewNote(existing: string | null, quality: ApplicationMaterialQuality) {
  const note = `Application package held for material review: ${quality.reason}`;
  if (!existing) return note;
  return existing.includes(note) ? existing : `${existing}\n${note}`;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
