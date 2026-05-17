import { apiError } from "@/lib/api";
import { proposeOutcomeReviewActionImprovements } from "@/lib/observability/outcome-calibration";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    const result = await proposeOutcomeReviewActionImprovements(user?.id);
    return Response.json({
      ok: true,
      message: result.created
        ? `Created ${result.created} outcome proposal${result.created === 1 ? "" : "s"}.`
        : result.existing
          ? "Outcome review proposals already exist."
          : "No outcome review actions need proposals right now.",
      ...result,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
