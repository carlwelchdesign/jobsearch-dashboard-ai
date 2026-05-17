import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getRecruitingAgencyRunStatus } from "@/lib/applications/recruiting-agency";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const status = await getRecruitingAgencyRunStatus({ runId: url.searchParams.get("runId") });
    return NextResponse.json({ run: status });
  } catch (error) {
    return apiError(error, 400);
  }
}
