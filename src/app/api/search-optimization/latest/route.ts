import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireSingleUser } from "@/lib/auth/single-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireSingleUser(request);
    const latest = await prisma.searchOptimizationRun.findFirst({
      where: { userId: user.id },
      include: {
        changes: {
          include: { searchProfile: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ latest });
  } catch (error) {
    return apiError(error, 400);
  }
}
