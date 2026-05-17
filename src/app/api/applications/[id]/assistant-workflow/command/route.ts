import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getApplicationAssistantWorkflowCommand } from "@/lib/applications/assistant-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getApplicationAssistantWorkflowCommand(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, 400);
  }
}
