import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  dedupeTechItems,
  dedupeVersionSuggestions,
  parseResumeExperienceContext,
  resumeContextJson,
  type ResumeExperienceContext,
} from "@/lib/resumes/resume-context";

export const dynamic = "force-dynamic";

const mergeWorkExperiencesSchema = z.object({
  canonicalWorkExperienceId: z.string().trim().min(1),
  duplicateWorkExperienceIds: z.array(z.string().trim().min(1)).min(1),
});

export async function POST(request: Request) {
  try {
    const body = mergeWorkExperiencesSchema.parse(await request.json());
    const duplicateIds = Array.from(new Set(body.duplicateWorkExperienceIds.filter((id) => id !== body.canonicalWorkExperienceId)));
    if (!duplicateIds.length) return NextResponse.json({ error: "At least one duplicate source is required." }, { status: 400 });

    const workExperiences = await prisma.workExperience.findMany({
      where: { id: { in: [body.canonicalWorkExperienceId, ...duplicateIds] } },
    });
    const canonical = workExperiences.find((work) => work.id === body.canonicalWorkExperienceId);
    const duplicates = workExperiences.filter((work) => duplicateIds.includes(work.id));

    if (!canonical || duplicates.length !== duplicateIds.length) {
      return NextResponse.json({ error: "Canonical and duplicate work experiences must all exist." }, { status: 404 });
    }

    const mismatch = duplicates.find((work) => (
      work.userProfileId !== canonical.userProfileId ||
      normalize(work.company) !== normalize(canonical.company) ||
      normalize(work.title) !== normalize(canonical.title)
    ));
    if (mismatch) {
      return NextResponse.json({ error: "Only duplicate sources for the same profile, company, and title can be merged." }, { status: 400 });
    }

    const mergedContext = mergeContexts(workExperiences.map((work) => parseResumeExperienceContext(work.resumeContext)));
    const mergedSkills = mergeJsonStrings(workExperiences.map((work) => work.skills));
    const mergedAchievements = mergeJsonStrings(workExperiences.map((work) => work.achievements));

    await prisma.$transaction([
      prisma.experienceBullet.updateMany({
        where: { workExperienceId: { in: duplicateIds } },
        data: {
          workExperienceId: canonical.id,
          company: canonical.company,
          role: canonical.title,
        },
      }),
      prisma.experienceBullet.updateMany({
        where: {
          userProfileId: canonical.userProfileId,
          workExperienceId: null,
          company: { equals: canonical.company, mode: "insensitive" },
          role: { equals: canonical.title, mode: "insensitive" },
        },
        data: { workExperienceId: canonical.id },
      }),
      prisma.workExperience.update({
        where: { id: canonical.id },
        data: {
          location: canonical.location ?? duplicates.find((work) => work.location)?.location ?? null,
          startDate: earliestDate([canonical, ...duplicates].map((work) => work.startDate)) ?? canonical.startDate,
          endDate: canonical.isCurrent || duplicates.some((work) => work.isCurrent)
            ? null
            : latestDate([canonical, ...duplicates].map((work) => work.endDate)) ?? canonical.endDate,
          isCurrent: canonical.isCurrent || duplicates.some((work) => work.isCurrent),
          summary: canonical.summary ?? duplicates.find((work) => work.summary)?.summary ?? null,
          skills: mergedSkills as Prisma.InputJsonValue,
          achievements: mergedAchievements as Prisma.InputJsonValue,
          resumeContext: resumeContextJson(mergedContext),
        },
      }),
      prisma.workExperience.deleteMany({ where: { id: { in: duplicateIds } } }),
    ]);

    return NextResponse.json({
      canonicalWorkExperienceId: canonical.id,
      deletedCount: duplicateIds.length,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

function mergeContexts(contexts: ResumeExperienceContext[]): ResumeExperienceContext {
  return {
    applicationTitle: first(contexts.map((context) => context.applicationTitle)),
    applicationSummary: first(contexts.map((context) => context.applicationSummary)),
    users: first(contexts.map((context) => context.users)),
    scaleImpact: first(contexts.map((context) => context.scaleImpact)),
    confirmedTech: dedupeTechItems(contexts.flatMap((context) => context.confirmedTech)),
    versionSuggestions: dedupeVersionSuggestions(contexts.flatMap((context) => context.versionSuggestions)),
    updatedAt: new Date().toISOString(),
  };
}

function mergeJsonStrings(values: Prisma.JsonValue[]) {
  return Array.from(new Set(values.flatMap((value) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [])));
}

function first(values: Array<string | undefined>) {
  return values.find((value) => value && value.trim());
}

function normalize(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function earliestDate(values: Array<string | null>) {
  return values.filter(Boolean).sort((left, right) => dateValue(left) - dateValue(right))[0] ?? null;
}

function latestDate(values: Array<string | null>) {
  return values.filter(Boolean).sort((left, right) => dateValue(right) - dateValue(left))[0] ?? null;
}

function dateValue(value: string | null) {
  if (!value) return 0;
  const match = value.match(/(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+)?(\d{4})/i);
  if (!match) return 0;
  const months: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  return Number(match[2]) * 100 + (match[1] ? months[match[1].toLowerCase().slice(0, 3)] ?? 1 : 1);
}
