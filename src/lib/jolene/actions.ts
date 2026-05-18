import { runDuplicateStaleJobDetectorAgent } from "@/lib/agents/duplicate-stale-job-detector";
import { syncJobResponseEmail } from "@/lib/email/sync";
import { startJobSearchRun } from "@/lib/job-search/start-run";
import { executeJoleneCareerCoaching, isLikelyPastedInterviewPrompt } from "@/lib/jolene/career-coach";
import { executeJoleneRetrieval, type JoleneResultLink } from "@/lib/jolene/retrieval";

export type JoleneClientAction =
  | { type: "navigate"; href: string; refresh?: boolean }
  | { type: "refresh" };

export type JoleneActionResult = {
  handled: boolean;
  reply?: string;
  actionJson?: Record<string, unknown> & { resultLinks?: JoleneResultLink[] };
  clientAction?: JoleneClientAction;
};

export async function executeJoleneAction(message: string, options: { userId?: string | null } = {}): Promise<JoleneActionResult> {
  const retrieval = await executeJoleneRetrieval(message, options);
  if (retrieval.handled) return retrieval;

  const coaching = await executeJoleneCareerCoaching(message, options);
  if (coaching.handled) return coaching;

  const intent = parseIntent(message);

  if (intent === "run_job_search") {
    const result = await startJobSearchRun("manual");
    if (result.skipped) {
      return {
        handled: true,
        reply: "A job search is already running. I opened the Command Center so you can monitor its progress.",
        actionJson: { action: "run_job_search", runId: result.run.id, skipped: true, reason: result.reason },
        clientAction: { type: "navigate", href: "/dashboard", refresh: true },
      };
    }

    return {
      handled: true,
      reply: "I started a new job search and opened the Command Center so you can watch the run progress.",
      actionJson: { action: "run_job_search", runId: result.run.id, skipped: false },
      clientAction: { type: "navigate", href: "/dashboard", refresh: true },
    };
  }

  if (intent === "check_duplicates") {
    const result = await runDuplicateStaleJobDetectorAgent({ limit: 2000 });
    return {
      handled: true,
      reply: `I checked the job list for duplicates. I analyzed ${result.output.analyzedJobs} jobs, found ${result.output.duplicateGroups.length} duplicate groups, and updated ${result.output.updatedJobs} records.`,
      actionJson: {
        action: "check_duplicates",
        analyzedJobs: result.output.analyzedJobs,
        duplicateGroups: result.output.duplicateGroups.length,
        updatedJobs: result.output.updatedJobs,
      },
      clientAction: { type: "navigate", href: "/jobs", refresh: true },
    };
  }

  if (intent === "check_email") {
    const result = await syncJobResponseEmail();
    const providerSummary = result.providers
      .map((provider) => {
        if (provider.ok) return `${provider.provider}: ${provider.ingested}/${provider.scanned} ingested`;
        return `${provider.provider}: skipped (${provider.reason})`;
      })
      .join("; ");
    const receivedCompanies = result.receivedConfirmations.map((confirmation) => confirmation.company);
    const receivedSummary = receivedCompanies.length
      ? `Application receipts recorded for: ${receivedCompanies.join(", ")}.`
      : "No application receipt confirmations are currently recorded for the active watchlist.";

    return {
      handled: true,
      reply: `I checked your job-response email against ${result.watchlist.length} active application(s). I scanned ${result.scanned} message(s), ingested ${result.ingested}, and skipped ${result.skipped}. ${receivedSummary} ${providerSummary ? `Provider status: ${providerSummary}.` : ""}`,
      actionJson: {
        action: "check_email",
        scanned: result.scanned,
        ingested: result.ingested,
        skipped: result.skipped,
        watchedApplications: result.watchlist.length,
        receivedConfirmations: result.receivedConfirmations.map((confirmation) => ({
          applicationId: confirmation.applicationId,
          company: confirmation.company,
          title: confirmation.title,
          subject: confirmation.subject,
          from: confirmation.from,
          receivedAt: confirmation.receivedAt.toISOString(),
        })),
        providers: result.providers.map((provider) => provider.ok
          ? { provider: provider.provider, scanned: provider.scanned, ingested: provider.ingested, skipped: provider.skipped }
          : { provider: provider.provider, skipped: true, reason: provider.reason }),
      },
      clientAction: { type: "navigate", href: "/applications", refresh: true },
    };
  }

  const navigation = parseNavigationIntent(message);
  if (navigation) {
    return {
      handled: true,
      reply: `Opening ${navigation.label}.`,
      actionJson: { action: "navigate", href: navigation.href },
      clientAction: { type: "navigate", href: navigation.href },
    };
  }

  return { handled: false };
}

function parseIntent(message: string) {
  const normalized = normalize(message);

  if (
    /\b(run|start|kick off|launch|begin)\b/.test(normalized) &&
    /\b(new |fresh |another )?(job )?(search|discovery)\b/.test(normalized)
  ) {
    return "run_job_search";
  }

  if (
    /\b(check|detect|find|scan|clean up|dedupe|deduplicate)\b/.test(normalized) &&
    /\b(duplicate|duplicates|dedupe|deduplication)\b/.test(normalized)
  ) {
    return "check_duplicates";
  }

  if (
    !isLikelyPastedInterviewPrompt(message) &&
    /\b(check|scan|sync|fetch|poll)\b/.test(normalized) &&
    /\b(email|emails|gmail|inbox|mail|messages|responses|replies)\b/.test(normalized)
  ) {
    return "check_email";
  }

  return null;
}

function parseNavigationIntent(message: string) {
  const normalized = normalize(message);
  if (!/\b(open|go to|show me|take me to|navigate to)\b/.test(normalized)) return null;

  const routes = [
    { label: "the Command Center", href: "/dashboard", terms: ["dashboard", "command center", "home"] },
    { label: "Needs Me", href: "/needs-me", terms: ["needs me", "blockers", "questions"] },
    { label: "Jobs", href: "/jobs", terms: ["jobs", "job queue", "review queue"] },
    { label: "Apply Sprint", href: "/applications/assistant", terms: ["apply sprint", "application assistant", "assistant"] },
    { label: "Applications", href: "/applications", terms: ["applications", "application tracker"] },
    { label: "Settings", href: "/settings", terms: ["settings", "configuration", "config"] },
    { label: "Generated Materials", href: "/resumes/generated", terms: ["generated materials", "generated resumes", "cover letters"] },
    { label: "Evidence", href: "/evidence", terms: ["evidence", "candidate evidence"] },
    { label: "Profiles", href: "/profiles", terms: ["profiles", "search profiles"] },
  ];

  return routes.find((route) => route.terms.some((term) => normalized.includes(term))) ?? null;
}

function normalize(message: string) {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
