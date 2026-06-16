import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireSingleUser } from "@/lib/auth/single-user";
import { applyReadinessOverride, buildLifecycleReadiness } from "@/lib/readiness/lifecycle";

export const dynamic = "force-dynamic";

const readinessOverrideSchema = z.object({
  action: z.enum(["complete", "dismiss", "snooze", "reset"]),
  snoozedUntil: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function PATCH(request: Request, { params }: { params: { key: string } }) {
  try {
    const user = await requireSingleUser(request);
    const body = readinessOverrideSchema.parse(await request.json());
    await applyReadinessOverride({
      userId: user.id,
      key: decodeURIComponent(params.key),
      action: body.action,
      snoozedUntil: body.snoozedUntil,
      note: body.note,
      metadata: body.metadata,
    });
    const readiness = await buildLifecycleReadiness({ userId: user.id });
    return NextResponse.json(readiness);
  } catch (error) {
    return apiError(error, error instanceof z.ZodError ? 400 : 401);
  }
}
