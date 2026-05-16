import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { startJobSearchRun } from "@/lib/job-search/start-run";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const configuredSecret = process.env.CRON_SECRET;
    if (configuredSecret) {
      const authorization = request.headers.get("authorization");
      if (authorization !== `Bearer ${configuredSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await startJobSearchRun("cron", { scheduleEnabledOnly: true });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return apiError(error, 400);
  }
}

export const POST = GET;
