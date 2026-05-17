import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { storeObservedFieldLearning } from "@/lib/applications/field-learning";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
  host: z.string().trim().min(1).max(255),
  fields: z.array(observedFieldSchema).max(80),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = requestSchema.parse(await request.json());
    const application = await prisma.application.findUnique({
      where: { id: params.id },
      include: { jobPosting: true },
    });
    if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404 });

    const result = await storeObservedFieldLearning({
      userId: application.userId,
      applicationId: application.id,
      atsProvider: application.jobPosting.atsProvider,
      host: body.host,
      fields: body.fields,
    });

    await prisma.applicationEvent.create({
      data: {
        applicationId: application.id,
        type: "note_added",
        payload: {
          source: "application_field_learning",
          saved: result.saved,
          ignored: result.ignored,
        },
      },
    });

    return NextResponse.json({
      saved: result.saved,
      ignored: result.ignored,
      decisions: result.decisions.map((decision) => ({
        action: decision.action,
        reason: decision.reason,
        memoryId: decision.memory?.id ?? null,
        status: decision.memory?.status ?? null,
        sensitivity: decision.memory?.sensitivity ?? null,
        reusePolicy: decision.memory?.reusePolicy ?? null,
        label: decision.field.label,
      })),
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
