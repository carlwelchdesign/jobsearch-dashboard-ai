import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { resolveApplicationFieldAnswer } from "@/lib/applications/field-answer-resolver";
import { browserExtensionAuthError } from "@/lib/browser-extension-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  fieldId: z.string().trim().max(180).nullish(),
  selector: z.string().trim().max(500).nullish(),
  label: z.string().trim().min(1).max(1200),
  inputType: z.string().trim().max(80).nullish(),
  category: z.string().trim().max(120).nullish(),
  context: z.string().trim().max(1000).nullish(),
  minimumConfidence: z.number().int().min(0).max(100).optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const authError = browserExtensionAuthError(request);
    if (authError) return authError;
    const body = requestSchema.parse(await request.json());
    const resolution = await resolveApplicationFieldAnswer({
      applicationId: params.id,
      minimumConfidence: body.minimumConfidence,
      field: {
        fieldId: body.fieldId,
        selector: body.selector,
        label: body.label,
        inputType: body.inputType,
        category: body.category,
        context: body.context,
      },
    });
    return NextResponse.json(resolution);
  } catch (error) {
    return apiError(error, 400);
  }
}
