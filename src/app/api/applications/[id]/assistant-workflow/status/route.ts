import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getApplicationAssistantWorkflowStatus } from "@/lib/applications/assistant-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const workflow = await getApplicationAssistantWorkflowStatus(params.id);
    return NextResponse.json({ workflow });
  } catch (error) {
    return apiError(error, 400);
  }
}
