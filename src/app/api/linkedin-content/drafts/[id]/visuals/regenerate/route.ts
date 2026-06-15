import { NextResponse } from "next/server";
import { z } from "zod";
import { regenerateLinkedInDraftVisuals } from "@/lib/agents/linkedin-content";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const regenerateSchema = z.object({
  visualDirection: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = regenerateSchema.parse(await request.json().catch(() => ({})));
    const draft = await regenerateLinkedInDraftVisuals({ draftId: params.id, visualDirection: body.visualDirection });
    return NextResponse.json({ draft, message: "LinkedIn draft visuals regenerated." });
  } catch (error) {
    return apiError(error, 400);
  }
}
