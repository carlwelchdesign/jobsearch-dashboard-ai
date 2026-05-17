import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { captureJobRejectionLearning, rejectionReasonCodes } from "@/lib/jobs/rejection-learning";
import { recordArchivedJobSuppression, recordRejectedJobSuppression, suppressionReason } from "@/lib/jobs/suppression";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  matchIds: z.array(z.string()).min(1).max(100),
  status: z.enum(["needs_review", "approved", "rejected", "saved_for_later", "archived"]),
  reasons: z.array(z.enum(rejectionReasonCodes)).optional(),
  note: z.string().max(1000).optional(),
  source: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const shouldSuppress = input.status === "rejected" || input.status === "archived";
    const existingMatches = shouldSuppress
      ? await prisma.jobProfileMatch.findMany({
        where: { id: { in: input.matchIds } },
        select: {
          id: true,
          jobPostingId: true,
          status: true,
          jobSearchProfile: { select: { userId: true } },
          jobPosting: {
            select: {
              id: true,
              company: true,
              title: true,
              location: true,
              duplicateGroupId: true,
            },
          },
        },
      })
      : [];
    const result = await prisma.jobProfileMatch.updateMany({
      where: {
        id: { in: input.matchIds },
      },
      data: {
        status: input.status,
        reviewedAt: new Date(),
      },
    });
    let feedbackCreated = 0;
    if (shouldSuppress) {
      for (const match of existingMatches) {
        if (input.status === "rejected") {
          const feedback = await captureJobRejectionLearning({
            userId: match.jobSearchProfile.userId,
            matchId: match.id,
            jobPostingId: match.jobPostingId,
            source: input.source ?? "bulk_job_reject",
            reasons: input.reasons,
            note: input.note,
            previousStatus: match.status,
          });
          feedbackCreated += feedback.created;
          await recordRejectedJobSuppression({
            userId: match.jobSearchProfile.userId,
            job: match.jobPosting,
            jobProfileMatchId: match.id,
            source: input.source ?? "bulk_job_reject",
            reason: suppressionReason({ reasons: input.reasons, note: input.note }),
          });
        } else {
          await recordArchivedJobSuppression({
            userId: match.jobSearchProfile.userId,
            job: match.jobPosting,
            jobProfileMatchId: match.id,
            source: input.source ?? "bulk_job_archive",
            reason: input.note ?? "bulk_archive",
          });
        }
      }
    }

    return NextResponse.json({
      updated: result.count,
      status: input.status,
      feedbackCreated,
      message: `${result.count} job match${result.count === 1 ? "" : "es"} updated to ${input.status.replace(/_/g, " ")}.`,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
