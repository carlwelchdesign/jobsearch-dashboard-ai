import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { captureJobRejectionLearning, rejectionReasonCodes } from "@/lib/jobs/rejection-learning";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  matchId: z.string(),
  jobPostingId: z.string().optional(),
  reasons: z.array(z.enum(rejectionReasonCodes)).default([]),
  note: z.string().max(1000).optional(),
  source: z.string().max(80).default("rejection_reason_prompt"),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const match = await prisma.jobProfileMatch?.findUnique({
      where: { id: input.matchId },
      select: { jobSearchProfile: { select: { userId: true } } },
    });
    const fallbackUser = match ? null : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    const userId = match?.jobSearchProfile.userId ?? fallbackUser?.id;
    if (!userId) return NextResponse.json({ error: "Job match not found." }, { status: 404 });
    const result = await captureJobRejectionLearning({
      userId,
      matchId: input.matchId,
      jobPostingId: input.jobPostingId,
      source: input.source,
      reasons: input.reasons,
      note: input.note,
      previousStatus: "rejected",
    });

    return NextResponse.json({
      ok: true,
      created: result.created,
      message: result.created ? "Rejection feedback saved for agent learning." : "No matching job was found for feedback.",
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
