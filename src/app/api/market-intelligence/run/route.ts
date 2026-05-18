import { NextResponse } from "next/server";
import { z } from "zod";
import { runMarketIntelligenceAgent } from "@/lib/agents/market-intelligence";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  lookbackDays: z.number().int().min(7).max(180).optional(),
  researchDepth: z.enum(["standard", "deep"]).optional(),
}).optional();

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => undefined));
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    const result = await runMarketIntelligenceAgent({
      userId: user?.id,
      lookbackDays: body?.lookbackDays,
      researchDepth: body?.researchDepth,
    });
    return NextResponse.json({ ...result.output, message: "Market intelligence brief generated." });
  } catch (error) {
    return apiError(error, 400);
  }
}
