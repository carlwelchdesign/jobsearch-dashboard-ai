import type { AgentRunStatus, JobMatchStatus } from "@prisma/client";
import {
  actions,
  actionValue,
  compactBlocks,
  context,
  header,
  link,
  sanitize,
  section,
  shortDate,
  slackButton,
  SLACK_ACTIONS,
  type SlackMessage,
} from "@/lib/slack/blocks";
import { requireSlackConfig } from "@/lib/slack/config";
import { requireSingleUser } from "@/lib/auth/single-user";
import { prisma } from "@/lib/prisma";

export type SlackBriefingKind = "morning" | "evening" | "focus";

export type SlackDailyBriefingData = {
  kind: SlackBriefingKind;
  generatedAt: Date;
  appBaseUrl: string;
  topOpportunities: Array<{ id: string; title: string; company: string; score: number; status: JobMatchStatus }>;
  staleApplications: Array<{ id: string; title: string; company: string; status: JobMatchStatus; updatedAt: Date; followUpAt: Date | null }>;
  followUpsDue: Array<{ id: string; label: string; dueAt: Date | null; kind: "application" | "recruiter" }>;
  searchQualityIssues: string[];
  completedActions: Array<{ subject: string; createdAt: Date }>;
  unresolvedBlockers: Array<{ id: string; agentType: string; status: AgentRunStatus; updatedAt: Date; error: string | null }>;
  decisionsMade: Array<{ subject: string; status: string; createdAt: Date }>;
  recommendedAction: string;
};

export async function buildSlackDailyBriefing(kind: SlackBriefingKind): Promise<SlackMessage> {
  return buildSlackDailyBriefingMessage(await buildSlackDailyBriefingData(kind));
}

export async function buildSlackDailyBriefingData(kind: SlackBriefingKind): Promise<SlackDailyBriefingData> {
  const [config, user] = [requireSlackConfig(), await requireSingleUser()];
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const staleThreshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [
    topMatches,
    staleApplications,
    followUpApplications,
    recruiterFollowUps,
    openSearchProfileChanges,
    latestSearchOptimizationRun,
    unhealthyRuns,
    completedActions,
    decisionsMade,
  ] = await Promise.all([
    prisma.jobProfileMatch.findMany({
      where: {
        status: { in: ["needs_review", "approved", "ready_to_apply"] },
        jobSearchProfile: { userId: user.id },
      },
      include: { jobPosting: { select: { id: true, title: true, company: true } } },
      orderBy: [{ overallScore: "desc" }, { updatedAt: "desc" }],
      take: 5,
    }),
    prisma.application.findMany({
      where: {
        userId: user.id,
        status: { in: ["ready_to_apply", "follow_up_due", "screening", "interviewing"] },
        OR: [{ updatedAt: { lt: staleThreshold } }, { followUpAt: { lte: soon } }],
      },
      include: { jobPosting: { select: { title: true, company: true } } },
      orderBy: [{ followUpAt: "asc" }, { updatedAt: "asc" }],
      take: 5,
    }),
    prisma.application.findMany({
      where: { userId: user.id, followUpAt: { lte: soon }, status: { notIn: ["rejected_by_company", "archived", "offer"] } },
      include: { jobPosting: { select: { title: true, company: true } } },
      orderBy: { followUpAt: "asc" },
      take: 5,
    }),
    prisma.recruiterOutreach.findMany({
      where: { userId: user.id, followUpAt: { lte: soon }, status: { in: ["DRAFT", "SENT", "NO_RESPONSE"] } },
      include: { contact: { select: { name: true, company: true } }, jobPosting: { select: { title: true, company: true } } },
      orderBy: { followUpAt: "asc" },
      take: 5,
    }),
    prisma.searchProfileChange.count({ where: { userId: user.id, status: { in: ["PROPOSED", "REVIEW_ONLY"] } } }),
    prisma.searchOptimizationRun.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { summary: true, metricsJson: true, createdAt: true },
    }),
    prisma.agentRun.findMany({
      where: {
        userId: user.id,
        OR: [
          { status: "FAILED" },
          { status: "RUNNING", updatedAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, agentType: true, status: true, updatedAt: true, error: true },
    }),
    prisma.notificationLog.findMany({
      where: { userId: user.id, type: "slack", status: "executed", createdAt: { gte: todayStart } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { subject: true, createdAt: true },
    }),
    prisma.notificationLog.findMany({
      where: { userId: user.id, type: "slack", status: { in: ["executed", "skipped", "failed"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { subject: true, status: true, createdAt: true },
    }),
  ]);

  const searchQualityIssues = [
    openSearchProfileChanges ? `${openSearchProfileChanges} search-profile change(s) still need review.` : null,
    latestSearchOptimizationRun ? `Latest search note: ${latestSearchOptimizationRun.summary}` : null,
    topMatches.length ? null : "No high-scoring opportunities are waiting in review.",
  ].filter(Boolean) as string[];

  return {
    kind,
    generatedAt: now,
    appBaseUrl: config.appBaseUrl,
    topOpportunities: topMatches.map((match) => ({
      id: match.jobPosting.id,
      title: match.jobPosting.title,
      company: match.jobPosting.company,
      score: match.overallScore,
      status: match.status,
    })),
    staleApplications: staleApplications.map((application) => ({
      id: application.id,
      title: application.jobPosting.title,
      company: application.jobPosting.company,
      status: application.status,
      updatedAt: application.updatedAt,
      followUpAt: application.followUpAt,
    })),
    followUpsDue: [
      ...followUpApplications.map((application) => ({
        id: application.id,
        label: `${application.jobPosting.company} - ${application.jobPosting.title}`,
        dueAt: application.followUpAt,
        kind: "application" as const,
      })),
      ...recruiterFollowUps.map((outreach) => ({
        id: outreach.id,
        label: outreach.contact?.name
          ? `${outreach.contact.name}${outreach.contact.company ? ` at ${outreach.contact.company}` : ""}`
          : `${outreach.jobPosting?.company ?? "Recruiter"} - ${outreach.jobPosting?.title ?? "follow-up"}`,
        dueAt: outreach.followUpAt,
        kind: "recruiter" as const,
      })),
    ].slice(0, 6),
    searchQualityIssues: searchQualityIssues.slice(0, 4),
    completedActions,
    unresolvedBlockers: unhealthyRuns,
    decisionsMade,
    recommendedAction: recommendAction({
      topOpportunities: topMatches.length,
      followUpsDue: followUpApplications.length + recruiterFollowUps.length,
      staleApplications: staleApplications.length,
      blockers: unhealthyRuns.length,
      openSearchProfileChanges,
    }),
  };
}

export function buildSlackDailyBriefingMessage(data: SlackDailyBriefingData): SlackMessage {
  const label = data.kind === "morning" ? "Morning Briefing" : data.kind === "evening" ? "Evening Briefing" : "Focus Plan";
  const blocks = data.kind === "evening"
    ? eveningBlocks(data)
    : data.kind === "focus"
      ? focusBlocks(data)
      : morningBlocks(data);

  return {
    text: `Job Search OS ${label}`,
    blocks: compactBlocks([
      header(`Job Search OS ${label}`),
      ...blocks,
      actions([
        slackButton({
          text: "Open app",
          actionId: SLACK_ACTIONS.openLink,
          value: actionValue({ kind: "open_link", href: data.appBaseUrl }),
          url: data.appBaseUrl,
        }),
      ]),
      context([link(data.appBaseUrl, "Open Job Search OS"), `Generated ${shortDate(data.generatedAt)}`]),
    ]),
  };
}

function morningBlocks(data: SlackDailyBriefingData) {
  return [
    section(`*Recommended first move:* ${sanitize(data.recommendedAction)}`),
    section(`*Top opportunities*\n${opportunityLines(data)}`),
    section(`*Follow-ups due*\n${followUpLines(data)}`),
    section(`*Search quality*\n${qualityLines(data)}`),
  ];
}

function eveningBlocks(data: SlackDailyBriefingData) {
  return [
    section(`*Completed today*\n${data.completedActions.length ? data.completedActions.map((item) => `- ${sanitize(item.subject)} (${shortDate(item.createdAt)})`).join("\n") : "- None recorded from Slack today."}`),
    section(`*Unresolved blockers*\n${data.unresolvedBlockers.length ? data.unresolvedBlockers.map((run) => `- ${run.agentType} ${run.status} (${shortDate(run.updatedAt)})`).join("\n") : "- No failed or stale agent runs."}`),
    section(`*Recent decisions*\n${data.decisionsMade.length ? data.decisionsMade.map((item) => `- ${sanitize(item.subject)} - ${item.status}`).join("\n") : "- No Slack decisions recorded yet."}`),
    section(`*Tomorrow's first move:* ${sanitize(data.recommendedAction)}`),
  ];
}

function focusBlocks(data: SlackDailyBriefingData) {
  return [
    section(`*Focus:* ${sanitize(data.recommendedAction)}`),
    section(`*Best targets*\n${opportunityLines(data)}`),
    section(`*Blockers to clear*\n${data.unresolvedBlockers.length ? data.unresolvedBlockers.map((run) => `- ${run.agentType}: ${sanitize(run.error ?? run.status)}`).join("\n") : qualityLines(data)}`),
  ];
}

function opportunityLines(data: SlackDailyBriefingData) {
  return data.topOpportunities.length
    ? data.topOpportunities.map((job) => `- ${sanitize(job.company)} - ${sanitize(job.title)} (${job.score}, ${job.status})`).join("\n")
    : "- No reviewed high-scoring jobs are waiting.";
}

function followUpLines(data: SlackDailyBriefingData) {
  return data.followUpsDue.length
    ? data.followUpsDue.map((item) => `- ${sanitize(item.label)}${item.dueAt ? ` (${shortDate(item.dueAt)})` : ""}`).join("\n")
    : "- No follow-ups due in the next 24 hours.";
}

function qualityLines(data: SlackDailyBriefingData) {
  return data.searchQualityIssues.length
    ? data.searchQualityIssues.map((issue) => `- ${sanitize(issue)}`).join("\n")
    : "- No search quality issues detected.";
}

function recommendAction(input: {
  topOpportunities: number;
  followUpsDue: number;
  staleApplications: number;
  blockers: number;
  openSearchProfileChanges: number;
}) {
  if (input.blockers) return "Clear the failed or stale agent run before starting more work.";
  if (input.followUpsDue) return "Handle the due follow-ups before reviewing new leads.";
  if (input.topOpportunities) return "Open an opportunity room for the highest-scoring job and decide apply/skip.";
  if (input.openSearchProfileChanges) return "Review proposed search-profile changes so the search team can improve yield.";
  if (input.staleApplications) return "Review stale applications and decide whether to follow up or archive.";
  return "Run Jolene or the Recruiting Search Team to create the next actionable queue.";
}
