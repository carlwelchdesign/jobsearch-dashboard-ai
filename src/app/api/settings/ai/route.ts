import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getAiSettings, updateAiSettings } from "@/lib/settings/ai-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const aiSettingsSchema = z.object({
  linkedinContentModel: z.string().trim().min(1).max(100),
  linkedinDiagramImageModel: z.string().trim().min(1).max(100),
});

export async function GET() {
  try {
    const user = await getUser();
    const settings = await getAiSettings(user.id);
    return NextResponse.json({ settings });
  } catch (error) {
    return apiError(error, 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getUser();
    const body = aiSettingsSchema.parse(await request.json());
    const settings = await updateAiSettings({
      userId: user.id,
      linkedinContentModel: body.linkedinContentModel,
      linkedinDiagramImageModel: body.linkedinDiagramImageModel,
    });

    return NextResponse.json({
      settings,
      message: "AI model settings saved.",
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

async function getUser() {
  const user = await prisma.user.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user exists. Run seed first.");
  return user;
}
