import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { publishLinkedInDraft } from "@/lib/linkedin/share";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const draft = await publishLinkedInDraft(params.id);
    return NextResponse.json({ draft, message: "LinkedIn draft published." });
  } catch (error) {
    return apiError(error, 400);
  }
}
