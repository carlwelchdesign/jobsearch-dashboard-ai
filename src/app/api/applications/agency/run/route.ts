import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  minimumScore: z.number().int().min(0).max(100).default(90),
  limit: z.number().int().min(1).max(25).default(10),
  triggeredBy: z.enum(["manual", "cron", "search_auto"]).default("manual"),
});

export async function POST(request: Request) {
  try {
    const body = request.headers.get("content-type")?.includes("application/json") ? await request.json() : {};
    const input = requestSchema.parse(body);
    const { runRecruitingAgency } = await import("@/lib/applications/recruiting-agency");
    const result = await runRecruitingAgency(input);

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, 400);
  }
}
