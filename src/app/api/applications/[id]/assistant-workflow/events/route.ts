import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { ingestApplicationAssistantWorkflowEvent } from "@/lib/applications/assistant-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fieldSchema = z.object({
  fieldId: z.string().trim().max(180).nullish(),
  selector: z.string().trim().max(500).nullish(),
  label: z.string().trim().min(1).max(800),
  inputType: z.string().trim().max(80).nullish(),
  type: z.string().trim().max(80).nullish(),
  required: z.boolean().nullish(),
  category: z.string().trim().max(120).nullish(),
  status: z.string().trim().max(120).nullish(),
  context: z.string().trim().max(160).nullish(),
  valuePreview: z.string().trim().max(500).nullish(),
});

const eventSchema = z.object({
  type: z.string().trim().min(1).max(120),
  message: z.string().trim().max(1000).nullish(),
  fieldId: z.string().trim().max(180).nullish(),
  selector: z.string().trim().max(500).nullish(),
  label: z.string().trim().max(800).nullish(),
  inputType: z.string().trim().max(80).nullish(),
  required: z.boolean().nullish(),
  category: z.string().trim().max(120).nullish(),
  status: z.string().trim().max(120).nullish(),
  valuePreview: z.string().trim().max(500).nullish(),
  fields: z.array(fieldSchema).max(250).optional(),
  result: z.string().trim().max(120).nullish(),
  error: z.string().trim().max(1000).nullish(),
  url: z.string().trim().max(2000).nullish(),
  at: z.string().trim().max(80).nullish(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const event = eventSchema.parse(await request.json());
    const workflow = await ingestApplicationAssistantWorkflowEvent({
      applicationId: params.id,
      event,
    });
    return NextResponse.json({ workflow });
  } catch (error) {
    return apiError(error, 400);
  }
}
