import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { recordApplicationAssistantWorkflowCommandResult } from "@/lib/applications/assistant-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  commandId: z.string().trim().min(1).max(180),
  result: z.enum(["success", "failed", "skipped"]),
  message: z.string().trim().max(1000).nullish(),
  valuePreview: z.string().trim().max(500).nullish(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = requestSchema.parse(await request.json());
    const result = await recordApplicationAssistantWorkflowCommandResult({
      applicationId: params.id,
      commandId: body.commandId,
      result: body.result,
      message: body.message,
      valuePreview: body.valuePreview,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, 400);
  }
}
