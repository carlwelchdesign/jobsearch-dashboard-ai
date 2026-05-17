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
        { error: "The Playwright assistant can only be launched from a local app URL." },
        { status: 400 },
      );
    }
    return NextResponse.json(await startApplicationAssistantWorkflow(params.id, url.origin));
  } catch (error) {
    return apiError(error, 400);
  }
}
