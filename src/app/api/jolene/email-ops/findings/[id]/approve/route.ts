import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { approveEmailOpsFinding } from "@/lib/jolene/email-ops";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });
    const result = await approveEmailOpsFinding({ userId: user.id, findingId: params.id });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, 400);
  }
}
