import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { assertLinkedInDraftReviewPassed, publishLinkedInDraft } from "@/lib/linkedin/share";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const approveSchema = z.object({
  overrideReview: z.boolean().optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = approveSchema.parse(await request.json().catch(() => ({})));
    const reviewDraft = await prisma.linkedInPostDraft.findUnique({
      where: { id: params.id },
      select: { privacyReview: true, claims: true },
    });
    if (!reviewDraft) throw new Error("LinkedIn draft not found.");
    if (!body.overrideReview) assertLinkedInDraftReviewPassed(reviewDraft);
    await prisma.linkedInPostDraft.update({
      where: { id: params.id },
      data: { status: "APPROVED", approvedAt: new Date(), publishError: null },
    });
    const draft = await publishLinkedInDraft(params.id, { overrideReview: body.overrideReview });
    return NextResponse.json({ draft, message: "LinkedIn draft approved and published." });
  } catch (error) {
    return apiError(error, 400);
  }
}
