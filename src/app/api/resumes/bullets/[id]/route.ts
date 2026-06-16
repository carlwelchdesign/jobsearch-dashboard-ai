import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toExperienceCategory } from "@/lib/resumes/db";

export const dynamic = "force-dynamic";

const updateBulletSchema = z.object({
  workExperienceId: z.string().trim().nullable().optional(),
  company: z.string().trim().min(1).optional(),
  role: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  text: z.string().trim().min(10).optional(),
  keywords: z.string().optional(),
  sourceText: z.string().optional(),
  truthLevel: z.enum(["verified", "inferred", "estimated", "needs_review"]).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = updateBulletSchema.parse(await request.json());
    const bullet = await prisma.experienceBullet.update({
      where: { id: params.id },
      data: {
        ...(body.workExperienceId !== undefined ? { workExperienceId: body.workExperienceId || null } : {}),
        ...(body.company ? { company: body.company } : {}),
        ...(body.role ? { role: body.role } : {}),
        ...(body.category ? { category: toExperienceCategory(body.category) } : {}),
        ...(body.text ? { text: body.text } : {}),
        ...(typeof body.sourceText === "string" ? { sourceText: body.sourceText || null } : {}),
        ...(typeof body.keywords === "string" ? { keywords: parseKeywords(body.keywords) as Prisma.InputJsonValue } : {}),
        ...(body.truthLevel ? { truthLevel: body.truthLevel } : {}),
      },
    });

    return NextResponse.json({ bullet });
  } catch (error) {
    return apiError(error, 400);
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.experienceBullet.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Bullet not found." }, { status: 404 });
    if (existing.truthLevel !== "needs_review") {
      return NextResponse.json({ error: "Only proposed bullets can be rejected." }, { status: 400 });
    }

    await prisma.experienceBullet.delete({ where: { id: params.id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiError(error, 400);
  }
}

function parseKeywords(value: string) {
  return value.split(",").map((keyword) => keyword.trim()).filter(Boolean);
}
