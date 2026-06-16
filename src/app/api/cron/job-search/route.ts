import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { startJobSearchRun } from "@/lib/job-search/start-run";
import { requireBearerSecret } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authFailure = requireBearerSecret(request, { envNames: ["CRON_SECRET"], label: "Job search cron" });
    if (authFailure) return authFailure;

    const result = await startJobSearchRun("cron", { scheduleEnabledOnly: true });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return apiError(error, 400);
  }
}

export const POST = GET;
