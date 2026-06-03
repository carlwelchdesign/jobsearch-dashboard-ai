import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isLocalAssistantRequest, LOCAL_ASSISTANT_ERROR } from "@/lib/applications/local-assistant-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const url = new URL(request.url);
    if (!isLocalAssistantRequest(url)) {
      return NextResponse.json(
        { error: LOCAL_ASSISTANT_ERROR },
        { status: 400 },
      );
    }

    const { startApplicationAssistantWorkflow } = await import("@/lib/applications/assistant-workflow-graph");
    const result = await startApplicationAssistantWorkflow(params.id, url.origin);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, 400);
  }
}
