import type { AgentRunStatus, JobMatchStatus, Prisma } from "@prisma/client";
import { hasApplicationForJob, submittedApplicationStatuses } from "@/lib/applications/job-filters";
import { createApplicationCanonicalJobKeys } from "@/lib/applications/reconciliation";
import { isJobSuppressed, type JobSuppressionState } from "@/lib/jobs/suppression";

export type ApplySprintReasonCode =
  | "below_profile_threshold"
  | "existing_match_not_new"
  | "profile_max_results_cap"
  | "no_application_url"
  | "unsupported_application_url"
  | "duplicate_or_suppressed"
  | "already_has_application"
  | "agency_already_running"
  | "packet_generation_failed"
  | "missing_resume_or_cover_letter"
  | "hidden_by_canonical_duplicate_reconciliation";

export type ApplySprintFunnelSummary = {
  fetched: number;
  newAfterDedupe: number;
  matched: number;
  saved: number;
  eligibleForAgency: number;
  agencyPrepared: number;
  agencyFailedSkipped: number;
  visibleReady: number;
  belowProfileThreshold: number;
  suppressed: number;
  listingPagesSuppressed: number;
  agencyAlreadyRunning: boolean;
};

export type ApplySprintCandidate = {
  matchId: string;
  jobId: string;
  company: string;
  title: string;
  location: string | null;
  applicationUrl: string | null;
  profileName: string;
  score: number;
  updatedAt: string;
  reasons: ApplySprintReasonCode[];
  canPrepare: boolean;
};

export type ApplySprintHiddenItem = {
  id: string;
  kind: "match" | "application" | "summary";
  company: string;
  title: string;
  location: string | null;
  applicationUrl: string | null;
  profileName?: string | null;
  score?: number | null;
  status?: string | null;
  reasons: ApplySprintReasonCode[];
  detail: string;
};

export type ApplySprintAgencyResult = {
  matchId?: string | null;
  jobId?: string | null;
  applicationId?: string | null;
  company: string;
  title: string;
  score?: number | null;
  status: "ready_to_apply" | "approved" | "skipped" | "failed";
  error?: string | null;
  reason?: string | null;
};

export type ApplySprintTrustFunnel = {
  latestSearchRun: {
    id: string;
    status: string;
    triggeredBy: string;
    startedAt: string;
    finishedAt: string | null;
  } | null;
  latestAgencyRun: {
    id: string;
    status: string;
    updatedAt: string;
  } | null;
  summary: ApplySprintFunnelSummary;
  candidates: ApplySprintCandidate[];
  agencyResults: ApplySprintAgencyResult[];
  hidden: ApplySprintHiddenItem[];
};

type MatchRecord = {
  id: string;
  jobPostingId: string;
  status: JobMatchStatus;
  overallScore: number;
  updatedAt: Date;
  jobPosting: {
    id: string;
    company: string;
    title: string;
    location: string | null;
    applicationUrl: string | null;
    duplicateGroupId: string | null;
    lastSeenAt: Date;
  };
  jobSearchProfile: {
    name: string;
    userId: string;
  };
};

type ApplicationRecord = {
  id: string;
  status: JobMatchStatus;
  resumeId: string | null;
  coverLetterId: string | null;
  jobProfileMatchId: string | null;
  jobPosting: {
    id: string;
    company: string;
    title: string;
    location: string | null;
    applicationUrl: string | null;
    duplicateGroupId: string | null;
    lastSeenAt: Date;
  };
};

type SearchRunRecord = {
  id: string;
  status: string;
  triggeredBy: string;
  startedAt: Date;
  finishedAt: Date | null;
  jobsFetched: number;
  jobsAfterDedupe: number;
  jobsAfterFilters: number;
  jobsSaved: number;
  progress: Prisma.JsonValue;
};

type AgentRunRecord = {
  id: string;
  status: AgentRunStatus;
  outputJson: Prisma.JsonValue | null;
  updatedAt: Date;
};

export function buildApplySprintTrustFunnel(input: {
  latestSearchRun: SearchRunRecord | null;
  latestAgencyRun: AgentRunRecord | null;
  matches: MatchRecord[];
  applications: ApplicationRecord[];
  visibleReadyApplicationIds: Set<string>;
  suppressionByUserId: Map<string, JobSuppressionState>;
}): ApplySprintTrustFunnel {
  const activeApplicationKeys = new Set<string>();
  const applicationByJobId = new Map<string, ApplicationRecord[]>();
  for (const application of input.applications) {
    for (const key of createApplicationCanonicalJobKeys(application.jobPosting)) activeApplicationKeys.add(key);
    applicationByJobId.set(application.jobPosting.id, [...(applicationByJobId.get(application.jobPosting.id) ?? []), application]);
  }

  const agencyResults = parseAgencyResults(input.latestAgencyRun?.outputJson);
  const failedByMatchId = new Map(agencyResults.filter((result) => result.status === "failed" && result.matchId).map((result) => [result.matchId!, result]));
  const candidates: ApplySprintCandidate[] = [];
  const hidden: ApplySprintHiddenItem[] = [];

  for (const match of input.matches) {
    const reasons = reasonsForMatch(match, activeApplicationKeys, input.suppressionByUserId.get(match.jobSearchProfile.userId), failedByMatchId);
    const canPrepare = match.status === "needs_review" && reasons.length === 0;
    if (canPrepare) {
      candidates.push({
        matchId: match.id,
        jobId: match.jobPostingId,
        company: match.jobPosting.company,
        title: match.jobPosting.title,
        location: match.jobPosting.location,
        applicationUrl: match.jobPosting.applicationUrl,
        profileName: match.jobSearchProfile.name,
        score: match.overallScore,
        updatedAt: match.updatedAt.toISOString(),
        reasons,
        canPrepare,
      });
      continue;
    }

    if (reasons.length || match.status !== "ready_to_apply") {
      hidden.push({
        id: match.id,
        kind: "match",
        company: match.jobPosting.company,
        title: match.jobPosting.title,
        location: match.jobPosting.location,
        applicationUrl: match.jobPosting.applicationUrl,
        profileName: match.jobSearchProfile.name,
        score: match.overallScore,
        status: match.status,
        reasons: reasons.length ? reasons : ["existing_match_not_new"],
        detail: reasonSummary(reasons.length ? reasons : ["existing_match_not_new"]),
      });
    }
  }

  for (const application of input.applications) {
    if (input.visibleReadyApplicationIds.has(application.id)) continue;
    const reasons = reasonsForApplication(application, input.visibleReadyApplicationIds);
    if (!reasons.length) continue;
    hidden.push({
      id: application.id,
      kind: "application",
      company: application.jobPosting.company,
      title: application.jobPosting.title,
      location: application.jobPosting.location,
      applicationUrl: application.jobPosting.applicationUrl,
      score: null,
      status: application.status,
      reasons,
      detail: reasonSummary(reasons),
    });
  }

  const stats = latestStats(input.latestSearchRun);
  const agencyPrepared = agencyResults.filter((result) => result.status === "ready_to_apply").length;
  const agencyFailedSkipped = agencyResults.filter((result) => result.status === "failed" || result.status === "skipped").length;
  const agencyAlreadyRunning = input.latestAgencyRun?.status === "PENDING" || input.latestAgencyRun?.status === "RUNNING";

  if ((stats.jobsBelowThreshold ?? 0) > 0) {
    hidden.unshift(summaryHiddenItem("below_profile_threshold", `${stats.jobsBelowThreshold} scored job${stats.jobsBelowThreshold === 1 ? "" : "s"} were below their active profile threshold.`));
  }
  if ((stats.jobsSuppressed ?? 0) > 0) {
    hidden.unshift(summaryHiddenItem("duplicate_or_suppressed", `${stats.jobsSuppressed} job${stats.jobsSuppressed === 1 ? "" : "s"} were suppressed before saving because they matched duplicate, rejected, archived, or already-submitted state.`));
  }
  if (agencyAlreadyRunning) {
    hidden.unshift(summaryHiddenItem("agency_already_running", "A recruiting agency run is already active, so another auto-prep run was skipped."));
  }

  return {
    latestSearchRun: input.latestSearchRun
      ? {
          id: input.latestSearchRun.id,
          status: input.latestSearchRun.status,
          triggeredBy: input.latestSearchRun.triggeredBy,
          startedAt: input.latestSearchRun.startedAt.toISOString(),
          finishedAt: input.latestSearchRun.finishedAt?.toISOString() ?? null,
        }
      : null,
    latestAgencyRun: input.latestAgencyRun
      ? {
          id: input.latestAgencyRun.id,
          status: input.latestAgencyRun.status,
          updatedAt: input.latestAgencyRun.updatedAt.toISOString(),
        }
      : null,
    summary: {
      fetched: input.latestSearchRun?.jobsFetched ?? 0,
      newAfterDedupe: input.latestSearchRun?.jobsAfterDedupe ?? 0,
      matched: input.latestSearchRun?.jobsAfterFilters ?? 0,
      saved: input.latestSearchRun?.jobsSaved ?? 0,
      eligibleForAgency: candidates.length,
      agencyPrepared,
      agencyFailedSkipped,
      visibleReady: input.visibleReadyApplicationIds.size,
      belowProfileThreshold: stats.jobsBelowThreshold ?? 0,
      suppressed: stats.jobsSuppressed ?? 0,
      listingPagesSuppressed: stats.listingPagesSuppressed ?? 0,
      agencyAlreadyRunning,
    },
    candidates: candidates.sort((a, b) => b.score - a.score).slice(0, 200),
    agencyResults,
    hidden: dedupeHidden(hidden).slice(0, 300),
  };
}

export function reasonLabel(reason: ApplySprintReasonCode) {
  const labels: Record<ApplySprintReasonCode, string> = {
    below_profile_threshold: "below profile threshold",
    existing_match_not_new: "existing match, not new",
    profile_max_results_cap: "per-profile maxResultsPerRun cap",
    no_application_url: "no application URL",
    unsupported_application_url: "unsupported URL",
    duplicate_or_suppressed: "duplicate/suppressed",
    already_has_application: "already has application",
    agency_already_running: "agency already running",
    packet_generation_failed: "packet generation failed",
    missing_resume_or_cover_letter: "missing resume or cover letter",
    hidden_by_canonical_duplicate_reconciliation: "hidden by canonical duplicate reconciliation",
  };
  return labels[reason];
}

function reasonsForMatch(
  match: MatchRecord,
  applicationKeys: Set<string>,
  suppressionState: JobSuppressionState | undefined,
  failedByMatchId: Map<string, ApplySprintAgencyResult>,
): ApplySprintReasonCode[] {
  const reasons: ApplySprintReasonCode[] = [];
  if (!match.jobPosting.applicationUrl) reasons.push("no_application_url");
  else if (isUnsupportedApplicationUrl(match.jobPosting.applicationUrl)) reasons.push("unsupported_application_url");
  if (hasApplicationForJob(match.jobPosting, applicationKeys)) reasons.push("already_has_application");
  if (suppressionState && isJobSuppressed(match.jobPosting, suppressionState)) reasons.push("duplicate_or_suppressed");
  if (failedByMatchId.has(match.id)) reasons.push("packet_generation_failed");
  if (match.status !== "needs_review" && match.status !== "ready_to_apply") reasons.push("existing_match_not_new");
  return uniqueReasons(reasons);
}

function reasonsForApplication(application: ApplicationRecord, visibleReadyApplicationIds: Set<string>): ApplySprintReasonCode[] {
  const reasons: ApplySprintReasonCode[] = [];
  if (application.status === "ready_to_apply") {
    if (!application.resumeId || !application.coverLetterId) reasons.push("missing_resume_or_cover_letter");
    if (!application.jobPosting.applicationUrl) reasons.push("no_application_url");
    else if (isUnsupportedApplicationUrl(application.jobPosting.applicationUrl)) reasons.push("unsupported_application_url");
    if (!visibleReadyApplicationIds.has(application.id)) reasons.push("hidden_by_canonical_duplicate_reconciliation");
  }
  if (submittedApplicationStatuses.includes(application.status)) reasons.push("already_has_application");
  return uniqueReasons(reasons);
}

function parseAgencyResults(value: Prisma.JsonValue | null | undefined): ApplySprintAgencyResult[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const results = (value as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results.map((result) => {
    const record = result && typeof result === "object" ? result as Record<string, unknown> : {};
    const status = typeof record.status === "string" && ["ready_to_apply", "approved", "skipped", "failed"].includes(record.status)
      ? record.status as ApplySprintAgencyResult["status"]
      : "skipped";
    return {
      matchId: stringOrNull(record.matchId),
      jobId: stringOrNull(record.jobId),
      applicationId: stringOrNull(record.applicationId),
      company: stringOrNull(record.company) ?? "Unknown company",
      title: stringOrNull(record.title) ?? "Unknown role",
      score: typeof record.score === "number" ? record.score : null,
      status,
      error: stringOrNull(record.error),
      reason: status === "failed" ? stringOrNull(record.error) ?? "Packet generation failed." : null,
    };
  });
}

function latestStats(run: SearchRunRecord | null) {
  const fallback = {
    jobsFetched: run?.jobsFetched ?? 0,
    jobsAfterDedupe: run?.jobsAfterDedupe ?? 0,
    jobsAfterFilters: run?.jobsAfterFilters ?? 0,
    jobsSaved: run?.jobsSaved ?? 0,
    jobsBelowThreshold: 0,
    jobsSuppressed: 0,
    listingPagesSuppressed: 0,
  };
  if (!Array.isArray(run?.progress)) return fallback;
  const latest = [...run.progress].reverse().find((event) => (
    event && typeof event === "object" && !Array.isArray(event) && typeof (event as { stats?: unknown }).stats === "object"
  )) as { stats?: Record<string, unknown> } | undefined;
  if (!latest?.stats) return fallback;
  return {
    ...fallback,
    jobsBelowThreshold: numberValue(latest.stats.jobsBelowThreshold),
    jobsSuppressed: numberValue(latest.stats.jobsSuppressed),
    listingPagesSuppressed: numberValue(latest.stats.listingPagesSuppressed),
  };
}

function isUnsupportedApplicationUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.toLowerCase();
    if (host === "example.com" || host === "remoteok.com") return true;
    if (host === "dice.com") return path.startsWith("/jobs/") && !path.startsWith("/job-detail/");
    if (host === "indeed.com") return path.startsWith("/q-") || path === "/jobs" || path.startsWith("/jobs/");
    if (host === "himalayas.app") return !path.includes("/jobs/");
    if (host === "workingnomads.com") return /remote-.+-jobs$/.test(path.slice(1));
    if (host === "remotive.com") return path.startsWith("/remote-jobs");
    return false;
  } catch {
    return true;
  }
}

function summaryHiddenItem(reason: ApplySprintReasonCode, detail: string): ApplySprintHiddenItem {
  return {
    id: `summary-${reason}`,
    kind: "summary",
    company: "Search funnel",
    title: reasonLabel(reason),
    location: null,
    applicationUrl: null,
    reasons: [reason],
    detail,
  };
}

function reasonSummary(reasons: ApplySprintReasonCode[]) {
  return reasons.map(reasonLabel).join(", ");
}

function uniqueReasons(reasons: ApplySprintReasonCode[]) {
  return Array.from(new Set(reasons));
}

function dedupeHidden(items: ApplySprintHiddenItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.id}:${item.reasons.join("|")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
