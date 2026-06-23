import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api";
import { prepareApplicationPackage } from "@/lib/applications/prepare-package";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const application = await prisma.application.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        jobPostingId: true,
        resumeId: true,
        coverLetterId: true,
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    const result = await prepareApplicationPackage(application.jobPostingId, {
      regenerateResume: true,
      regenerateCoverLetter: true,
    });

    await prisma.applicationEvent.create({
      data: {
        applicationId: application.id,
        type: "note_added",
        payload: {
          source: "application_detail_regenerate_materials",
          previousResumeId: application.resumeId,
          previousCoverLetterId: application.coverLetterId,
          resumeId: result.resume.id,
          coverLetterId: result.coverLetter.id,
          materialQuality: result.materialQuality,
          manualSubmissionRequired: true,
          note: "Regenerated tailored resume and cover letter for review.",
        } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      applicationId: application.id,
      resumeId: result.resume.id,
      coverLetterId: result.coverLetter.id,
      readyToApply: result.readyToApply,
      materialQuality: result.materialQuality,
      message: "Regenerated resume and cover letter. Review the refreshed materials before using them.",
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
