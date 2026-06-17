import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { generateReviewedCoverLetterForJob } from "@/lib/applications/cover-letter-materials";
import { attachCoverLetterQa, createResumeStrategy } from "@/lib/applications/material-agents";
import { activeApplicationMaterialGuidance } from "@/lib/applications/material-guidance";
import { buildApplicationMaterialQuality, materialQualityJson } from "@/lib/applications/material-quality";
import { prisma } from "@/lib/prisma";
import { selectResumeSourceBullets, selectResumeSourceWorkExperiences, summarizeResumeSourceBullets } from "@/lib/resumes/source-materials";
import { syncMaterialClaimsForCoverLetter } from "@/lib/trust/material-claims";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const job = await prisma.jobPosting.findUnique({
      where: { id: params.id },
      include: {
        matches: { orderBy: { overallScore: "desc" } },
        resumes: { orderBy: { createdAt: "desc" }, take: 1 },
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
      return NextResponse.json({ error: "Job, match, and approved candidate profile are required." }, { status: 400 });
    }

    const match = job.matches[0];
    const strategy = await createResumeStrategy({
      jobPostingId: job.id,
      jobSearchProfileId: match.jobSearchProfileId,
      userId: user.id,
    });
    const latestUploadId = user.profile.resumeUploads[0]?.id;
    const sourceBullets = selectResumeSourceBullets(user.profile.experienceBullets, latestUploadId);
    const sourceWorkExperiences = selectResumeSourceWorkExperiences(user.profile.workExperiences, latestUploadId);
    const sourceMaterialSummary = summarizeResumeSourceBullets(sourceBullets, latestUploadId);
    const writingGuidance = await activeApplicationMaterialGuidance(user.id);
    const generated = await generateReviewedCoverLetterForJob({
      userId: user.id,
      userProfile: user.profile,
      job,
      jobSearchProfileId: match.jobSearchProfileId,
      bullets: sourceBullets,
      projects: user.profile.projects,
      workExperiences: sourceWorkExperiences,
      githubRepositories: user.profile.githubRepositories,
      tailoredResumeMarkdown: job.resumes[0]?.markdown,
      writingGuidance,
      strategy,
    });

    const coverLetter = await prisma.generatedCoverLetter.create({
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
          resumeId: job.resumes[0]?.id ?? null,
          resumeStrategy: strategy,
          applicationEvidencePlan: generated.evidencePlan,
          hiringManagerReview: generated.hiringManagerReview,
          materialQuality: materialQualityJson(generated.materialQuality),
          rewriteAttempted: generated.rewriteAttempted,
          writingGuidance,
          sourceMaterialSummary,
        } as Prisma.InputJsonValue,
      },
    });
    const coverLetterQa = await attachCoverLetterQa({
      coverLetter,
      resumeMarkdown: job.resumes[0]?.markdown,
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
    const reviewedCoverLetter = await prisma.generatedCoverLetter.update({
      where: { id: coverLetter.id },
      data: {
        generationNotes: {
          ...jsonObject(coverLetterQa.notes),
          materialQuality: finalMaterialQuality,
        } as Prisma.InputJsonValue,
      },
    });
    await syncMaterialClaimsForCoverLetter(reviewedCoverLetter.id);
    await prisma.jobProfileMatch.update({
      where: { id: match.id },
      data: { status: "cover_letter_generated" },
    });

    return NextResponse.json({ coverLetter: reviewedCoverLetter });
  } catch (error) {
    return apiError(error, 400);
  }
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
