import type { ApplicationAutomationRun, AtsProvider, JobPosting } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AutomationRunWithJob = ApplicationAutomationRun & {
  jobPosting: Pick<JobPosting, "atsProvider" | "company" | "title">;
};

export type AtsBlockerSummary = {
  provider: AtsProvider;
  totalRuns: number;
  blockedRuns: number;
  failedRuns: number;
  readyRuns: number;
  submittedRuns: number;
  blockerTypes: Array<{ type: string; count: number }>;
  examples: Array<{
    applicationId: string;
    company: string;
    title: string;
    blockerType: string | null;
    blockerMessage: string | null;
  }>;
};

export async function summarizeAutomationBlockers(limit = 200): Promise<AtsBlockerSummary[]> {
  const runs = await prisma.applicationAutomationRun.findMany({
    include: {
      jobPosting: {
        select: {
          atsProvider: true,
          company: true,
          title: true,
        },
      },
    },
    orderBy: { startedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
  });

  return summarizeAutomationBlockerRuns(runs);
}

export function summarizeAutomationBlockerRuns(runs: AutomationRunWithJob[]): AtsBlockerSummary[] {
  const groups = new Map<AtsProvider, AtsBlockerSummary>();

  for (const run of runs) {
    const provider = run.jobPosting.atsProvider;
    const group = groups.get(provider) ?? {
      provider,
      totalRuns: 0,
      blockedRuns: 0,
      failedRuns: 0,
      readyRuns: 0,
      submittedRuns: 0,
      blockerTypes: [],
      examples: [],
    };
    group.totalRuns += 1;
    if (run.status === "BLOCKED" || run.blockerType) group.blockedRuns += 1;
    if (run.status === "FAILED") group.failedRuns += 1;
    if (run.status === "READY_TO_SUBMIT") group.readyRuns += 1;
    if (run.status === "SUBMITTED") group.submittedRuns += 1;
    if (run.blockerType && run.blockerType !== "captcha") incrementBlockerType(group.blockerTypes, run.blockerType);
    if ((run.blockerType || run.blockerMessage) && run.blockerType !== "captcha" && group.examples.length < 3) {
      group.examples.push({
        applicationId: run.applicationId,
        company: run.jobPosting.company,
        title: run.jobPosting.title,
        blockerType: run.blockerType,
        blockerMessage: run.blockerMessage,
      });
    }
    groups.set(provider, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      blockerTypes: group.blockerTypes.sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.blockedRuns + b.failedRuns - (a.blockedRuns + a.failedRuns) || b.totalRuns - a.totalRuns);
}

function incrementBlockerType(items: Array<{ type: string; count: number }>, type: string) {
  const existing = items.find((item) => item.type === type);
  if (existing) {
    existing.count += 1;
    return;
  }
  items.push({ type, count: 1 });
}
