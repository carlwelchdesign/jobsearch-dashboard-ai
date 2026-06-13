import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { importLinkedInAnalyticsCsv } from "@/lib/linkedin/analytics";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const importRequestSchema = z.object({
  csv: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });
    const body = importRequestSchema.parse(await request.json().catch(() => ({})));
    const result = await importLinkedInAnalyticsCsv(user.id, body.csv);
    return NextResponse.json({ message: "LinkedIn analytics CSV imported.", ...result });
  } catch (error) {
    return apiError(error, 400);
  }
}
