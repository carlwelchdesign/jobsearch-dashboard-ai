import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { evaluateAutoSubmitEligibility } from "@/lib/applications/auto-submit-policy";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const overrideSchema = z.object({
  autoSubmitOverride: z.boolean().nullable(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = overrideSchema.parse(await request.json());
    const application = await prisma.application.update({
      where: { id: params.id },
      data: { autoSubmitOverride: body.autoSubmitOverride },
      select: {
        id: true,
        autoSubmitOverride: true,
      },
    });
    const eligibility = await evaluateAutoSubmitEligibility(application.id);

    return NextResponse.json({
      application,
      eligibility,
      message: overrideMessage(application.autoSubmitOverride),
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

function overrideMessage(value: boolean | null) {
  if (value === true) return "Auto-submit override enabled for this application. Safety gates still apply.";
  if (value === false) return "Auto-submit override disabled for this application.";
  return "Auto-submit override cleared. This application now inherits global settings.";
}
