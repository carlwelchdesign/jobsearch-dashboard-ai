import { NextResponse } from "next/server";
import { applySearchProfileChange } from "@/lib/agents/recruiting-search-optimization";
import { apiError } from "@/lib/api";
import { requireSingleUser } from "@/lib/auth/single-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireSingleUser(request);
    const change = await prisma.searchProfileChange.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
    if (!change) return NextResponse.json({ error: "Search profile change not found." }, { status: 404 });
    const applied = await applySearchProfileChange(change.id);
    return NextResponse.json({ change: applied });
  } catch (error) {
    return apiError(error, 400);
  }
}
