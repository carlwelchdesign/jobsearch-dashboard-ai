import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { publishLinkedInDraft } from "@/lib/linkedin/share";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
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
