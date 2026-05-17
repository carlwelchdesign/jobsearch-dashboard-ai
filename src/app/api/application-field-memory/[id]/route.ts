import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
