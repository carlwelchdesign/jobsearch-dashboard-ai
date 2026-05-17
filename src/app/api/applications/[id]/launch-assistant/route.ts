import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { startApplicationAssistantWorkflow } from "@/lib/applications/assistant-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const url = new URL(request.url);
    if (!LOCAL_HOSTS.has(url.hostname) && process.env.ENABLE_LOCAL_ASSISTANT !== "true") {
      return NextResponse.json(
        {
          error:
            "The Playwright assistant can only be launched from a local app URL. Set ENABLE_LOCAL_ASSISTANT=true only for a trusted local deployment.",
        },
        { status: 400 },
      );
    }

    const result = await startApplicationAssistantWorkflow(params.id, url.origin);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, 400);
  }
}
