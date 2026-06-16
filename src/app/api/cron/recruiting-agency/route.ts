import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireBearerSecret } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const authFailure = requireBearerSecret(request, { envNames: ["RECRUITING_AGENCY_SECRET", "CRON_SECRET"], label: "Recruiting agency cron" });
    if (authFailure) return authFailure;

    const url = new URL(request.url);
    const { runRecruitingAgency } = await import("@/lib/applications/recruiting-agency");
    const result = await runRecruitingAgency({
      minimumScore: numberParam(url.searchParams.get("minimumScore")),
      limit: numberParam(url.searchParams.get("limit")),
      triggeredBy: "cron",
    });

    return NextResponse.json({
      ...result,
      message: `Recruiting agency cron prepared ${result.prepared} package(s), approved ${result.approved}, and failed ${result.failed}.`,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

export const POST = GET;

function numberParam(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
