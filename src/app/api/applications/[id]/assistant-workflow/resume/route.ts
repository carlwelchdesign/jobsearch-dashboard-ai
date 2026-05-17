import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { resumeApplicationAssistantWorkflow } from "@/lib/applications/assistant-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const observedFieldSchema = z.object({
  fieldKey: z.string().trim().max(160).nullish(),
  category: z.string().trim().max(120).nullish(),
  label: z.string().trim().min(1).max(800),
  inputType: z.string().trim().max(80).nullish(),
  selector: z.string().trim().max(500).nullish(),
  answer: z.string().trim().min(1).max(4000),
  source: z.enum(["manual_observation", "assistant_confirmation"]).default("manual_observation"),
  confidence: z.number().int().min(0).max(100).optional(),
});

const requestSchema = z.object({
  action: z.string().trim().max(120).optional(),
  message: z.string().trim().max(1000).optional(),
  host: z.string().trim().max(255).optional(),
  fields: z.array(observedFieldSchema).max(80).optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = requestSchema.parse(await request.json());
    const workflow = await resumeApplicationAssistantWorkflow({
      applicationId: params.id,
      action: body.action,
      message: body.message,
      host: body.host,
      fields: body.fields,
    });
    return NextResponse.json({ workflow });
  } catch (error) {
    return apiError(error, 400);
  }
}
