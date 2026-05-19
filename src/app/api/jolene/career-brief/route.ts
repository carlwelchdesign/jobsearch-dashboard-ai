import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { buildCareerCeoBrief } from "@/lib/jolene/career-ceo";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) {
      return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });
    }
    const brief = await buildCareerCeoBrief(user.id);
    return NextResponse.json({ brief });
  } catch (error) {
    return apiError(error, 400);
  }
}
