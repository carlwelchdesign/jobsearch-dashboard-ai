import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const { getRecruitingAgencyRunStatus } = await import("@/lib/applications/recruiting-agency");
    const status = await getRecruitingAgencyRunStatus({ runId: url.searchParams.get("runId") });
    return NextResponse.json({ run: status });
  } catch (error) {
    return apiError(error, 400);
  }
}
