import { JobMatchStatus, type AgentRun, type Prisma } from "@prisma/client";
import { applicationJobKeySet, hasApplicationForJob } from "@/lib/applications/job-filters";
import { uniqueMatchesByCanonicalJob } from "@/lib/job-search/unique-matches";
import { isJobSuppressed, loadJobSuppressionState } from "@/lib/jobs/suppression";
import { prisma } from "@/lib/prisma";
import { runSkill } from "@/lib/skills/run-skill";

export type RecruitingAgencyRunInput = {
  minimumScore?: number;
  limit?: number;
  triggeredBy?: "manual" | "cron";
};

export type RecruitingAgencyRunResult = {
  agentRunId: string;
  requested: {
    minimumScore: number;
    limit: number;
    triggeredBy: "manual" | "cron";
  };
  approved: number;
  prepared: number;
  failed: number;
  skipped: number;
  results: Array<{
    matchId: string;
    jobId: string;
    applicationId?: string;
    company: string;
    title: string;
    score: number;
    status: "ready_to_apply" | "approved" | "skipped" | "failed";
    error?: string;
  }>;
  message: string;
};

export async function runRecruitingAgency(input: RecruitingAgencyRunInput = {}): Promise<RecruitingAgencyRunResult> {
  const minimumScore = input.minimumScore ?? 90;
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  const triggeredBy = input.triggeredBy ?? "manual";
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) throw new Error("No user exists. Run seed first.");

  const agentRun = await prisma.agentRun.create({
    data: {
      userId: user.id,
      agentType: "RECRUITING_AGENCY",
      inputJson: toJsonValue({ minimumScore, limit, triggeredBy }),
      status: "RUNNING",
    },
  });
  const results: RecruitingAgencyRunResult["results"] = [];

  try {
    await createAgencyRunEvent(agentRun.id, "run_started", `Recruiting agency started with a ${minimumScore}+ score threshold.`, {
      minimumScore,
      limit,
      triggeredBy,
    });

    const candidates = await findAgencyCandidates({ userId: user.id, minimumScore, limit });
    await createAgencyRunEvent(agentRun.id, "candidates_found", `Found ${candidates.length} eligible agency candidate${candidates.length === 1 ? "" : "s"}.`, {
      count: candidates.length,
      requestedLimit: limit,
    });

    for (const candidate of candidates) {
    try {
      const candidatePayload = candidateEventPayload(candidate);
      await createAgencyRunEvent(agentRun.id, "candidate_evaluating", `Evaluating ${candidate.jobPosting.company} - ${candidate.jobPosting.title}.`, candidatePayload);
      await runSkill({
        skillId: "approve_agency_match",
        input: { userId: user.id, matchId: candidate.id, minimumScore },
        userId: user.id,
      });
      await createAgencyRunEvent(agentRun.id, "match_approved", `Approved ${candidate.jobPosting.company} - ${candidate.jobPosting.title} at ${candidate.overallScore}.`, candidatePayload);
      await createAgencyRunEvent(agentRun.id, "packet_started", `Preparing application packet for ${candidate.jobPosting.company}.`, candidatePayload);
      const prepared = await runSkill({
        skillId: "prepare_application_packet",
        input: { jobPostingId: candidate.jobPostingId, userId: user.id },
        userId: user.id,
      });
      const output = prepared.output as { application: { id: string } };
      results.push({
        matchId: candidate.id,
        jobId: candidate.jobPostingId,
        applicationId: output.application.id,
        company: candidate.jobPosting.company,
        title: candidate.jobPosting.title,
        score: candidate.overallScore,
        status: "ready_to_apply",
      });
      await createAgencyRunEvent(agentRun.id, "packet_ready", `Packet ready for ${candidate.jobPosting.company} - ${candidate.jobPosting.title}.`, {
        ...candidatePayload,
        applicationId: output.application.id,
      });
    } catch (error) {
      const application = await prisma.application.findFirst({
        where: { userId: user.id, jobPostingId: candidate.jobPostingId },
        select: { id: true },
      });
      const errorMessage = error instanceof Error ? error.message : "Unknown agency failure";
      results.push({
        matchId: candidate.id,
        jobId: candidate.jobPostingId,
        applicationId: application?.id,
        company: candidate.jobPosting.company,
        title: candidate.jobPosting.title,
        score: candidate.overallScore,
        status: "failed",
        error: errorMessage,
      });
      await createAgencyRunEvent(agentRun.id, "candidate_failed", `${candidate.jobPosting.company} - ${candidate.jobPosting.title} failed: ${errorMessage}`, {
        ...candidateEventPayload(candidate),
        applicationId: application?.id,
        error: errorMessage,
      });
    }
  }

  const prepared = results.filter((result) => result.status === "ready_to_apply").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const skipped = Math.max(0, limit - results.length);

  const output: RecruitingAgencyRunResult = {
    agentRunId: agentRun.id,
    requested: { minimumScore, limit, triggeredBy },
    approved: results.length,
    prepared,
    failed,
    skipped,
    results,
    message: `Recruiting agency prepared ${prepared} application package${prepared === 1 ? "" : "s"} from ${results.length} approved match${results.length === 1 ? "" : "es"}. ${failed} failed.`,
  };

    if (skipped > 0) {
      await createAgencyRunEvent(agentRun.id, "candidate_skipped", `${skipped} requested slot${skipped === 1 ? " was" : "s were"} skipped because no eligible untracked match was available.`, {
        skipped,
        requestedLimit: limit,
        processed: results.length,
      });
    }
    await createAgencyRunEvent(agentRun.id, "run_completed", output.message, {
      approved: output.approved,
      prepared: output.prepared,
      failed: output.failed,
      skipped: output.skipped,
    });
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: "COMPLETED",
        outputJson: toJsonValue(output),
      },
    });
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown agency failure";
    await createAgencyRunEvent(agentRun.id, "run_failed", `Recruiting agency failed: ${message}`, { error: message }).catch(() => null);
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: "FAILED",
        error: message,
      },
    }).catch(() => null);
    throw error;
  }
}

export async function getRecruitingAgencyRunStatus(input: { runId?: string | null } = {}) {
  const include = {
    events: {
      orderBy: { createdAt: "asc" as const },
      take: 100,
    },
  };
  const run = input.runId
    ? await prisma.agentRun.findFirst({
      where: { id: input.runId, agentType: "RECRUITING_AGENCY" },
      include,
    })
    : (await prisma.agentRun.findFirst({
      where: { agentType: "RECRUITING_AGENCY", status: { in: ["PENDING", "RUNNING"] } },
      include,
      orderBy: { createdAt: "desc" },
    })) ?? await prisma.agentRun.findFirst({
      where: { agentType: "RECRUITING_AGENCY" },
      include,
      orderBy: { createdAt: "desc" },
    });
  if (!run) return null;
  return serializeRecruitingAgencyRun(run);
}

function serializeRecruitingAgencyRun(run: AgentRun & { events: Array<{ id: string; type: string; message: string; payloadJson: Prisma.JsonValue; createdAt: Date }> }) {
  const events = run.events.map((event) => ({
    id: event.id,
    type: event.type,
    message: event.message,
    payload: event.payloadJson,
    createdAt: event.createdAt.toISOString(),
  }));
  const totals = agencyTotalsFromEvents(events);
  return {
    id: run.id,
    status: run.status,
    error: run.error,
    startedAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    totals,
    current: currentAgencyActivity(events),
    events,
  };
}

function agencyTotalsFromEvents(events: Array<{ type: string; payload: Prisma.JsonValue }>) {
  const candidatesFound = events.find((event) => event.type === "candidates_found")?.payload as { count?: number } | undefined;
  return {
    found: candidatesFound?.count ?? 0,
    processed: events.filter((event) => event.type === "packet_ready" || event.type === "candidate_failed").length,
    approved: events.filter((event) => event.type === "match_approved").length,
    prepared: events.filter((event) => event.type === "packet_ready").length,
    failed: events.filter((event) => event.type === "candidate_failed").length,
    skipped: events.reduce((total, event) => {
      if (event.type !== "candidate_skipped") return total;
      const payload = event.payload as { skipped?: number } | undefined;
      return total + (payload?.skipped ?? 1);
    }, 0),
  };
}

function currentAgencyActivity(events: Array<{ type: string; payload: Prisma.JsonValue; message: string }>) {
  const latest = [...events].reverse().find((event) => ["candidate_evaluating", "match_approved", "packet_started", "packet_ready", "candidate_failed", "run_completed", "run_failed"].includes(event.type));
  if (!latest) return null;
  return {
    type: latest.type,
    message: latest.message,
    payload: latest.payload,
  };
}

async function createAgencyRunEvent(agentRunId: string, type: string, message: string, payload: unknown = {}) {
  return prisma.agentRunEvent.create({
    data: {
      agentRunId,
      type,
      message,
      payloadJson: toJsonValue(payload),
    },
  });
}

function candidateEventPayload(candidate: Awaited<ReturnType<typeof findAgencyCandidates>>[number]) {
  return {
    matchId: candidate.id,
    jobId: candidate.jobPostingId,
    company: candidate.jobPosting.company,
    title: candidate.jobPosting.title,
    score: candidate.overallScore,
    profile: candidate.jobSearchProfile.name,
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

async function findAgencyCandidates({ userId, minimumScore, limit }: { userId: string; minimumScore: number; limit: number }) {
  const [applications, rawMatches, suppressionState] = await Promise.all([
    prisma.application.findMany({
      where: { userId },
      select: {
        status: true,
        jobPosting: {
          select: {
            company: true,
            title: true,
            location: true,
            lastSeenAt: true,
          },
        },
      },
    }),
    prisma.jobProfileMatch.findMany({
      where: {
        status: JobMatchStatus.needs_review,
        overallScore: { gte: minimumScore },
        jobPosting: {
          applicationUrl: { not: null },
        },
      },
      include: {
        jobPosting: true,
        jobSearchProfile: { select: { name: true } },
      },
      orderBy: [{ overallScore: "desc" }, { updatedAt: "desc" }],
      take: limit * 5,
    }),
    loadJobSuppressionState(userId),
  ]);
  const applicationKeys = applicationJobKeySet(applications);
  return uniqueMatchesByCanonicalJob(
    rawMatches.filter((match) => !hasApplicationForJob(match.jobPosting, applicationKeys) && !isJobSuppressed(match.jobPosting, suppressionState)),
  ).slice(0, limit);
}
