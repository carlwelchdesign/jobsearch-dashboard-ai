import { Prisma } from "@prisma/client";
import { generateCoverLetterForJob, tailorResumeForJob } from "@/lib/ai/resume";
import { syncApplicationPacket } from "@/lib/applications/application-packets";
import { attachCoverLetterQa, attachResumeQa, createResumeStrategy } from "@/lib/applications/material-agents";
import { prisma } from "@/lib/prisma";
import { checkAtsReadability } from "@/lib/resumes/ats";

export async function prepareApplicationPackage(jobId: string) {
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

  const match = job.matches[0];
  let resume = job.resumes[0] ?? null;
  let coverLetter = job.coverLetters[0] ?? null;
  const latestUploadId = user.profile.resumeUploads[0]?.id;
  const uploadBullets = latestUploadId
    ? user.profile.experienceBullets.filter((bullet) => bullet.sourceResumeUploadId === latestUploadId)
    : [];
  const sourceBullets = uploadBullets.length >= 8 ? uploadBullets : user.profile.experienceBullets;
  const parsedUpload = user.profile.resumeUploads[0]?.parsedJson as { education?: string[]; certifications?: string[] } | undefined;
  const strategy = await createResumeStrategy({
    jobPostingId: job.id,
    jobSearchProfileId: match.jobSearchProfileId,
    userId: user.id,
  });

  if (!resume) {
    const tailored = await tailorResumeForJob({
      userProfile: user.profile,
      job,
      bullets: sourceBullets,
      projects: user.profile.projects,
      workExperiences: user.profile.workExperiences.filter((work) => !latestUploadId || work.sourceResumeUploadId === latestUploadId),
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
          preparedApplicationPackage: true,
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

  if (!coverLetter) {
    const generated = await generateCoverLetterForJob({
      userProfile: user.profile,
      job,
      bullets: sourceBullets,
      projects: user.profile.projects,
      githubRepositories: user.profile.githubRepositories,
      tailoredResumeMarkdown: resume.markdown,
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
          resumeId: resume.id,
          resumeStrategy: strategy,
          preparedApplicationPackage: true,
        } as Prisma.InputJsonValue,
      },
    });
    const coverLetterQa = await attachCoverLetterQa({
      coverLetter,
      resumeMarkdown: resume.markdown,
      userId: user.id,
      strategy,
    });
    coverLetter = await prisma.generatedCoverLetter.update({
      where: { id: coverLetter.id },
      data: { generationNotes: coverLetterQa.notes },
    });
  }

  const existingApplication = await prisma.application.findFirst({
    where: { userId: user.id, jobPostingId: job.id },
  });
  const application = existingApplication
    ? await prisma.application.update({
        where: { id: existingApplication.id },
        data: {
          jobProfileMatchId: match.id,
          status: "ready_to_apply",
          resumeId: resume.id,
          coverLetterId: coverLetter.id,
          approvedAt: existingApplication.approvedAt ?? new Date(),
          notes: mergeNotes(existingApplication.notes),
        },
      })
    : await prisma.application.create({
        data: {
          userId: user.id,
          jobPostingId: job.id,
          jobProfileMatchId: match.id,
          status: "ready_to_apply",
          resumeId: resume.id,
          coverLetterId: coverLetter.id,
          approvedAt: new Date(),
          notes: "Application package prepared. Review materials and submit manually.",
        },
      });

  await prisma.jobProfileMatch.update({
    where: { id: match.id },
    data: { status: "ready_to_apply", reviewedAt: match.reviewedAt ?? new Date() },
  });

  await prisma.applicationEvent.create({
    data: {
      applicationId: application.id,
      type: "status_changed",
      payload: {
        status: "ready_to_apply",
        resumeId: resume.id,
        coverLetterId: coverLetter.id,
        applicationUrl: job.applicationUrl,
        manualSubmissionRequired: true,
      } as Prisma.InputJsonValue,
    },
  });

  const packet = await syncApplicationPacket(application.id);

  return {
    application,
    packet,
    resume,
    coverLetter,
    applicationUrl: job.applicationUrl,
    manualSubmissionRequired: true,
    message: "Application package is ready. Open the job URL, review the filled materials, and submit manually.",
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
