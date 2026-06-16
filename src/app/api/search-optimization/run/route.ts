import { NextResponse } from "next/server";
import { z } from "zod";
import { runRecruitingSearchOptimization } from "@/lib/agents/recruiting-search-optimization";
import { apiError } from "@/lib/api";
import { requireSingleUser } from "@/lib/auth/single-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  mode: z.enum(["diagnose_only", "active"]).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireSingleUser(request);
    const body = request.headers.get("content-type")?.includes("application/json") ? await request.json() : {};
    const input = requestSchema.parse(body);
    const result = await runRecruitingSearchOptimization({ userId: user.id, mode: input.mode ?? "active" });
    return NextResponse.json(result.output, { status: 202 });
  } catch (error) {
    return apiError(error, 400);
  }
}
