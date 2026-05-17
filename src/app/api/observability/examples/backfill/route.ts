import { apiError } from "@/lib/api";
import { backfillAgentQualityExamples } from "@/lib/observability/quality";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  target: z.enum(["APPLICATION_ASSISTANT", "RECRUITING_AGENCY", "JOB_SEARCH", "JOB_MATCHING"]).optional(),
});

export async function POST(request: Request) {
  try {
    const body = request.headers.get("content-type")?.includes("application/json") ? await request.json() : {};
    const input = requestSchema.parse(body);
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    const result = await backfillAgentQualityExamples({ userId: user?.id, target: input.target });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return apiError(error, 400);
  }
}
