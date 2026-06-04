import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  action: z.enum(["approve", "disable"]),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = patchSchema.parse(await request.json().catch(() => ({})));
    const memory = await prisma.applicationFieldMemory.update({
      where: { id: params.id },
      data: body.action === "approve"
        ? {
            status: "ACTIVE",
            reusePolicy: "AUTO_USE",
            confidence: { increment: 4 },
          }
        : {
            status: "DISABLED",
            reusePolicy: "NEVER_REUSE",
          },
    });

    return NextResponse.json({
      memory,
      message: body.action === "approve"
        ? "Application field memory approved for future auto-fill."
        : "Application field memory disabled.",
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const memory = await prisma.applicationFieldMemory.update({
      where: { id: params.id },
      data: {
        status: "DISABLED",
        reusePolicy: "NEVER_REUSE",
      },
    });

    return NextResponse.json({ memory, message: "Application field memory disabled." });
  } catch (error) {
    return apiError(error, 400);
  }
}
