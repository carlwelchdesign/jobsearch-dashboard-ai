import { NextResponse } from "next/server";
import { getLatestJoleneChiefBrief, runJoleneChiefOfStaffAgent } from "@/lib/jolene/chief-of-staff";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getUser();
    const run = await getLatestJoleneChiefBrief(user.id);
    return NextResponse.json({
      run: run ? serializeRun(run) : null,
      brief: run?.outputJson ?? null,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

export async function POST() {
  try {
    const user = await getUser();
    const result = await runJoleneChiefOfStaffAgent({ userId: user.id, source: "dashboard" });
    return NextResponse.json({
      run: serializeRun(result.run),
      brief: result.output,
      message: "Jolene Chief of Staff brief generated.",
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
