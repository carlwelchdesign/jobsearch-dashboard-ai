import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getLatestEmailOpsSummary } from "@/lib/jolene/email-ops";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getUser();
    const result = await getLatestEmailOpsSummary(user.id);
    return NextResponse.json({
      run: result.latestRun ? serializeRun(result.latestRun) : null,
      summary: result.summary,
      findings: result.findings,
      pendingCalendarProposals: result.pendingCalendarProposals,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

async function getUser() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user exists. Run seed first.");
  return user;
}

function serializeRun(run: { id: string; agentType: string; status: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: run.id,
    agentType: run.agentType,
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}
