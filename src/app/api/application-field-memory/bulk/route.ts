import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  action: z.enum(["approve"]),
  memoryIds: z.array(z.string().trim().min(1)).min(1).max(100),
});

export async function PATCH(request: Request) {
  try {
    const body = requestSchema.parse(await request.json().catch(() => ({})));
    const result = await prisma.applicationFieldMemory.updateMany({
      where: {
        id: { in: body.memoryIds },
        status: "NEEDS_REVIEW",
        sensitivity: { in: ["LOW", "MEDIUM"] },
      },
      data: {
        status: "ACTIVE",
        reusePolicy: "AUTO_USE",
        confidence: { increment: 4 },
      },
    });

    return NextResponse.json({
      updated: result.count,
      message: `Approved ${result.count} field memor${result.count === 1 ? "y" : "ies"} for future auto-fill.`,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
