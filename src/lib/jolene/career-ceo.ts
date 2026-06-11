import { careerMissionSummary, getOrCreateCareerMission, serializeCareerMission } from "@/lib/jolene/career-mission";
import { prisma } from "@/lib/prisma";

export type CareerCeoBrief = {
  generatedAt: string;
  mission: ReturnType<typeof serializeCareerMission>;
  summary: string;
  moneyMoves: Array<{
    priority: number;
    category: "submit" | "respond" | "review_high_income" | "follow_up" | "tune_search" | "prepare_interview";
    title: string;
    detail: string;
    href: string;
    incomeRelevance: "high" | "medium" | "unknown";
  }>;
  incomeRisks: string[];
  pipelineLeverage: {
    readyApplications: number;
    highScoreJobs: number;
    followUps: number;
    openBlockers: number;
    unknownSalaryApplications: number;
    belowTargetApplications: number;
  };
  recommendedSprintActions: string[];
  confidence: "low" | "medium" | "high";
};

type MoneyMove = CareerCeoBrief["moneyMoves"][number];

export async function buildCareerCeoBrief(userId: string): Promise<CareerCeoBrief> {
  const missionRecord = await getOrCreateCareerMission(userId);
  const mission = serializeCareerMission(missionRecord);
  const [readyApplications, highScoreJobs, followUps, openBlockers, interviews, profiles] = await Promise.all([
    prisma.application.findMany({
      where: { userId, status: "ready_to_apply" },
      include: { jobPosting: true, jobProfileMatch: true },
      orderBy: [{ updatedAt: "desc" }],
      take: 20,
    }),
    prisma.jobProfileMatch.findMany({
      where: {
        status: "needs_review",
        overallScore: { gte: 85 },
        jobSearchProfile: { userId },
      },
      include: { jobPosting: true, jobSearchProfile: { select: { name: true, salaryMin: true, salaryCurrency: true } } },
      orderBy: [{ overallScore: "desc" }, { updatedAt: "desc" }],
      take: 20,
    }),
    prisma.application.findMany({
      where: {
        userId,
        OR: [{ status: "follow_up_due" }, { followUpAt: { lte: new Date() } }],
      },
      include: { jobPosting: true },
      orderBy: [{ followUpAt: "asc" }, { updatedAt: "desc" }],
      take: 12,
    }),
    prisma.agentUserRequest.count({ where: { userId, status: "OPEN" } }),
    prisma.application.findMany({
      where: { userId, status: { in: ["screening", "interviewing"] } },
      include: { jobPosting: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.jobSearchProfile.findMany({
      where: { userId, enabled: true },
      select: { id: true, name: true, salaryMin: true, salaryMax: true, salaryCurrency: true, minimumMatchScore: true },
      orderBy: [{ salaryMin: "desc" }, { minimumMatchScore: "desc" }],
      take: 12,
    }),
  ]);

  const targetMin = mission.targetCompensationMin ?? 0;
  const unknownSalaryApplications = readyApplications.filter((application) => !application.jobPosting.salaryMin && !application.jobPosting.salaryMax).length;
  const belowTargetApplications = targetMin
    ? readyApplications.filter((application) => {
        const high = application.jobPosting.salaryMax ?? application.jobPosting.salaryMin ?? 0;
        return high > 0 && high < targetMin;
      }).length
    : 0;

  const moneyMoves: MoneyMove[] = [
    ...interviews.slice(0, 2).map((application, index) => ({
      priority: index + 1,
      category: "prepare_interview" as const,
      title: `Protect interview momentum at ${application.jobPosting.company}`,
      detail: `Prepare compensation questions and evidence-backed stories for ${application.jobPosting.title}.`,
      href: `/applications/${application.id}`,
      incomeRelevance: salaryRelevance(application.jobPosting, targetMin),
    })),
    ...readyApplications.slice(0, 3).map((application, index) => ({
      priority: interviews.length + index + 1,
      category: "submit" as const,
      title: `Submit ready application for ${application.jobPosting.company}`,
      detail: `${application.jobPosting.title}. Materials are ready; final submission remains manual.`,
      href: `/applications/${application.id}`,
      incomeRelevance: salaryRelevance(application.jobPosting, targetMin),
    })),
    ...highScoreJobs.slice(0, 3).map((match, index) => ({
      priority: interviews.length + readyApplications.length + index + 1,
      category: "review_high_income" as const,
      title: `Review ${match.overallScore}-score role at ${match.jobPosting.company}`,
      detail: `${match.jobPosting.title}. Compare against ${match.jobSearchProfile.name} and compensation target before approving.`,
      href: `/jobs/${match.jobPosting.id}`,
      incomeRelevance: salaryRelevance(match.jobPosting, targetMin),
    })),
    ...followUps.slice(0, 2).map((application, index) => ({
      priority: interviews.length + readyApplications.length + highScoreJobs.length + index + 1,
      category: "follow_up" as const,
      title: `Follow up with ${application.jobPosting.company}`,
      detail: `${application.jobPosting.title}. Keep warm opportunities from going stale.`,
      href: `/applications/${application.id}`,
      incomeRelevance: salaryRelevance(application.jobPosting, targetMin),
    })),
  ].sort((left, right) => left.priority - right.priority).slice(0, 6);

  if (!moneyMoves.length) {
    moneyMoves.push({
      priority: 1,
      category: "tune_search",
      title: "Run a high-income search refresh",
      detail: "The sprint queue is light. Refresh discovery and tune salary floors before spending time on lower-leverage work.",
      href: "/profiles",
      incomeRelevance: "unknown",
    });
  }

  const incomeRisks = [
    unknownSalaryApplications ? `${unknownSalaryApplications} ready application${unknownSalaryApplications === 1 ? "" : "s"} lack saved salary data.` : null,
    belowTargetApplications ? `${belowTargetApplications} ready application${belowTargetApplications === 1 ? "" : "s"} appear below the target floor.` : null,
    openBlockers ? `${openBlockers} open blocker${openBlockers === 1 ? "" : "s"} may slow the sprint.` : null,
    profiles.some((profile) => !profile.salaryMin) ? "At least one enabled search profile has no salary floor." : null,
  ].filter(Boolean) as string[];

  const recommendedSprintActions = [
    moneyMoves[0] ? `Do first: ${moneyMoves[0].title}.` : null,
    readyApplications.length ? "Use Apply Sprint for ready applications before tuning lower-value settings." : null,
    unknownSalaryApplications ? "Ask compensation range early for salary-unknown roles." : null,
    highScoreJobs.length ? "Approve only high-score roles that support the income target or clear strategic leverage." : null,
    openBlockers ? "Clear hard blockers that stop applications or agent runs." : null,
  ].filter(Boolean) as string[];

  return {
    generatedAt: new Date().toISOString(),
    mission,
    summary: `Career CEO brief: ${careerMissionSummary(mission)} ${moneyMoves[0]?.title ?? "Run a high-income search refresh"}.`,
    moneyMoves,
    incomeRisks,
    pipelineLeverage: {
      readyApplications: readyApplications.length,
      highScoreJobs: highScoreJobs.length,
      followUps: followUps.length,
      openBlockers,
      unknownSalaryApplications,
      belowTargetApplications,
    },
    recommendedSprintActions,
    confidence: confidenceFor({ moneyMoves: moneyMoves.length, profiles: profiles.length, targetSet: Boolean(targetMin) }),
  };
}

export function formatCareerCeoBrief(brief: CareerCeoBrief) {
  return [
    brief.summary,
    `Money moves: ${brief.moneyMoves.slice(0, 3).map((move) => `${move.title} (${move.href})`).join("; ")}.`,
    brief.incomeRisks.length ? `Income risks: ${brief.incomeRisks.join(" ")}` : "Income risks: no major compensation blockers found in the current sprint queue.",
    `Sprint actions: ${brief.recommendedSprintActions.join(" ") || "Refresh discovery and update outcomes."}`,
  ].join("\n\n");
}

function salaryRelevance(job: { salaryMin: number | null; salaryMax: number | null }, targetMin: number): "high" | "medium" | "unknown" {
  if (!job.salaryMin && !job.salaryMax) return "unknown";
  if (!targetMin) return "medium";
  const high = job.salaryMax ?? job.salaryMin ?? 0;
  return high >= targetMin ? "high" : "medium";
}

function confidenceFor(input: { moneyMoves: number; profiles: number; targetSet: boolean }): CareerCeoBrief["confidence"] {
  if (input.moneyMoves >= 3 && input.profiles > 0 && input.targetSet) return "high";
  if (input.moneyMoves > 0 && input.profiles > 0) return "medium";
  return "low";
}
