import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { approveJoleneOperatingLoopActions } from "@/lib/jolene/operating-loop";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const approveSchema = z.object({
  runId: z.string().min(1),
  proposalIds: z.array(z.string().min(1)).min(1).max(10),
});

export async function POST(request: Request) {
  try {
    const body = approveSchema.parse(await request.json());
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) {
      return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });
    }

    const result = await approveJoleneOperatingLoopActions({
      userId: user.id,
      runId: body.runId,
      proposalIds: body.proposalIds,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, 400);
  }
}
