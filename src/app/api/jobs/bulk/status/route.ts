import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  matchIds: z.array(z.string()).min(1).max(100),
  status: z.enum(["needs_review", "approved", "rejected", "saved_for_later", "archived"]),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const result = await prisma.jobProfileMatch.updateMany({
      where: {
        id: { in: input.matchIds },
      },
      data: {
        status: input.status,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({
      updated: result.count,
      status: input.status,
      message: `${result.count} job match${result.count === 1 ? "" : "es"} updated to ${input.status.replace(/_/g, " ")}.`,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
