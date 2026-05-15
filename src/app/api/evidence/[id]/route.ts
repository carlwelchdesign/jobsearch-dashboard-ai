import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { normalizeTags } from "@/lib/evidence/tags";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  confidence: z.enum(["VERIFIED", "INFERRED", "NEEDS_REVIEW", "REJECTED"]).optional(),
  usableInResume: z.boolean().optional(),
  usableInCoverLetter: z.boolean().optional(),
  usableInRecruiterMessage: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = patchSchema.parse(await request.json());
    const evidence = await prisma.candidateEvidence.update({
      where: { id: params.id },
      data: {
        ...body,
        ...(body.tags ? { tags: normalizeTags(body.tags) as Prisma.InputJsonValue } : {}),
      },
    });

    return NextResponse.json({ evidence });
  } catch (error) {
    return apiError(error, 400);
  }
}
