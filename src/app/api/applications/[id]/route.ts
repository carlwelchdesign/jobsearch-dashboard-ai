import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { recordRejectedJobSuppression } from "@/lib/jobs/suppression";

export const dynamic = "force-dynamic";

const deletableStatuses = new Set(["approved", "ready_to_apply"]);

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const application = await prisma.application.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        userId: true,
        jobPostingId: true,
        status: true,
        jobProfileMatchId: true,
        jobPosting: {
          select: {
            company: true,
            title: true,
            location: true,
            id: true,
            duplicateGroupId: true,
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    if (!deletableStatuses.has(application.status)) {
      return NextResponse.json(
        { error: "Only approved and ready to apply applications can be deleted from this board." },
        { status: 400 },
      );
    }

    const feedbackMessage = `Deleted from Apply Sprint as not a good fit: ${application.jobPosting.company} - ${application.jobPosting.title}. The recruiting agency should remember this as a rejected agency-approved match.`;
    await prisma.$transaction([
      prisma.skillFeedback.create({
        data: {
          userId: application.userId,
          skillId: "approve_agency_match",
          applicationId: application.id,
          jobPostingId: application.jobPostingId,
          rawMessage: feedbackMessage,
          problemSummary: "Apply Sprint deletion means this agency-approved job was not a good fit.",
          expectedBehavior: "Do not promote this job again; use this rejection as learning signal for future agency approvals.",
          confidence: 0.85,
          contextJson: {
            contextPath: "/applications/assistant",
            deletedApplicationId: application.id,
            jobProfileMatchId: application.jobProfileMatchId,
            job: application.jobPosting,
            source: "apply_sprint_delete",
          } as Prisma.InputJsonValue,
          adjustments: {
            create: {
              userId: application.userId,
              skillId: "approve_agency_match",
              kind: "GUIDANCE",
              riskLevel: "LOW",
              status: "ACTIVE",
              patchJson: {
                guidance: "A user deleted an agency-approved Apply Sprint item because the job was not a good fit. Treat similar approvals more cautiously and preserve the rejected job signal.",
                source: "apply_sprint_delete",
                jobProfileMatchId: application.jobProfileMatchId,
                jobPostingId: application.jobPostingId,
                company: application.jobPosting.company,
                title: application.jobPosting.title,
              } as Prisma.InputJsonValue,
              rationale: "Recorded Apply Sprint deletion as low-risk agency approval guidance and memory.",
              appliedAt: new Date(),
            },
          },
        },
      }),
      prisma.application.delete({ where: { id: application.id } }),
      ...(application.jobProfileMatchId
        ? [
            prisma.jobProfileMatch.update({
              where: { id: application.jobProfileMatchId },
              data: { status: "rejected", reviewedAt: new Date() },
            }),
          ]
        : []),
    ]);
    await recordRejectedJobSuppression({
      userId: application.userId,
      job: application.jobPosting,
      jobProfileMatchId: application.jobProfileMatchId,
      source: "apply_sprint_delete",
      reason: "Deleted from Apply Sprint as not a good fit.",
    });

    return NextResponse.json({ deleted: true, rejected: true, message: "Application removed and job marked rejected for agency learning." });
  } catch (error) {
    return apiError(error, 400);
  }
}
