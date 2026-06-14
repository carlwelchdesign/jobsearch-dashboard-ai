import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { runLinkedInContentAgent } from "@/lib/agents/linkedin-content";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const draftRequestSchema = z.object({
  contentPillar: z.enum(["app_progress", "search_learning", "architecture", "workflow_design"]).optional(),
  prompt: z.string().trim().max(2000).optional(),
  tone: z.enum(["bold_grounded", "practical", "experimental"]).optional(),
  format: z.enum(["build_log", "lesson", "decision_diary", "teardown", "before_after", "contrarian_take", "field_note", "visual_walkthrough", "product_thesis"]).optional(),
  visualDirection: z.string().trim().max(1000).optional(),
});

export async function GET() {
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });
    const drafts = await prisma.linkedInPostDraft.findMany({
      where: { userId: user.id, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ drafts });
  } catch (error) {
    return apiError(error, 400);
  }
}

export async function POST(request: Request) {
  try {
    const body = draftRequestSchema.parse(await request.json().catch(() => ({})));
    const result = await runLinkedInContentAgent(body);
    return NextResponse.json({
      draftId: result.output.draftId,
      output: result.output,
      agentRunId: result.run.id,
      message: "LinkedIn draft created for manual review.",
    }, { status: 201 });
  } catch (error) {
    return apiError(error, 400);
  }
}
