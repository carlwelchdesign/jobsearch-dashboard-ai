import { apiError } from "@/lib/api";
import { recomputeOutcomeCalibration } from "@/lib/observability/outcome-calibration";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    const report = await recomputeOutcomeCalibration(user?.id);
    return Response.json({ ok: true, ...report });
  } catch (error) {
    return apiError(error, 400);
  }
}
