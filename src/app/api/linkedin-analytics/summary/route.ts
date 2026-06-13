import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getLinkedInAnalyticsSummary } from "@/lib/linkedin/analytics";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ranges = new Set(["7d", "30d", "90d", "365d"]);

export async function GET(request: Request) {
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });
    const url = new URL(request.url);
    const requestedRange = url.searchParams.get("range") ?? "30d";
    const range = ranges.has(requestedRange) ? requestedRange as "7d" | "30d" | "90d" | "365d" : "30d";
    const summary = await getLinkedInAnalyticsSummary(user.id, range);
    return NextResponse.json(summary);
  } catch (error) {
    return apiError(error, 400);
  }
}
