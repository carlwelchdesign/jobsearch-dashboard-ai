import { NextResponse } from "next/server";
import { runSystemArchitectureAgent } from "@/lib/agents/system-architecture";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const latestRun = await prisma.agentRun.findFirst({
      where: { agentType: "SYSTEM_ARCHITECTURE", status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ latestRun });
  } catch (error) {
    return apiError(error, 400);
  }
}

export async function POST() {
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    const result = await runSystemArchitectureAgent({ userId: user?.id, source: "dashboard" });
    return NextResponse.json({ run: result.run, output: result.output, message: "System architecture report refreshed." });
  } catch (error) {
    return apiError(error, 400);
  }
}
