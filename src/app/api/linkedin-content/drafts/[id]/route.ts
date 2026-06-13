import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  status: z.enum(["DRAFT", "ARCHIVED"]),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = updateSchema.parse(await request.json());
    const draft = await prisma.linkedInPostDraft.update({
      where: { id: params.id },
      data: { status: body.status },
    });
    return NextResponse.json({ draft });
  } catch (error) {
    return apiError(error, 400);
  }
}
