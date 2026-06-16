import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireSingleUser } from "@/lib/auth/single-user";
import { syncLinkedInPostAnalytics } from "@/lib/linkedin/analytics";
import { requireBearerSecret } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const authFailure = requireBearerSecret(request, { envNames: ["LINKEDIN_ANALYTICS_SYNC_SECRET", "CRON_SECRET"], label: "LinkedIn analytics sync" });
    if (authFailure) return authFailure;
    const user = await requireSingleUser(request);

    const result = await syncLinkedInPostAnalytics(user.id);
    return NextResponse.json({ message: "LinkedIn analytics synced.", ...result });
  } catch (error) {
    return apiError(error, 400);
  }
}
