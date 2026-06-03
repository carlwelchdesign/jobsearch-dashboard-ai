import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { captureJobRejectionLearning, rejectionReasonCodes } from "@/lib/jobs/rejection-learning";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = parseRequest(await request.json().catch(() => ({})));
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

function parseRequest(payload: unknown) {
  const body = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const matchId = typeof body.matchId === "string" ? body.matchId.trim() : "";
  if (!matchId) throw new Error("matchId is required.");
  const allowedReasons = new Set<string>(rejectionReasonCodes);
  const rawReasons = Array.isArray(body.reasons) ? body.reasons : [];
  const reasons = Array.from(new Set(rawReasons.filter((reason): reason is typeof rejectionReasonCodes[number] => (
    typeof reason === "string" && allowedReasons.has(reason)
  ))));
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : undefined;
  const source = typeof body.source === "string" && body.source.trim()
    ? body.source.trim().slice(0, 80)
    : "rejection_reason_prompt";
  const jobPostingId = typeof body.jobPostingId === "string" && body.jobPostingId.trim()
    ? body.jobPostingId.trim()
    : undefined;

  return { matchId, jobPostingId, reasons, note, source };
}
