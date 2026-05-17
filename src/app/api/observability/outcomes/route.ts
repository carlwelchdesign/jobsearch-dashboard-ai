import { apiError } from "@/lib/api";
import { getOutcomeCalibration } from "@/lib/observability/outcome-calibration";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    const report = await getOutcomeCalibration(user?.id);
    return Response.json({ ok: true, ...report });
  } catch (error) {
    return apiError(error, 400);
  }
}
