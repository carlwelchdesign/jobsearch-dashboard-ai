import { buildStatusMessage } from "@/lib/slack/blocks";
import { requireSlackConfig } from "@/lib/slack/config";
import { requireSingleUser } from "@/lib/auth/single-user";
import { prisma } from "@/lib/prisma";

export async function buildJobSearchOsSlackStatus() {
  const [config, user] = [requireSlackConfig(), await requireSingleUser()];
  const [
    latestChiefRun,
    latestOperatingLoopRun,
    latestSearchOptimizationRun,
    openSearchProfileChanges,
    readyApplications,
    needsReviewJobs,
  ] = await Promise.all([
    prisma.agentRun.findFirst({
      where: { userId: user.id, agentType: "JOLENE_CHIEF_OF_STAFF" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true, updatedAt: true },
    }),
    prisma.agentRun.findFirst({
      where: { userId: user.id, agentType: "JOLENE_OPERATING_LOOP" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true, updatedAt: true },
    }),
    prisma.searchOptimizationRun.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, createdAt: true, summary: true },
    }),
    prisma.searchProfileChange.count({
      where: { userId: user.id, status: { in: ["PROPOSED", "REVIEW_ONLY"] } },
    }),
    prisma.application.count({
      where: { userId: user.id, status: "ready_to_apply", resumeId: { not: null }, coverLetterId: { not: null } },
    }),
    prisma.jobProfileMatch.count({
      where: { status: "needs_review", jobSearchProfile: { userId: user.id } },
    }),
  ]);

  return buildStatusMessage({
    generatedAt: new Date(),
    appBaseUrl: config.appBaseUrl,
    latestChiefRun,
    latestOperatingLoopRun,
    latestSearchOptimizationRun,
    openSearchProfileChanges,
    readyApplications,
    needsReviewJobs,
  });
}
