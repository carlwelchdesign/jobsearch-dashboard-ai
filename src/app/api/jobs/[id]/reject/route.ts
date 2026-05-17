import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { captureJobRejectionLearning, rejectionReasonCodes } from "@/lib/jobs/rejection-learning";
import { recordRejectedJobSuppression, suppressionReason } from "@/lib/jobs/suppression";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  matchId: z.string(),
  reasons: z.array(z.enum(rejectionReasonCodes)).optional(),
  note: z.string().max(1000).optional(),
  source: z.string().max(80).optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const input = requestSchema.parse(await request.json());
    const existing = await prisma.jobProfileMatch.findUnique({
      where: { id: input.matchId },
      select: {
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
    });
    if (!existing) return NextResponse.json({ error: "Job match not found." }, { status: 404 });
    const match = await prisma.jobProfileMatch.update({
      where: { id: input.matchId },
      data: { status: "rejected", reviewedAt: new Date() },
    });
    await captureJobRejectionLearning({
      userId: existing.jobSearchProfile.userId,
      matchId: input.matchId,
      jobPostingId: params.id,
      source: input.source ?? "job_reject",
      reasons: input.reasons,
      note: input.note,
      previousStatus: existing?.status ?? null,
    });
    await recordRejectedJobSuppression({
      userId: existing.jobSearchProfile.userId,
      job: existing.jobPosting,
      jobProfileMatchId: input.matchId,
      source: input.source ?? "job_reject",
      reason: suppressionReason({ reasons: input.reasons, note: input.note }),
    });

    return NextResponse.json({ jobId: params.id, match });
  } catch (error) {
    return apiError(error, 400);
  }
}
