import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { RESUME_FORMATS } from "@/lib/resumes/resume-format";

export const dynamic = "force-dynamic";

const profileSettingsSchema = z.object({
  githubUrl: z.string().url().optional().or(z.literal("")),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  raceAnswer: z.string().max(200).optional().or(z.literal("")),
  genderAnswer: z.string().max(200).optional().or(z.literal("")),
  veteranStatusAnswer: z.string().max(200).optional().or(z.literal("")),
  disabilityAnswer: z.string().max(200).optional().or(z.literal("")),
  resumeFormat: z.enum(RESUME_FORMATS).optional(),
});

export async function PATCH(request: Request) {
  try {
    const body = profileSettingsSchema.parse(await request.json());
    const user = await prisma.user.findFirst({
      include: { profile: true },
      orderBy: { createdAt: "asc" },
    });

    if (!user?.profile) {
      return NextResponse.json({ error: "No candidate profile exists. Upload or seed a profile first." }, { status: 400 });
    }

    const data: Record<string, string | null> = {};
    for (const key of ["githubUrl", "linkedinUrl", "raceAnswer", "genderAnswer", "veteranStatusAnswer", "disabilityAnswer"] as const) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        data[key] = body[key] || null;
      }
    }
    if (body.resumeFormat) data.resumeFormat = body.resumeFormat;

    const profile = await prisma.userProfile.update({
      where: { id: user.profile.id },
      data,
    });

    return NextResponse.json({ profile });
  } catch (error) {
    return apiError(error, 400);
  }
}
