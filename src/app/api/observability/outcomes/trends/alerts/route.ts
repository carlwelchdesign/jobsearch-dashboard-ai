import { apiError } from "@/lib/api";
import { proposeOutcomeTrendRegressionReviews } from "@/lib/observability/outcome-calibration";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    const result = await proposeOutcomeTrendRegressionReviews(user?.id);
    return Response.json({
      ok: true,
      message: result.created
        ? `Created ${result.created} outcome regression review${result.created === 1 ? "" : "s"}.`
        : result.existing
          ? "Outcome regression reviews already exist."
          : "No outcome regressions need review right now.",
      ...result,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
