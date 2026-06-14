import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { runJoleneOperatingLoopAgent } from "@/lib/jolene/operating-loop";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const configuredSecret = process.env.CRON_SECRET?.trim();
    if (configuredSecret) {
      const authorization = request.headers.get("authorization");
      if (authorization !== `Bearer ${configuredSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await runJoleneOperatingLoopAgent({ source: "scheduled" });
    return NextResponse.json({
      run: {
        id: result.run.id,
        agentType: result.run.agentType,
        status: result.run.status,
      },
      loop: result.output,
      message: `Jolene Operating Loop planned ${result.output.recommendedActions.length} action(s).`,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

export const POST = GET;
