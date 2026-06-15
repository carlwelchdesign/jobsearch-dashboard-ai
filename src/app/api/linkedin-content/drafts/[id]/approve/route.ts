import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { assertLinkedInDraftReviewPassed, publishLinkedInDraft } from "@/lib/linkedin/share";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const reviewDraft = await prisma.linkedInPostDraft.findUnique({
      where: { id: params.id },
      select: { privacyReview: true, claims: true },
    });
    if (!reviewDraft) throw new Error("LinkedIn draft not found.");
    assertLinkedInDraftReviewPassed(reviewDraft);
    await prisma.linkedInPostDraft.update({
      where: { id: params.id },
      data: { status: "APPROVED", approvedAt: new Date(), publishError: null },
    });
    const draft = await publishLinkedInDraft(params.id);
    return NextResponse.json({ draft, message: "LinkedIn draft approved and published." });
  } catch (error) {
    return apiError(error, 400);
  }
}
