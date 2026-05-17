import { apiError } from "@/lib/api";
import { getLearningImpact } from "@/lib/observability/learning-impact";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    const impact = await getLearningImpact(user?.id);
    return Response.json({
      ok: true,
      impact,
      summary: {
        total: impact.length,
        helping: impact.filter((item) => item.status === "helping").length,
        neutral: impact.filter((item) => item.status === "neutral").length,
        needsReview: impact.filter((item) => item.status === "needs_review").length,
        insufficientData: impact.filter((item) => item.status === "insufficient_data").length,
      },
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
