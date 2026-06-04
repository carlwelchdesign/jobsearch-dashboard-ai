import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { createThankYouDraft, thankYouStages } from "@/lib/applications/thank-you-drafts";

export const dynamic = "force-dynamic";

const thankYouDraftSchema = z.object({
  stage: z.enum(thankYouStages),
  interviewerName: z.string().trim().min(1, "Interviewer name is required."),
  interviewerTitle: z.string().trim().optional(),
  interviewerLinkedin: z.string().trim().url().optional().or(z.literal("")),
  interviewDate: z.string().date().optional().or(z.literal("")),
  notes: z.string().trim().optional(),
  tone: z.string().trim().optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = thankYouDraftSchema.parse(await request.json());
    const result = await createThankYouDraft({
      applicationId: params.id,
      stage: body.stage,
      interviewerName: body.interviewerName,
      interviewerTitle: body.interviewerTitle,
      interviewerLinkedin: body.interviewerLinkedin || undefined,
      interviewDate: body.interviewDate ? new Date(`${body.interviewDate}T12:00:00.000Z`) : undefined,
      notes: body.notes,
      tone: body.tone,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error, 400);
  }
}
