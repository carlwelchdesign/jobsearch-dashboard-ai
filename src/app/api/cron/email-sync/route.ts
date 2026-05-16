import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { syncJobResponseEmail } from "@/lib/email/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const configuredSecret = process.env.EMAIL_SYNC_SECRET?.trim() || process.env.CRON_SECRET?.trim();
    if (configuredSecret) {
      const authorization = request.headers.get("authorization");
      if (authorization !== `Bearer ${configuredSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const url = new URL(request.url);
    const result = await syncJobResponseEmail({
      limit: numberParam(url.searchParams.get("limit")),
      sinceDays: numberParam(url.searchParams.get("sinceDays")),
    });

    return NextResponse.json({
      ...result,
      message: `Email sync checked ${result.scanned} message(s) and ingested ${result.ingested}.`,
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
