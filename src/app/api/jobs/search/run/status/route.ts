import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { recoverStaleSearchRun } from "@/lib/job-search/start-run";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const run = id
      ? await prisma.jobSearchRun.findUnique({ where: { id } })
      : await prisma.jobSearchRun.findFirst({ orderBy: { startedAt: "desc" } });

    if (!run) return NextResponse.json({ run: null });

    return NextResponse.json({ run: await recoverStaleSearchRun(run) });
  } catch (error) {
    return apiError(error, 400);
  }
}
