import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { imapConfigFromEnv, syncImapEmail } from "@/lib/email/imap-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const configuredSecret = process.env.EMAIL_SYNC_SECRET?.trim();
    if (configuredSecret) {
      const authorization = request.headers.get("authorization");
      if (authorization !== `Bearer ${configuredSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json().catch(() => ({}));
    const config = {
      ...imapConfigFromEnv(),
      limit: clampInteger(Number(body.limit ?? process.env.JOB_EMAIL_IMAP_LIMIT ?? 25), 1, 100),
      sinceDays: clampInteger(Number(body.sinceDays ?? process.env.JOB_EMAIL_IMAP_SINCE_DAYS ?? 14), 1, 120),
      unseenOnly: typeof body.unseenOnly === "boolean" ? body.unseenOnly : process.env.JOB_EMAIL_IMAP_UNSEEN_ONLY === "true",
    };
    const result = await syncImapEmail(config);

    return NextResponse.json({
      ...result,
      message: `Synced ${result.ingested} email message(s).`,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
