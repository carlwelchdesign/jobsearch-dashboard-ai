import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const runs = await prisma.applicationAutomationRun.findMany({
      where: { applicationId: params.id },
      select: { id: true, pid: true },
    });

    for (const run of runs) {
      if (!run.pid) continue;
      try {
        process.kill(run.pid, "SIGTERM");
      } catch {
        // The browser runner may already be closed; reset should still clear state.
      }
    }

    const [deletedRuns, deletedRequests] = await prisma.$transaction([
      prisma.applicationAutomationRun.deleteMany({
        where: { applicationId: params.id },
      }),
      prisma.agentUserRequest.deleteMany({
        where: {
          applicationId: params.id,
          status: "OPEN",
          type: { in: ["APPLICATION_BLOCKED", "UNKNOWN_ANSWER"] },
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      message: "Assistant test state reset. You can relaunch autofill for this application.",
      deletedRuns: deletedRuns.count,
      deletedRequests: deletedRequests.count,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
