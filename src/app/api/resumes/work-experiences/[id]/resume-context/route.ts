import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  dedupeTechItems,
  dedupeVersionSuggestions,
  mergeResumeExperienceContext,
  parseResumeExperienceContext,
  resumeContextJson,
  type ResumeTechItem,
  type ResumeVersionSuggestion,
} from "@/lib/resumes/resume-context";

export const dynamic = "force-dynamic";

const techItemSchema = z.object({
  name: z.string().trim().min(1),
  version: z.string().trim().optional(),
  source: z.enum(["user_confirmed", "source_evidence", "approved_suggestion"]).optional(),
});

const versionSuggestionSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  suggestedVersion: z.string().trim().min(1),
  confidence: z.number().min(0).max(1).default(0.5),
  rationale: z.string().trim().default("Reviewed version suggestion."),
  status: z.enum(["NEEDS_REVIEW", "APPROVED", "REJECTED"]),
  source: z.enum(["source_evidence", "date_window"]).default("date_window"),
  evidence: z.array(z.string()).default([]),
});

const resumeContextSchema = z.object({
  applicationTitle: z.string().optional(),
  applicationSummary: z.string().optional(),
  users: z.string().optional(),
  scaleImpact: z.string().optional(),
  confirmedTech: z.array(techItemSchema).optional(),
  versionSuggestions: z.array(versionSuggestionSchema).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = resumeContextSchema.parse(await request.json());
    const existing = await prisma.workExperience.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Work experience not found." }, { status: 404 });

    const currentContext = parseResumeExperienceContext(existing.resumeContext);
    const nextSuggestions = body.versionSuggestions
      ? dedupeVersionSuggestions(body.versionSuggestions as ResumeVersionSuggestion[])
      : currentContext.versionSuggestions;
    const nextConfirmedTech = body.confirmedTech
      ? dedupeTechItems(body.confirmedTech.map((item): ResumeTechItem => ({ ...item, source: item.source ?? "user_confirmed" })))
      : currentContext.confirmedTech;

    const nextContext = mergeResumeExperienceContext(existing.resumeContext, {
      applicationTitle: body.applicationTitle,
      applicationSummary: body.applicationSummary,
      users: body.users,
      scaleImpact: body.scaleImpact,
      confirmedTech: nextConfirmedTech,
      versionSuggestions: nextSuggestions,
    });

    const workExperience = await prisma.workExperience.update({
      where: { id: params.id },
      data: { resumeContext: resumeContextJson(nextContext) },
    });

    return NextResponse.json({
      workExperience,
      resumeContext: parseResumeExperienceContext(workExperience.resumeContext),
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
