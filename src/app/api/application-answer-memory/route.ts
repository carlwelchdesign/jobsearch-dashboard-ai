import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { findReusableAnswerMemories, upsertApplicationAnswerMemory } from "@/lib/application-answer-memory";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const memorySchema = z.object({
  questionText: z.string().trim().min(5).max(1200),
  answer: z.string().trim().min(1).max(4000),
  sensitivity: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  reusePolicy: z.enum(["AUTO_USE", "ASK_FIRST", "NEVER_REUSE"]).default("ASK_FIRST"),
  sourceApplicationId: z.string().optional(),
  sourceRequestId: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const question = new URL(request.url).searchParams.get("question") ?? "";
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });

    const matches = question ? await findReusableAnswerMemories(user.id, question) : [];
    return NextResponse.json({ matches });
  } catch (error) {
    return apiError(error, 400);
  }
}

export async function POST(request: Request) {
  try {
    const body = memorySchema.parse(await request.json());
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });

    const memory = await upsertApplicationAnswerMemory({
      userId: user.id,
      ...body,
    });

    return NextResponse.json({
      memory,
      message: "Application answer memory saved.",
    }, { status: 201 });
  } catch (error) {
    return apiError(error, 400);
  }
}
