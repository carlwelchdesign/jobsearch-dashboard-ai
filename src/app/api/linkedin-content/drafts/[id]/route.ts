import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  status: z.enum(["DRAFT", "NEEDS_REVIEW", "ARCHIVED"]).optional(),
  title: z.string().min(1).max(120).optional(),
  hook: z.string().min(1).max(220).optional(),
  body: z.string().min(1).max(3000).optional(),
  hashtags: z.array(z.string().min(1).max(40)).max(8).optional(),
  disclosureText: z.string().max(280).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = updateSchema.parse(await request.json());
    const draft = await prisma.linkedInPostDraft.update({
      where: { id: params.id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.title ? { title: body.title } : {}),
        ...(body.hook ? { hook: body.hook } : {}),
        ...(body.body ? { body: body.body } : {}),
        ...(body.hashtags ? { hashtags: body.hashtags } : {}),
        ...(typeof body.disclosureText === "string" ? { disclosureText: body.disclosureText } : {}),
        ...(body.status ? { publishError: null } : {}),
      },
    });
    return NextResponse.json({ draft });
  } catch (error) {
    return apiError(error, 400);
  }
}
