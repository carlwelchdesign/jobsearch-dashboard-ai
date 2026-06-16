import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const confirmMatchesSchema = z.object({
  matches: z.array(z.object({
    bulletId: z.string().trim().min(1),
    suggestedWorkExperienceId: z.string().trim().min(1),
  })).min(1),
});

export async function POST(request: Request) {
  try {
    const body = confirmMatchesSchema.parse(await request.json());
    const workIds = Array.from(new Set(body.matches.map((match) => match.suggestedWorkExperienceId)));
    const workExperiences = await prisma.workExperience.findMany({
      where: { id: { in: workIds } },
      select: { id: true, company: true, title: true },
    });
    const workById = new Map(workExperiences.map((work) => [work.id, work]));

    const updates = body.matches.flatMap((match) => {
      const work = workById.get(match.suggestedWorkExperienceId);
      if (!work) return [];
      return prisma.experienceBullet.update({
        where: { id: match.bulletId },
        data: {
          workExperienceId: work.id,
          company: work.company,
          role: work.title,
        },
      });
    });

    if (!updates.length) {
      return NextResponse.json({ error: "No valid bullet matches were supplied." }, { status: 400 });
    }

    await prisma.$transaction(updates);
    return NextResponse.json({ updatedCount: updates.length });
  } catch (error) {
    return apiError(error, 400);
  }
}
