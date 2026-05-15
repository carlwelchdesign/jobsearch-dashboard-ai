import { ResumeProfileStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  status: z.nativeEnum(ResumeProfileStatus).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = updateSchema.parse(await request.json());
    const profile = await prisma.resumeProfile.update({
      where: { id: params.id },
      data: body,
    });
    return NextResponse.json({ profile, message: "Resume variant updated." });
  } catch (error) {
    return apiError(error, 400);
  }
}
