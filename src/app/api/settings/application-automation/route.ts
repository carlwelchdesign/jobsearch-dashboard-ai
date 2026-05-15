import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getApplicationAutomationSettings, updateApplicationAutomationSettings } from "@/lib/applications/auto-submit-policy";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  autoSubmitEnabled: z.boolean().default(false),
  requireApprovedPacket: z.boolean().default(true),
  requireNoOpenUserRequests: z.boolean().default(true),
  requireFreshAssistantRun: z.boolean().default(true),
  maxRunAgeMinutes: z.number().int().min(5).max(240).default(30),
  allowDemographicSubmission: z.boolean().default(false),
});

export async function GET() {
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });

    const settings = await getApplicationAutomationSettings(user.id);
    return NextResponse.json({ settings });
  } catch (error) {
    return apiError(error, 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });
    const body = settingsSchema.parse(await request.json());
    const settings = await updateApplicationAutomationSettings({
      userId: user.id,
      ...body,
    });

    return NextResponse.json({
      settings,
      message: settings.autoSubmitEnabled
        ? "Application automation settings saved. Auto-submit remains gated by per-application safety checks."
        : "Application automation settings saved. Auto-submit is disabled.",
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
