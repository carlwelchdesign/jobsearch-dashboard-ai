import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { runJoleneEmailOperationsAgent } from "@/lib/jolene/email-ops";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const runSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  sinceDays: z.number().int().min(1).max(120).optional(),
  lookbackDays: z.number().int().min(1).max(365).optional(),
  includeBackfill: z.boolean().optional(),
  providerMode: z.enum(["all", "connected_only", "backfill_only"]).optional(),
  parentRunId: z.string().min(1).nullable().optional(),
}).default({});

export async function POST(request: Request) {
  try {
    const body = runSchema.parse(await request.json().catch(() => ({})));
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });

    const result = await runJoleneEmailOperationsAgent({
      userId: user.id,
      source: "dashboard",
      limit: body.limit,
      sinceDays: body.sinceDays,
      lookbackDays: body.lookbackDays,
      includeBackfill: body.includeBackfill,
      providerMode: body.providerMode,
      parentRunId: body.parentRunId,
    });

    return NextResponse.json({
      run: {
        id: result.run.id,
        agentType: result.run.agentType,
        status: result.run.status,
        createdAt: result.run.createdAt.toISOString(),
        updatedAt: result.run.updatedAt.toISOString(),
      },
      summary: result.output,
      message: "Jolene Email Operations run completed.",
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
