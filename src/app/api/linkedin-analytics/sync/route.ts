import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { syncLinkedInPostAnalytics } from "@/lib/linkedin/analytics";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });

    const authHeader = request.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET || process.env.LINKEDIN_ANALYTICS_SYNC_SECRET;
    if (secret && authHeader && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized LinkedIn analytics sync." }, { status: 401 });
    }

    const result = await syncLinkedInPostAnalytics(user.id);
    return NextResponse.json({ message: "LinkedIn analytics synced.", ...result });
  } catch (error) {
    return apiError(error, 400);
  }
}
