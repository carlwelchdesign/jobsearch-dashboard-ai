import { apiError } from "@/lib/api";
import { recordApplicationOutcome } from "@/lib/applications/outcomes";
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
      return Response.json({
        outcome: existing,
        message: "Application was already marked applied.",
      });
    }

    const result = await recordApplicationOutcome({
      applicationId: params.id,
      outcome: "APPLIED",
    });

    return Response.json({ outcome: result.outcome, message: result.message });
  } catch (error) {
    return apiError(error, 400);
  }
}
