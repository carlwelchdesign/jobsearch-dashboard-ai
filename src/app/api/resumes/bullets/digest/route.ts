import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { digestRoleDescriptionToBullets, inferRoleDescriptionMetadata } from "@/lib/resumes/bullet-digest";
import { toExperienceCategory } from "@/lib/resumes/db";

export const dynamic = "force-dynamic";

const digestBulletsSchema = z.object({
  userProfileId: z.string().optional(),
  company: z.string().trim().optional(),
  role: z.string().trim().optional(),
  category: z.string().trim().optional(),
  description: z.string().trim().min(80, "Paste at least 80 characters from the role description."),
  focusAreas: z.string().trim().optional(),
});

export async function POST(request: Request) {
  try {
    const body = digestBulletsSchema.parse(await request.json());
    const profile =
      body.userProfileId
        ? await prisma.userProfile.findUnique({ where: { id: body.userProfileId } })
        : await prisma.userProfile.findFirst({ orderBy: { createdAt: "asc" } });

    if (!profile) {
      return NextResponse.json({ error: "Create or seed a candidate profile before digesting role descriptions." }, { status: 400 });
    }

    const metadata = inferRoleDescriptionMetadata(body);
    const digest = await digestRoleDescriptionToBullets({ ...body, ...metadata });
    if (!digest.bullets.length) {
      return NextResponse.json({
        error: "No supported bullet proposals could be created from the pasted text.",
        warnings: digest.warnings,
      }, { status: 400 });
    }

    const [existingWorkExperience, existingBullets] = await Promise.all([
      prisma.workExperience.findFirst({
        where: {
          userProfileId: profile.id,
          company: { equals: metadata.company, mode: "insensitive" },
          title: { equals: metadata.role, mode: "insensitive" },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.experienceBullet.findMany({
        where: {
          userProfileId: profile.id,
          company: { equals: metadata.company, mode: "insensitive" },
          role: { equals: metadata.role, mode: "insensitive" },
        },
        select: { text: true },
        take: 500,
      }),
    ]);
    const existingBulletKeys = new Set(existingBullets.map((bullet) => canonicalBulletKey(bullet.text)));
    const uniqueDigestBullets = digest.bullets.filter((bullet) => {
      const key = canonicalBulletKey(bullet.text);
      if (existingBulletKeys.has(key)) return false;
      existingBulletKeys.add(key);
      return true;
    });

    const workExperience = existingWorkExperience
      ? await prisma.workExperience.update({
          where: { id: existingWorkExperience.id },
          data: {
            location: metadata.location ?? existingWorkExperience.location,
            startDate: metadata.startDate ?? existingWorkExperience.startDate,
            endDate: metadata.endDate ?? existingWorkExperience.endDate,
            isCurrent: metadata.isCurrent || existingWorkExperience.isCurrent,
            summary: metadata.summary ?? existingWorkExperience.summary,
            skills: mergeJsonStrings(existingWorkExperience.skills, metadata.skills) as Prisma.InputJsonValue,
            achievements: mergeJsonStrings(existingWorkExperience.achievements, metadata.achievements) as Prisma.InputJsonValue,
          },
        })
      : await prisma.workExperience.create({
          data: {
            userProfileId: profile.id,
            company: metadata.company,
            title: metadata.role,
            location: metadata.location,
            startDate: metadata.startDate,
            endDate: metadata.endDate,
            isCurrent: metadata.isCurrent,
            summary: metadata.summary,
            skills: metadata.skills as Prisma.InputJsonValue,
            achievements: metadata.achievements as Prisma.InputJsonValue,
          },
        });

    const created = uniqueDigestBullets.length
      ? await prisma.$transaction(uniqueDigestBullets.map((bullet) => (
          prisma.experienceBullet.create({
            data: {
              userProfileId: profile.id,
              workExperienceId: workExperience.id,
              company: metadata.company,
              role: metadata.role,
              category: toExperienceCategory(metadata.category),
              text: bullet.text,
              keywords: bullet.keywords as Prisma.InputJsonValue,
              metrics: {
                source: "role_description_digest",
                confidenceNotes: bullet.confidenceNotes,
              },
              sourceText: bullet.sourceExcerpt,
              truthLevel: "needs_review",
            },
          })
        )))
      : [];

    return NextResponse.json({
      bullets: created,
      metadata,
      workExperience,
      skippedDuplicates: digest.bullets.length - created.length,
      warnings: digest.warnings,
      message: created.length
        ? `Created ${created.length} proposed bullet${created.length === 1 ? "" : "s"} for review.`
        : "No new bullets created; matching proposals already exist.",
    }, { status: created.length ? 201 : 200 });
  } catch (error) {
    return apiError(error, 400);
  }
}

function canonicalBulletKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

function mergeJsonStrings(existing: Prisma.JsonValue, incoming: string[]) {
  const current = Array.isArray(existing) ? existing.filter((item): item is string => typeof item === "string") : [];
  return Array.from(new Set([...current, ...incoming]));
}
