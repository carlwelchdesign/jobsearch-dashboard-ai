import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { runJoleneEmailOperationsAgent } from "@/lib/jolene/email-ops";
import { requireBearerSecret } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const authFailure = requireBearerSecret(request, { envNames: ["EMAIL_SYNC_SECRET", "CRON_SECRET"], label: "Email sync cron" });
    if (authFailure) return authFailure;

    const url = new URL(request.url);
    const result = await runJoleneEmailOperationsAgent({
      source: "scheduled",
      limit: numberParam(url.searchParams.get("limit")),
      sinceDays: numberParam(url.searchParams.get("sinceDays")),
    });

    return NextResponse.json({
      run: {
        id: result.run.id,
        agentType: result.run.agentType,
        status: result.run.status,
      },
      summary: result.output,
      message: `Email Ops checked ${result.output.scanned} message(s), ingested ${result.output.ingested}, and created ${result.output.findingsCreated} finding(s).`,
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
