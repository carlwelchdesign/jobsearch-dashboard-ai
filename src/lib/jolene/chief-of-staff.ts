import type { Prisma } from "@prisma/client";
import { agentUserRequestHref } from "@/lib/agent-user-requests";
import { runDailyCommandCenterAgent } from "@/lib/agents/daily-command-center";
import { runDuplicateStaleJobDetectorAgent } from "@/lib/agents/duplicate-stale-job-detector";
import { runLinkedInContentAgent } from "@/lib/agents/linkedin-content";
import { runMarketIntelligenceAgent } from "@/lib/agents/market-intelligence";
import { runRecruitingSearchOptimization } from "@/lib/agents/recruiting-search-optimization";
import { runAgent } from "@/lib/agents/run-agent";
import { buildSearchRunAnalytics } from "@/lib/job-search/run-analytics";
import { startJobSearchRun } from "@/lib/job-search/start-run";
import { getLinkedInAnalyticsSummary } from "@/lib/linkedin/analytics";
import { buildCareerStandup, type CareerStandup } from "@/lib/jolene/career-standup";
import { getLatestEmailOpsSummary, runJoleneEmailOperationsAgent, type JoleneEmailOpsSummary } from "@/lib/jolene/email-ops";
import { prisma } from "@/lib/prisma";
import { notifySlackJoleneChiefBrief } from "@/lib/slack/notify";

export type JoleneChiefInput = {
  userId?: string;
  source?: "manual" | "scheduled" | "dashboard" | "chat";
  parentRunId?: string;
};

export type JoleneDelegatedActionId =
  | "run_job_search"
  | "run_daily_command_center"
  | "run_market_intelligence"
  | "run_recruiting_search_optimization"
  | "check_duplicates"
  | "generate_linkedin_content"
  | "run_email_ops";

export type JoleneChiefPriority = {
  id: string;
  priority: number;
  title: string;
  detail: string;
  href: string;
  category: "blocker" | "pipeline" | "agent_health" | "content" | "market" | "standup" | "email";
  rationale: string;
  evidence: string[];
  delegatedActionId?: JoleneDelegatedActionId;
  approvalRequired: boolean;
};

export type JoleneDelegatedWork = {
  id: string;
  actionId: JoleneDelegatedActionId;
  label: string;
  detail: string;
  href: string;
  risk: "safe_internal" | "approval_required" | "external_blocked";
  status: "proposed" | "approved" | "executed" | "skipped" | "failed";
  childRunId?: string;
  error?: string;
};

export type JoleneChiefOutput = {
  generatedAt: string;
  title: "Jolene, Chief of Staff";
  summary: string;
  priorities: JoleneChiefPriority[];
  delegatedWork: JoleneDelegatedWork[];
  blockers: string[];
  risks: string[];
  approvalRequests: Array<{ proposalId: string; label: string; reason: string }>;
  evidence: string[];
  careerStandup: Pick<CareerStandup, "sprintScore" | "incomeMomentum" | "attentionDebt" | "proactivePromptReason"> | null;
  confidence: "low" | "medium" | "high";
  rationale: string;
};

export type JoleneChiefContext = {
  now: Date;
  source: NonNullable<JoleneChiefInput["source"]>;
  openRequests: Array<{ id: string; type: string; summary: string; href: string | null }>;
  recentRuns: Array<{ id: string; agentType: string; status: string; createdAt: Date; updatedAt: Date; error: string | null; parentRunId: string | null }>;
  latestSearchRun: { id: string; status: string; startedAt: Date; jobsFetched: number; jobsAfterDedupe: number; jobsAfterFilters: number; jobsSaved: number; progress: Prisma.JsonValue; errors: unknown } | null;
  applicationCounts: Record<string, number>;
  needsReviewCount: number;
  readyApplicationCount: number;
  latestMarketRun: { id: string; createdAt: Date; outputJson: Prisma.JsonValue | null } | null;
  latestLinkedInDraft: { id: string; status: string; title: string | null; updatedAt: Date } | null;
  linkedInAnalytics: { posts: number; impressions: number; engagementRate: number | null } | null;
  emailOps: { runId: string | null; createdAt: Date | null; summary: JoleneEmailOpsSummary | null; pendingFindings: number; calendarDrafts: number } | null;
  careerStandup: CareerStandup | null;
};

export async function runJoleneChiefOfStaffAgent(input: JoleneChiefInput = {}) {
  const user = input.userId
    ? await prisma.user.findUnique({ where: { id: input.userId } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user exists. Run seed first.");

  return runAgent<JoleneChiefInput, JoleneChiefOutput>({
    agentType: "JOLENE_CHIEF_OF_STAFF",
    input: { ...input, source: input.source ?? "manual" },
    userId: user.id,
    parentRunId: input.parentRunId,
    execute: async (run) => {
      const context = await buildJoleneChiefContext(user.id, input.source ?? "manual");
      const output = buildJoleneChiefBrief(context);
      await prisma.agentRunEvent.create({
        data: {
          agentRunId: run.id,
          type: "chief_brief_created",
          message: `Jolene created ${output.priorities.length} priorities and ${output.delegatedWork.length} delegated work proposal(s).`,
          payloadJson: toJsonInput({ priorityIds: output.priorities.map((priority) => priority.id), delegatedWorkIds: output.delegatedWork.map((work) => work.id) }),
        },
      });
      await notifySlackJoleneChiefBrief({ userId: user.id, runId: run.id, output }).catch((error) => recordSlackNotificationFailure(run.id, error));
      return output;
    },
  });
}

async function recordSlackNotificationFailure(agentRunId: string, error: unknown) {
  await prisma.agentRunEvent.create({
    data: {
      agentRunId,
      type: "slack_notification_failed",
      message: "Slack notification failed after Jolene Chief of Staff completed.",
      payloadJson: toJsonInput({ error: error instanceof Error ? error.message : "Unknown Slack notification failure" }),
    },
  }).catch(() => null);
}

export async function getLatestJoleneChiefBrief(userId?: string | null) {
  return prisma.agentRun.findFirst({
    where: {
      agentType: "JOLENE_CHIEF_OF_STAFF",
      status: "COMPLETED",
      ...(userId ? { userId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function approveJoleneDelegatedWork(input: {
  userId: string;
  runId: string;
  proposalIds: string[];
}) {
  const run = await prisma.agentRun.findFirst({
    where: { id: input.runId, userId: input.userId, agentType: "JOLENE_CHIEF_OF_STAFF", status: "COMPLETED" },
  });
  if (!run) throw new Error("Jolene Chief of Staff run not found.");

  const output = parseChiefOutput(run.outputJson);
  const requested = new Set(input.proposalIds);
  const selected = output.delegatedWork.filter((work) => requested.has(work.id));
  if (!selected.length) throw new Error("No matching delegated work proposal was found.");

  const executed: JoleneDelegatedWork[] = [];
  for (const work of selected) {
    try {
      const result = await executeJoleneDelegatedWork(work, input.userId, run.id);
      executed.push({ ...work, status: result.status, childRunId: result.childRunId, detail: result.detail, href: result.href ?? work.href });
    } catch (error) {
      executed.push({
        ...work,
        status: "failed",
        error: error instanceof Error ? error.message : "Delegated action failed.",
      });
    }
  }

  const executedById = new Map(executed.map((work) => [work.id, work]));
  const nextOutput: JoleneChiefOutput = {
    ...output,
    delegatedWork: output.delegatedWork.map((work) => executedById.get(work.id) ?? work),
    approvalRequests: output.approvalRequests.filter((request) => !requested.has(request.proposalId)),
  };

  await prisma.$transaction([
    prisma.agentRun.update({
      where: { id: run.id },
      data: { outputJson: toJsonInput(nextOutput) },
    }),
    prisma.agentRunEvent.create({
      data: {
        agentRunId: run.id,
        type: "delegated_work_approved",
        message: `Approved ${executed.length} Jolene delegated action${executed.length === 1 ? "" : "s"}.`,
        payloadJson: toJsonInput({ proposalIds: input.proposalIds, executed }),
      },
    }),
  ]);

  return {
    runId: run.id,
    executed,
    message: `Jolene executed ${executed.filter((work) => work.status === "executed").length} delegated action${executed.length === 1 ? "" : "s"}.`,
  };
}

export async function buildJoleneChiefContext(userId: string, source: NonNullable<JoleneChiefInput["source"]>): Promise<JoleneChiefContext> {
  const [
    openRequests,
    recentRuns,
    latestSearchRun,
    applicationCounts,
    needsReviewCount,
    readyApplicationCount,
    latestMarketRun,
    latestLinkedInDraft,
    linkedInAnalytics,
    emailOps,
    careerStandup,
  ] = await Promise.all([
    prisma.agentUserRequest.findMany({
      where: { userId, status: "OPEN" },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    prisma.agentRun.findMany({
      where: { userId, agentType: { not: "JOLENE_CHIEF_OF_STAFF" } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.jobSearchRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.application.groupBy({ by: ["status"], where: { userId }, _count: { status: true } }),
    prisma.jobProfileMatch.count({ where: { status: "needs_review", jobSearchProfile: { userId } } }),
    prisma.application.count({ where: { userId, status: "ready_to_apply", resumeId: { not: null }, coverLetterId: { not: null } } }),
    prisma.agentRun.findFirst({ where: { userId, agentType: "MARKET_INTELLIGENCE", status: "COMPLETED" }, orderBy: { createdAt: "desc" } }),
    prisma.linkedInPostDraft.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" }, select: { id: true, status: true, title: true, updatedAt: true } }),
    getLinkedInAnalyticsSummary(userId, "30d").catch(() => null),
    getLatestEmailOpsSummary(userId).catch(() => null),
    buildCareerStandup(userId, { persist: false }).catch(() => null),
  ]);

  return {
    now: new Date(),
    source,
    openRequests: openRequests.map((request) => ({
      id: request.id,
      type: request.type,
      summary: request.question,
      href: agentUserRequestHref(request),
    })),
    recentRuns: recentRuns.map((run) => ({
      id: run.id,
      agentType: run.agentType,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      error: run.error,
      parentRunId: run.parentRunId,
    })),
    latestSearchRun: latestSearchRun
      ? {
          id: latestSearchRun.id,
          status: latestSearchRun.status,
          startedAt: latestSearchRun.startedAt,
          jobsFetched: latestSearchRun.jobsFetched,
          jobsAfterDedupe: latestSearchRun.jobsAfterDedupe,
          jobsAfterFilters: latestSearchRun.jobsAfterFilters,
          jobsSaved: latestSearchRun.jobsSaved,
          progress: latestSearchRun.progress,
          errors: latestSearchRun.errors,
        }
      : null,
    applicationCounts: Object.fromEntries(applicationCounts.map((count) => [count.status, count._count.status])),
    needsReviewCount,
    readyApplicationCount,
    latestMarketRun,
    latestLinkedInDraft,
    linkedInAnalytics: linkedInAnalytics
      ? {
          posts: linkedInAnalytics.topPosts.length,
          impressions: linkedInAnalytics.kpis.impressions,
          engagementRate: linkedInAnalytics.kpis.engagementRate,
        }
      : null,
    emailOps: emailOps
      ? {
          runId: emailOps.latestRun?.id ?? null,
          createdAt: emailOps.latestRun?.createdAt ?? null,
          summary: emailOps.summary,
          pendingFindings: emailOps.findings.filter((finding) => finding.status === "NEEDS_APPROVAL").length,
          calendarDrafts: emailOps.pendingCalendarProposals.length,
        }
      : null,
    careerStandup,
  };
}

export function buildJoleneChiefBrief(context: JoleneChiefContext): JoleneChiefOutput {
  const delegated = new Map<JoleneDelegatedActionId, JoleneDelegatedWork>();
  const priorities: JoleneChiefPriority[] = [];
  const blockers: string[] = [];
  const risks: string[] = [];
  const evidence: string[] = [];
  const failedRuns = context.recentRuns.filter((run) => run.status === "FAILED").slice(0, 5);
  const staleRunningRuns = context.recentRuns.filter((run) => run.status === "RUNNING" && context.now.getTime() - run.updatedAt.getTime() > 60 * 60 * 1000).slice(0, 5);
  const latestMarketAgeDays = context.latestMarketRun ? (context.now.getTime() - context.latestMarketRun.createdAt.getTime()) / 86_400_000 : Infinity;
  const latestSearchAgeDays = context.latestSearchRun ? (context.now.getTime() - context.latestSearchRun.startedAt.getTime()) / 86_400_000 : Infinity;
  const latestEmailOpsAgeDays = context.emailOps?.createdAt ? (context.now.getTime() - context.emailOps.createdAt.getTime()) / 86_400_000 : Infinity;
  const latestSearchAnalytics = context.latestSearchRun ? buildSearchRunAnalytics(context.latestSearchRun) : null;
  const scored = latestSearchAnalytics ? latestSearchAnalytics.stats.jobsScored ?? latestSearchAnalytics.stats.detailCandidates ?? latestSearchAnalytics.stats.jobsFetched : 0;
  const qualifiedYield = latestSearchAnalytics && scored ? Math.round((latestSearchAnalytics.stats.jobsAfterFilters / scored) * 1000) / 10 : 0;
  const weakQualifiedYield = Boolean(latestSearchAnalytics && latestSearchAnalytics.stats.jobsFetched >= 100 && qualifiedYield < 3);

  evidence.push(`${context.openRequests.length} open agent blocker(s).`);
  evidence.push(`${context.readyApplicationCount} ready application(s), ${context.needsReviewCount} job(s) need review.`);
  evidence.push(`${context.recentRuns.length} recent agent run(s) reviewed.`);
  if (latestSearchAnalytics) evidence.push(`Latest search Qualified yield ${qualifiedYield}% with ${latestSearchAnalytics.topBlocker?.label ?? "no dominant blocker"}.`);
  if (context.linkedInAnalytics) evidence.push(`${context.linkedInAnalytics.posts} LinkedIn post analytics snapshot(s), ${context.linkedInAnalytics.impressions} impression(s).`);
  if (context.emailOps?.summary) evidence.push(`Email Ops: ${context.emailOps.summary.findingsCreated} finding(s), ${context.emailOps.pendingFindings} pending approval(s), ${context.emailOps.calendarDrafts} calendar draft(s).`);
  if (context.careerStandup) evidence.push(`Sprint score ${context.careerStandup.sprintScore}/100, attention debt ${context.careerStandup.attentionDebt}.`);

  if (context.openRequests.length) {
    blockers.push(`${context.openRequests.length} open user approval or clarification request(s).`);
    priorities.push(priority({
      id: "resolve-agent-blockers",
      priority: 1,
      title: "Clear agent blockers",
      detail: "Jolene found open requests that are preventing agents from finishing or safely continuing work.",
      href: "/needs-me",
      category: "blocker",
      rationale: "Blocked agents reduce the value of running more automation.",
      evidence: context.openRequests.slice(0, 3).map((request) => `${request.type}: ${request.summary}`),
    }));
  }

  if (failedRuns.length || staleRunningRuns.length) {
    risks.push(`${failedRuns.length} failed and ${staleRunningRuns.length} stale running agent run(s) need review.`);
    priorities.push(priority({
      id: "review-agent-health",
      priority: 2,
      title: "Review agent health",
      detail: "Recent agent failures or stale running workflows may need retry, repair, or cancellation before more work is delegated.",
      href: "/agents",
      category: "agent_health",
      rationale: "Jolene should not compound hidden workflow failures.",
      evidence: [...failedRuns, ...staleRunningRuns].slice(0, 4).map((run) => `${run.agentType} ${run.status.toLowerCase()} ${run.error ? `- ${run.error}` : ""}`),
    }));
  }

  if (context.emailOps?.pendingFindings || context.emailOps?.calendarDrafts) {
    blockers.push(`${context.emailOps.pendingFindings} Email Ops finding(s) and ${context.emailOps.calendarDrafts} calendar draft(s) need review.`);
    priorities.push(priority({
      id: "review-email-ops",
      priority: 2,
      title: "Review inbox-driven job updates",
      detail: "Jolene's Email Operations team found updates that need approval before stage changes, replies, or calendar writes.",
      href: "/dashboard/email-ops",
      category: "email",
      rationale: "Inbox updates can change application state quickly, but external actions stay gated.",
      evidence: [
        `${context.emailOps.pendingFindings} approval-needed finding(s).`,
        `${context.emailOps.calendarDrafts} in-app calendar draft(s).`,
      ],
    }));
  } else if (latestEmailOpsAgeDays > 1) {
    addDelegated(delegated, "run_email_ops", "Run Email Operations", "Scan recent job-search email with Jolene's specialist email team.", "/dashboard/email-ops");
    priorities.push(priority({
      id: "run-email-ops",
      priority: 4,
      title: "Scan recent job-response email",
      detail: "Jolene can delegate a specialist email sweep for rejections, confirmations, interviews, assessments, and next steps.",
      href: "/dashboard/email-ops",
      category: "email",
      rationale: "Recent inbox updates should update the operating system without requiring manual babysitting.",
      evidence: [context.emailOps?.createdAt ? `Latest Email Ops run ${context.emailOps.createdAt.toLocaleString()}.` : "No completed Email Ops run found."],
      delegatedActionId: "run_email_ops",
    }));
  }

  if (context.readyApplicationCount > 0) {
    priorities.push(priority({
      id: "work-ready-applications",
      priority: 3,
      title: `Submit ${Math.min(context.readyApplicationCount, 5)} ready application${context.readyApplicationCount === 1 ? "" : "s"}`,
      detail: "Materials are ready. Jolene can guide the sprint, but final submission stays manual.",
      href: "/applications/assistant",
      category: "pipeline",
      rationale: "Ready applications are the most direct path from prepared work to external progress.",
      evidence: [`${context.readyApplicationCount} application(s) have required materials attached.`],
    }));
  } else if (context.needsReviewCount > 0) {
    addDelegated(delegated, "run_daily_command_center", "Refresh Daily Command Center", "Regenerate the tactical daily plan from current queue state.", "/dashboard");
    priorities.push(priority({
      id: "review-high-fit-jobs",
      priority: 3,
      title: `Review ${Math.min(context.needsReviewCount, 10)} job exception${context.needsReviewCount === 1 ? "" : "s"}`,
      detail: "Jolene found jobs waiting for judgment before agents can prepare downstream work.",
      href: "/jobs",
      category: "pipeline",
      rationale: "Review decisions unlock packet preparation and Apply Sprint flow.",
      evidence: [`${context.needsReviewCount} job profile match(es) are still in needs_review.`],
      delegatedActionId: "run_daily_command_center",
    }));
  }

  if (latestSearchAgeDays > 1 && context.needsReviewCount < 10) {
    addDelegated(delegated, "run_job_search", "Run job search", "Start or reuse a fresh internal job-search run.", "/dashboard/search");
    priorities.push(priority({
      id: "refresh-job-discovery",
      priority: 4,
      title: "Refresh job discovery",
      detail: "Search is stale or the review queue is light.",
      href: "/dashboard/search",
      category: "pipeline",
      rationale: "Jolene should keep the top of funnel fed before the queue dries up.",
      evidence: [context.latestSearchRun ? `Latest search started ${context.latestSearchRun.startedAt.toLocaleString()}.` : "No job search run is recorded."],
      delegatedActionId: "run_job_search",
    }));
  }

  if (weakQualifiedYield) {
    addDelegated(delegated, "run_recruiting_search_optimization", "Run Recruiting Search Team", "Have Jolene orchestrate the recruiting search optimization team to improve Qualified yield.", "/profiles");
    priorities.push(priority({
      id: "improve-qualified-yield",
      priority: 4,
      title: "Improve search qualification yield",
      detail: "The latest search brought in broad volume but too little qualified signal. Jolene can delegate the recruiting search team to tune profiles safely.",
      href: "/profiles",
      category: "pipeline",
      rationale: "Better profile precision improves the top of funnel before more Apply Sprint work is created.",
      evidence: [
        `${latestSearchAnalytics?.stats.jobsAfterFilters ?? 0} qualified from ${scored} scored job(s).`,
        `Top blocker: ${latestSearchAnalytics?.topBlocker?.label ?? "none recorded"}.`,
      ],
      delegatedActionId: "run_recruiting_search_optimization",
    }));
  }

  if (latestMarketAgeDays > 3) {
    addDelegated(delegated, "run_market_intelligence", "Refresh Market Intelligence", "Generate an updated review-only market brief.", "/dashboard/market");
    priorities.push(priority({
      id: "refresh-market-brief",
      priority: 5,
      title: "Refresh market brief",
      detail: "Market intelligence is missing or older than the current operating window.",
      href: "/dashboard/market",
      category: "market",
      rationale: "Search and content decisions should reflect current aggregate signals.",
      evidence: [context.latestMarketRun ? `Latest market brief ${context.latestMarketRun.createdAt.toLocaleString()}.` : "No completed market intelligence run found."],
      delegatedActionId: "run_market_intelligence",
    }));
  }

  if (!context.latestLinkedInDraft || context.latestLinkedInDraft.status === "PUBLISHED") {
    addDelegated(delegated, "generate_linkedin_content", "Draft LinkedIn content", "Ask the agent content team to create a review-only draft from current app memory.", "/linkedin-content");
    priorities.push(priority({
      id: "draft-public-build-note",
      priority: 6,
      title: "Draft a public build note",
      detail: "Jolene can delegate a LinkedIn draft grounded in current app work and aggregate analytics.",
      href: "/linkedin-content",
      category: "content",
      rationale: "Recent operational progress can become public learning only after review and privacy gates.",
      evidence: context.linkedInAnalytics ? [`${context.linkedInAnalytics.posts} post analytics snapshot(s) available.`] : ["No current unpublished LinkedIn draft was found."],
      delegatedActionId: "generate_linkedin_content",
    }));
  }

  if (context.careerStandup?.proactivePromptReason) {
    risks.push(context.careerStandup.proactivePromptReason);
    priorities.push(priority({
      id: "handle-standup-delta",
      priority: 7,
      title: "Handle Jolene standup delta",
      detail: context.careerStandup.proactivePromptReason,
      href: "/dashboard",
      category: "standup",
      rationale: "Career CEO/standup signals now fold into Jolene's Chief of Staff brief.",
      evidence: [`Sprint score ${context.careerStandup.sprintScore}/100`, `Income momentum ${context.careerStandup.incomeMomentum}`],
    }));
  }

  if (!delegated.has("check_duplicates") && context.needsReviewCount > 20) {
    addDelegated(delegated, "check_duplicates", "Check duplicates", "Run duplicate/stale detection before reviewing a large exception queue.", "/jobs");
  }

  const delegatedWork = Array.from(delegated.values());
  const sortedPriorities = priorities.sort((left, right) => left.priority - right.priority).slice(0, 6);
  const approvalRequests = delegatedWork.map((work) => ({
    proposalId: work.id,
    label: work.label,
    reason: `${work.label} is app-internal, but Jolene asks approval before delegated work.`,
  }));

  const summary = sortedPriorities[0]
    ? `${sortedPriorities[0].title}. Jolene reviewed ${context.recentRuns.length} recent agent run(s), ${context.openRequests.length} blocker(s), pipeline state, LinkedIn signals, market state, and the career standup.`
    : "Jolene found no urgent intervention. Keep the system moving with a fresh search, outcome update, or content review.";

  return {
    generatedAt: context.now.toISOString(),
    title: "Jolene, Chief of Staff",
    summary,
    priorities: sortedPriorities,
    delegatedWork,
    blockers,
    risks,
    approvalRequests,
    evidence,
    careerStandup: context.careerStandup
      ? {
          sprintScore: context.careerStandup.sprintScore,
          incomeMomentum: context.careerStandup.incomeMomentum,
          attentionDebt: context.careerStandup.attentionDebt,
          proactivePromptReason: context.careerStandup.proactivePromptReason,
        }
      : null,
    confidence: confidenceFor(context, sortedPriorities),
    rationale: "Jolene ranks blocked or failing work first, then manual pipeline leverage, discovery freshness, market freshness, and content opportunities. Delegated work remains approval-gated.",
  };
}

function priority(input: Omit<JoleneChiefPriority, "approvalRequired">): JoleneChiefPriority {
  return { ...input, approvalRequired: Boolean(input.delegatedActionId) };
}

function addDelegated(
  map: Map<JoleneDelegatedActionId, JoleneDelegatedWork>,
  actionId: JoleneDelegatedActionId,
  label: string,
  detail: string,
  href: string,
) {
  if (map.has(actionId)) return;
  map.set(actionId, {
    id: `proposal_${actionId}`,
    actionId,
    label,
    detail,
    href,
    risk: "approval_required",
    status: "proposed",
  });
}

export async function executeJoleneDelegatedWork(work: JoleneDelegatedWork, userId: string, parentRunId: string): Promise<{ status: "executed" | "skipped"; detail: string; href?: string; childRunId?: string }> {
  if (work.actionId === "run_daily_command_center") {
    const result = await runDailyCommandCenterAgent({ userId, parentRunId });
    return { status: "executed", detail: `Created ${result.output.actions.length} daily priority action(s).`, href: "/dashboard", childRunId: result.run.id };
  }
  if (work.actionId === "run_market_intelligence") {
    const result = await runMarketIntelligenceAgent({ userId, parentRunId, source: "jolene", triggeredBy: "jolene" });
    return { status: "executed", detail: `Generated ${result.output.marketTemperature.length} market lane signal(s).`, href: "/dashboard/market", childRunId: result.run.id };
  }
  if (work.actionId === "check_duplicates") {
    const result = await runDuplicateStaleJobDetectorAgent({ userId, parentRunId, limit: 2000 });
    return { status: "executed", detail: `Analyzed ${result.output.analyzedJobs} jobs and updated ${result.output.updatedJobs} duplicate/stale record(s).`, href: "/jobs", childRunId: result.run.id };
  }
  if (work.actionId === "generate_linkedin_content") {
    const result = await runLinkedInContentAgent({ userId, parentRunId, contentPillar: "app_progress" });
    return { status: "executed", detail: `Created LinkedIn draft ${result.output.draftId ?? result.run.id} for review.`, href: "/linkedin-content", childRunId: result.run.id };
  }
  if (work.actionId === "run_email_ops") {
    const result = await runJoleneEmailOperationsAgent({ userId, parentRunId, source: "jolene" });
    return { status: "executed", detail: `Email Ops reviewed ${result.output.scanned} message(s), created ${result.output.findingsCreated} finding(s), and drafted ${result.output.calendarDrafts} calendar item(s).`, href: "/dashboard/email-ops", childRunId: result.run.id };
  }
  if (work.actionId === "run_recruiting_search_optimization") {
    const result = await runRecruitingSearchOptimization({ userId, parentRunId, mode: "active" });
    return { status: "executed", detail: `Recruiting Search Team prepared ${result.output.changes.length} profile change(s), ${result.output.changes.filter((change) => change.status === "APPLIED").length} applied.`, href: "/profiles", childRunId: result.run.id };
  }
  if (work.actionId === "run_job_search") {
    const result = await startJobSearchRun("manual");
    return { status: result.skipped ? "skipped" : "executed", detail: result.skipped ? `Search already running: ${result.reason ?? "active run"}.` : `Started job search run ${result.run.id}.`, href: "/dashboard/search" };
  }
  throw new Error("Unsupported Jolene delegated action.");
}

function parseChiefOutput(value: unknown): JoleneChiefOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Jolene run has no Chief of Staff output.");
  const output = value as JoleneChiefOutput;
  if (!Array.isArray(output.delegatedWork)) throw new Error("Jolene run has no delegated work proposals.");
  return output;
}

function confidenceFor(context: JoleneChiefContext, priorities: JoleneChiefPriority[]): JoleneChiefOutput["confidence"] {
  if (context.recentRuns.length >= 5 && context.careerStandup && priorities.length >= 3) return "high";
  if (context.recentRuns.length || context.careerStandup || priorities.length) return "medium";
  return "low";
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
