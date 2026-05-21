import { apiError } from "@/lib/api";
import { recordApplicationOutcome } from "@/lib/applications/outcomes";
import { reconcileApplicationCanonicalState } from "@/lib/applications/reconciliation";
import { createQualityExampleFromAutomationRun } from "@/lib/observability/quality";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.applicationOutcome.findFirst({
      where: {
        applicationId: params.id,
        outcome: "APPLIED",
      },
    });
    if (existing) {
      await prisma.application.update({
        where: { id: params.id },
        data: {
          status: "applied",
          appliedAt: existing.occurredAt,
        },
      });
      await reconcileApplicationCanonicalState({ applicationId: params.id, source: "mark_applied_existing" }).catch(() => null);
      return Response.json({
        outcome: existing,
        message: "Application was already marked applied.",
      });
    }

    const result = await recordApplicationOutcome({
      applicationId: params.id,
      outcome: "APPLIED",
    });
    const latestRun = await prisma.applicationAutomationRun.findFirst({
      where: { applicationId: params.id },
      orderBy: { startedAt: "desc" },
    });
    if (latestRun && ["FAILED", "NEEDS_USER", "RUNNING"].includes(latestRun.status)) {
      await createQualityExampleFromAutomationRun(latestRun.id, "MANUAL_REPAIR").catch(() => null);
    }
    await reconcileApplicationCanonicalState({ applicationId: params.id, source: "mark_applied" }).catch(() => null);

    return Response.json({ outcome: result.outcome, message: result.message });
  } catch (error) {
    return apiError(error, 400);
  }
}
