import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { runJobSearch } from "@/lib/job-search/ingest";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const configuredSecret = process.env.CRON_SECRET;
    if (configuredSecret) {
      const authorization = request.headers.get("authorization");
      if (authorization !== `Bearer ${configuredSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const activeRun = await prisma.jobSearchRun.findFirst({
      where: { status: "running" },
      orderBy: { createdAt: "desc" },
    });

    if (activeRun) {
      return NextResponse.json({ run: activeRun, skipped: true, reason: "A job search run is already in progress." }, { status: 202 });
    }

    const profiles = await prisma.jobSearchProfile.findMany({
      where: { enabled: true, scheduleEnabled: true },
      select: { id: true },
    });

    const run = await prisma.jobSearchRun.create({
      data: {
        status: "running",
        triggeredBy: "cron",
        profileIds: profiles.map((profile) => profile.id),
        progress: [{ at: new Date().toISOString(), message: "Scheduled search queued." }],
      },
    });

    void runJobSearch("cron", run.id).catch(async (error) => {
      const latest = await prisma.jobSearchRun.findUnique({
        where: { id: run.id },
        select: { progress: true },
      });
      const progress = Array.isArray(latest?.progress) ? latest.progress : [];
      await prisma.jobSearchRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          errors: [{ message: error instanceof Error ? error.message : "Unknown scheduled search failure" }],
          progress: [
            ...progress,
            {
              at: new Date().toISOString(),
              message: `Scheduled search failed: ${error instanceof Error ? error.message : "Unknown scheduled search failure"}`,
            },
          ],
        },
      });
    });

    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    return apiError(error, 400);
  }
}

export const POST = GET;
