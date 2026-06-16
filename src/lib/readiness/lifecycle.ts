import type { Prisma, ReadinessOverride, ReadinessOverrideStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type LifecycleReadinessStage =
  | "setup"
  | "search"
  | "review"
  | "packet"
  | "apply"
  | "follow_up"
  | "interview"
  | "outcome"
  | "trust"
  | "health";

export type ReadinessItemStatus = "ready" | "needs_work" | "blocked" | "snoozed" | "dismissed";

export type LifecycleReadinessItem = {
  key: string;
  stage: LifecycleReadinessStage;
  label: string;
  href: string;
  status: ReadinessItemStatus;
  systemStatus: Exclude<ReadinessItemStatus, "snoozed" | "dismissed">;
  count: number;
  detail: string;
  nextAction: string;
  priority: number;
  isCritical: boolean;
  overrideStatus: ReadinessOverrideStatus | null;
  snoozedUntil: string | null;
};

export type LifecycleReadinessStageSummary = {
  stage: LifecycleReadinessStage;
  label: string;
  status: ReadinessItemStatus;
  readyCount: number;
  totalCount: number;
  href: string;
};

export type LifecycleReadiness = {
  generatedAt: string;
  userId: string;
  readyCount: number;
  totalCount: number;
  nextAction: LifecycleReadinessItem | null;
  items: LifecycleReadinessItem[];
  priorityItems: LifecycleReadinessItem[];
  stages: LifecycleReadinessStageSummary[];
  valueProof: Array<{ key: string; label: string; value: number; detail: string }>;
  activeQueues: Array<{ key: string; label: string; value: number; href: string; status: "clear" | "active" | "blocked" }>;
};

export type ApplyReadinessOverrideInput = {
  userId: string;
  key: string;
  action: "complete" | "dismiss" | "snooze" | "reset";
  snoozedUntil?: Date | string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
};

type BaseReadinessItem = Omit<LifecycleReadinessItem, "status" | "overrideStatus" | "snoozedUntil">;

const STAGE_LABELS: Record<LifecycleReadinessStage, string> = {
  setup: "Setup",
  search: "Search",
  review: "Review",
  packet: "Packet",
  apply: "Apply",
  follow_up: "Follow-up",
  interview: "Interview",
  outcome: "Outcome",
  trust: "Trust",
  health: "Health",
};

const STAGE_ORDER: LifecycleReadinessStage[] = [
  "setup",
  "search",
  "review",
  "packet",
  "apply",
  "follow_up",
  "interview",
  "outcome",
  "trust",
  "health",
];

export async function buildLifecycleReadiness({ userId }: { userId: string }): Promise<LifecycleReadiness> {
  const generatedAt = new Date();
  const staleCutoff = new Date(generatedAt.getTime() - 60 * 60 * 1000);
  const [
    candidateProfileCount,
    evidenceReadyCount,
    evidenceReviewCount,
    latestRun,
    needsReviewCount,
    generatedMaterialCount,
    readyApplicationCount,
    followUpDueCount,
    openInterviewTaskCount,
    outcomeCount,
    unsupportedClaimCount,
    staleAgentRunCount,
    staleSearchRunCount,
    suppressedJobCount,
    preparedPacketCount,
    resolvedBlockerCount,
    answerMemoryCount,
    overrides,
  ] = await Promise.all([
    prisma.userProfile.count({ where: { userId } }),
    prisma.candidateEvidence.count({ where: { candidateProfile: { userId }, confidence: "VERIFIED" } }),
    prisma.candidateEvidence.count({ where: { candidateProfile: { userId }, confidence: "NEEDS_REVIEW" } }),
    prisma.jobSearchRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.jobProfileMatch.count({
      where: {
        status: "needs_review",
        jobSearchProfile: { userId },
        jobPosting: { applications: { none: { userId, status: { in: ["applied", "screening", "interviewing", "offer", "rejected_by_company", "archived"] } } } },
      },
    }),
    Promise.all([
      prisma.generatedResume.count({ where: { userId } }),
      prisma.generatedCoverLetter.count({ where: { userId } }),
      prisma.applicationPacket.count({ where: { userId } }),
    ]).then(([resumes, coverLetters, packets]) => resumes + coverLetters + packets),
    prisma.application.count({ where: { userId, status: "ready_to_apply", resumeId: { not: null }, coverLetterId: { not: null } } }),
    prisma.application.count({ where: { userId, status: "follow_up_due" } }),
    prisma.interviewPrepTask.count({ where: { userId, status: "OPEN" } }),
    prisma.applicationOutcome.count({ where: { userId } }),
    prisma.materialClaim.count({ where: { userId, status: "UNSUPPORTED" } }),
    prisma.agentRun.count({ where: { userId, status: { in: ["PENDING", "RUNNING"] }, createdAt: { lt: staleCutoff } } }),
    prisma.jobSearchRun.count({ where: { status: "running", startedAt: { lt: staleCutoff } } }),
    prisma.jobSuppression.count({ where: { userId } }),
    prisma.applicationPacket.count({ where: { userId, status: { in: ["APPROVED", "SUBMITTED"] } } }),
    prisma.agentUserRequest.count({ where: { userId, status: { in: ["ANSWERED", "RESOLVED"] } } }),
    prisma.applicationAnswerMemory.count({ where: { userId } }),
    prisma.readinessOverride.findMany({ where: { userId } }),
  ]);

  const healthBlockerCount = staleAgentRunCount + staleSearchRunCount;
  const baseItems: BaseReadinessItem[] = [
    {
      key: "setup.profile",
      stage: "setup",
      label: "Candidate profile",
      href: "/resumes/profile",
      systemStatus: candidateProfileCount > 0 ? "ready" : "needs_work",
      count: candidateProfileCount,
      detail: candidateProfileCount > 0 ? "Candidate profile is available for agent context." : "Create or approve the candidate profile before relying on agents.",
      nextAction: "Open profile",
      priority: 10,
      isCritical: false,
    },
    {
      key: "setup.evidence",
      stage: "setup",
      label: "Evidence base",
      href: "/evidence",
      systemStatus: evidenceReadyCount > 0 && evidenceReviewCount === 0 ? "ready" : "needs_work",
      count: evidenceReadyCount,
      detail: evidenceReadyCount > 0
        ? `${evidenceReadyCount} verified evidence item(s); ${evidenceReviewCount} need review.`
        : "Verify at least one evidence item so generated materials can stay grounded.",
      nextAction: "Review evidence",
      priority: evidenceReviewCount > 0 ? 20 : 11,
      isCritical: false,
    },
    {
      key: "search.latest_run",
      stage: "search",
      label: "Search run",
      href: "/dashboard/search",
      systemStatus: latestRun ? "ready" : "needs_work",
      count: latestRun?.jobsSaved ?? 0,
      detail: latestRun ? `${latestRun.status} run saved ${latestRun.jobsSaved} job(s).` : "Run discovery to populate the queue.",
      nextAction: "Open search ops",
      priority: 30,
      isCritical: false,
    },
    {
      key: "review.exceptions",
      stage: "review",
      label: "Job review exceptions",
      href: "/jobs",
      systemStatus: needsReviewCount > 0 ? "needs_work" : "ready",
      count: needsReviewCount,
      detail: needsReviewCount > 0 ? "Approve or reject visible exceptions before the loop can learn cleanly." : "No visible review exceptions.",
      nextAction: "Review jobs",
      priority: 40,
      isCritical: false,
    },
    {
      key: "packet.materials",
      stage: "packet",
      label: "Application materials",
      href: "/resumes/generated",
      systemStatus: generatedMaterialCount > 0 ? "ready" : "needs_work",
      count: generatedMaterialCount,
      detail: `${generatedMaterialCount} generated resume, cover-letter, or packet artifact(s) are available.`,
      nextAction: "Open materials",
      priority: 50,
      isCritical: false,
    },
    {
      key: "apply.ready",
      stage: "apply",
      label: "Ready applications",
      href: "/applications/assistant",
      systemStatus: readyApplicationCount > 0 ? "needs_work" : "ready",
      count: readyApplicationCount,
      detail: readyApplicationCount > 0 ? "Prepared applications are waiting for manual submit." : "No ready applications waiting.",
      nextAction: "Open Apply Sprint",
      priority: 60,
      isCritical: false,
    },
    {
      key: "follow_up.due",
      stage: "follow_up",
      label: "Follow-ups due",
      href: "/applications",
      systemStatus: followUpDueCount > 0 ? "needs_work" : "ready",
      count: followUpDueCount,
      detail: followUpDueCount > 0 ? "Follow-up items need review before they age out." : "No follow-ups due.",
      nextAction: "Open applications",
      priority: 70,
      isCritical: false,
    },
    {
      key: "interview.prep",
      stage: "interview",
      label: "Interview prep",
      href: "/applications",
      systemStatus: openInterviewTaskCount > 0 ? "needs_work" : "ready",
      count: openInterviewTaskCount,
      detail: `${openInterviewTaskCount} open interview prep task(s).`,
      nextAction: "Review prep tasks",
      priority: 80,
      isCritical: false,
    },
    {
      key: "outcome.signals",
      stage: "outcome",
      label: "Outcome learning",
      href: "/outcomes",
      systemStatus: outcomeCount > 0 ? "ready" : "needs_work",
      count: outcomeCount,
      detail: `${outcomeCount} outcome signal(s) recorded for calibration.`,
      nextAction: "Open outcomes",
      priority: 90,
      isCritical: false,
    },
    {
      key: "trust.unsupported_claims",
      stage: "trust",
      label: "Unsupported claims",
      href: "/resumes/generated",
      systemStatus: unsupportedClaimCount > 0 ? "blocked" : "ready",
      count: unsupportedClaimCount,
      detail: unsupportedClaimCount > 0 ? "Unsupported generated claims block approval and publishing gates." : "No unsupported generated claims.",
      nextAction: "Resolve claims",
      priority: 5,
      isCritical: true,
    },
    {
      key: "health.system",
      stage: "health",
      label: "System health",
      href: "/api/system/health",
      systemStatus: healthBlockerCount > 0 ? "blocked" : "ready",
      count: healthBlockerCount,
      detail: healthBlockerCount > 0 ? "Stale running work needs inspection before the loop is trusted." : "No stale running work detected.",
      nextAction: "Check health",
      priority: 6,
      isCritical: true,
    },
  ];

  const overrideByKey = new Map(overrides.map((override) => [override.key, override]));
  const items = baseItems.map((item) => applyOverride(item, overrideByKey.get(item.key), generatedAt));
  const actionableItems = items.filter((item) => item.status === "needs_work" || item.status === "blocked");
  const stages = buildStageSummaries(items);

  return {
    generatedAt: generatedAt.toISOString(),
    userId,
    readyCount: items.filter((item) => item.status === "ready" || item.status === "dismissed").length,
    totalCount: items.length,
    nextAction: actionableItems.sort((a, b) => a.priority - b.priority)[0] ?? null,
    items,
    priorityItems: actionableItems.sort((a, b) => a.priority - b.priority).slice(0, 6),
    stages,
    valueProof: [
      { key: "suppressed_jobs", label: "Jobs suppressed", value: suppressedJobCount, detail: "Rejected, submitted, or archived jobs kept out of the loop." },
      { key: "packets_prepared", label: "Packets prepared", value: preparedPacketCount, detail: "Approved or submitted packets ready for review history." },
      { key: "blockers_resolved", label: "Blockers resolved", value: resolvedBlockerCount, detail: "Needs Me requests answered or resolved." },
      { key: "answers_reused", label: "Answers reused", value: answerMemoryCount, detail: "Reusable application answers stored for future packets." },
      { key: "outcomes_learned", label: "Outcomes learned", value: outcomeCount, detail: "Recorded outcomes feeding calibration." },
    ],
    activeQueues: [
      { key: "review", label: "Review", value: needsReviewCount, href: "/jobs", status: needsReviewCount > 0 ? "active" : "clear" },
      { key: "apply", label: "Apply Sprint", value: readyApplicationCount, href: "/applications/assistant", status: readyApplicationCount > 0 ? "active" : "clear" },
      { key: "follow_up", label: "Follow-up", value: followUpDueCount, href: "/applications", status: followUpDueCount > 0 ? "active" : "clear" },
      { key: "interview", label: "Interview", value: openInterviewTaskCount, href: "/applications", status: openInterviewTaskCount > 0 ? "active" : "clear" },
      { key: "trust", label: "Trust blockers", value: unsupportedClaimCount, href: "/resumes/generated", status: unsupportedClaimCount > 0 ? "blocked" : "clear" },
      { key: "health", label: "System health", value: healthBlockerCount, href: "/api/system/health", status: healthBlockerCount > 0 ? "blocked" : "clear" },
    ],
  };
}

export async function applyReadinessOverride(input: ApplyReadinessOverrideInput): Promise<ReadinessOverride | null> {
  if (input.action === "reset") {
    await prisma.readinessOverride.deleteMany({ where: { userId: input.userId, key: input.key } });
    return null;
  }

  const status = statusForAction(input.action);
  const now = new Date();
  const snoozedUntil = input.action === "snooze"
    ? input.snoozedUntil
      ? new Date(input.snoozedUntil)
      : new Date(now.getTime() + 24 * 60 * 60 * 1000)
    : null;

  return prisma.readinessOverride.upsert({
    where: { userId_key: { userId: input.userId, key: input.key } },
    create: {
      userId: input.userId,
      key: input.key,
      status,
      snoozedUntil,
      completedAt: input.action === "complete" ? now : null,
      dismissedAt: input.action === "dismiss" ? now : null,
      note: input.note ?? null,
      metadataJson: (input.metadata ?? {}) as Prisma.InputJsonObject,
    },
    update: {
      status,
      snoozedUntil,
      completedAt: input.action === "complete" ? now : null,
      dismissedAt: input.action === "dismiss" ? now : null,
      note: input.note ?? null,
      metadataJson: (input.metadata ?? {}) as Prisma.InputJsonObject,
    },
  });
}

function statusForAction(action: Exclude<ApplyReadinessOverrideInput["action"], "reset">): ReadinessOverrideStatus {
  if (action === "complete") return "MANUAL_READY";
  if (action === "dismiss") return "DISMISSED";
  return "SNOOZED";
}

function applyOverride(item: BaseReadinessItem, override: ReadinessOverride | undefined, now: Date): LifecycleReadinessItem {
  if (!override || item.isCritical) {
    return { ...item, status: item.systemStatus, overrideStatus: override?.status ?? null, snoozedUntil: override?.snoozedUntil?.toISOString() ?? null };
  }

  if (override.status === "MANUAL_READY") {
    return { ...item, status: "ready", overrideStatus: override.status, snoozedUntil: null };
  }

  if (override.status === "DISMISSED") {
    return { ...item, status: "dismissed", overrideStatus: override.status, snoozedUntil: null };
  }

  if (override.status === "SNOOZED" && override.snoozedUntil && override.snoozedUntil > now) {
    return { ...item, status: "snoozed", overrideStatus: override.status, snoozedUntil: override.snoozedUntil.toISOString() };
  }

  return { ...item, status: item.systemStatus, overrideStatus: override.status, snoozedUntil: override.snoozedUntil?.toISOString() ?? null };
}

function buildStageSummaries(items: LifecycleReadinessItem[]): LifecycleReadinessStageSummary[] {
  return STAGE_ORDER.map((stage) => {
    const stageItems = items.filter((item) => item.stage === stage);
    const firstItem = stageItems[0];
    const hasBlocked = stageItems.some((item) => item.status === "blocked");
    const hasNeedsWork = stageItems.some((item) => item.status === "needs_work");
    const hasSnoozed = stageItems.some((item) => item.status === "snoozed");
    const hasDismissed = stageItems.some((item) => item.status === "dismissed");
    const status: ReadinessItemStatus = hasBlocked ? "blocked" : hasNeedsWork ? "needs_work" : hasSnoozed ? "snoozed" : hasDismissed ? "dismissed" : "ready";
    return {
      stage,
      label: STAGE_LABELS[stage],
      status,
      readyCount: stageItems.filter((item) => item.status === "ready" || item.status === "dismissed").length,
      totalCount: stageItems.length,
      href: firstItem?.href ?? "/dashboard",
    };
  }).filter((summary) => summary.totalCount > 0);
}
