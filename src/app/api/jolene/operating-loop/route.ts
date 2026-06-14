import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getLatestJoleneOperatingLoop, runJoleneOperatingLoopAgent } from "@/lib/jolene/operating-loop";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getUser();
    const run = await getLatestJoleneOperatingLoop(user.id);
    return NextResponse.json({
      run: run ? serializeRun(run) : null,
      loop: run?.outputJson ?? null,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

export async function POST() {
  try {
    const user = await getUser();
    const result = await runJoleneOperatingLoopAgent({ userId: user.id, source: "dashboard" });
    return NextResponse.json({
      run: serializeRun(result.run),
      loop: result.output,
      message: "Jolene Operating Loop generated.",
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
