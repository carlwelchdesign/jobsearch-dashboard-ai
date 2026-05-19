import { runDailyCommandCenterAgent } from "@/lib/agents/daily-command-center";
import { runDuplicateStaleJobDetectorAgent } from "@/lib/agents/duplicate-stale-job-detector";
import { runMarketIntelligenceAgent } from "@/lib/agents/market-intelligence";
import { getAdkJoleneOperatorRegistration, isAdkEnabled } from "@/lib/adk/registry";
import { syncJobResponseEmail } from "@/lib/email/sync";
import { startJobSearchRun } from "@/lib/job-search/start-run";
import { prisma } from "@/lib/prisma";

export type JoleneOperatorAction = {
  id: string;
  label: string;
  risk: "read_only" | "safe_mutation" | "guarded_mutation" | "external_manual_gate";
  status: "planned" | "executed" | "skipped";
  detail: string;
  href?: string;
};

export type JoleneOperatorResult = {
  handled: boolean;
  reply?: string;
  actionJson?: {
    action: "jolene_adk_operator";
    operator: {
      id: string;
      enabled: boolean;
      mode: "deterministic_tool_planner";
      risk: string;
      tools: string[];
    };
    requiresConfirmation?: boolean;
    plannedActions?: JoleneOperatorAction[];
    executedActions?: JoleneOperatorAction[];
    diagnostics?: Record<string, unknown>;
  };
  clientAction?: { type: "navigate"; href: string; refresh?: boolean } | { type: "refresh" };
};

export async function executeJoleneAdkOperator(message: string, options: { userId?: string | null } = {}): Promise<JoleneOperatorResult> {
  const normalized = normalize(message);
  const operator = operatorMetadata();

  const guarded = guardedActionPlan(normalized);
  if (guarded) {
    return {
      handled: true,
      reply: guarded.reply,
      actionJson: {
        action: "jolene_adk_operator",
        operator,
        requiresConfirmation: true,
        plannedActions: guarded.actions,
      },
    };
  }

  const safeActions = safeWorkflowPlan(normalized);
  if (safeActions.length === 0 && isDuplicateApplicationDiagnostic(normalized)) {
    const diagnostics = await diagnoseApplicationVisibility(message, options.userId);
    return {
      handled: true,
      reply: diagnostics.reply,
      actionJson: {
        action: "jolene_adk_operator",
        operator,
        diagnostics: diagnostics.data,
        executedActions: [{
          id: "diagnose_application_visibility",
          label: "Diagnose application visibility",
          risk: "read_only",
          status: "executed",
          detail: "Read applications, job matches, and related job records to explain why a role is still visible.",
          href: "/applications",
        }],
      },
    };
  }
  if (safeActions.length === 0) return { handled: false };

  const executed: JoleneOperatorAction[] = [];
  const replyParts: string[] = [];
  let clientAction: JoleneOperatorResult["clientAction"] | undefined;

  for (const action of safeActions) {
    if (action.id === "run_job_search") {
      const result = await startJobSearchRun("manual");
      executed.push({ ...action, status: result.skipped ? "skipped" : "executed", detail: result.skipped ? `Search already running: ${result.reason ?? "active run"}.` : `Started job search run ${result.run.id}.`, href: "/dashboard" });
      replyParts.push(result.skipped ? "A job search is already running." : "I started a fresh job search.");
      clientAction = { type: "navigate", href: "/dashboard", refresh: true };
    } else if (action.id === "check_duplicates") {
      const result = await runDuplicateStaleJobDetectorAgent({ limit: 2000 });
      executed.push({ ...action, status: "executed", detail: `Analyzed ${result.output.analyzedJobs} jobs, found ${result.output.duplicateGroups.length} duplicate groups, updated ${result.output.updatedJobs}.`, href: "/jobs" });
      replyParts.push(`I checked duplicates: ${result.output.duplicateGroups.length} duplicate group(s), ${result.output.updatedJobs} updated record(s).`);
      clientAction ??= { type: "navigate", href: "/jobs", refresh: true };
    } else if (action.id === "sync_email") {
      const result = await syncJobResponseEmail();
      executed.push({ ...action, status: "executed", detail: `Scanned ${result.scanned}, ingested ${result.ingested}, skipped ${result.skipped}.`, href: "/applications" });
      replyParts.push(`I synced job-response email: ${result.ingested}/${result.scanned} message(s) ingested.`);
      clientAction ??= { type: "navigate", href: "/applications", refresh: true };
    } else if (action.id === "run_daily_command_center") {
      const result = await runDailyCommandCenterAgent({ userId: options.userId ?? undefined });
      executed.push({ ...action, status: "executed", detail: `Created ${result.output.actions.length} prioritized action(s).`, href: "/dashboard" });
      replyParts.push(`I refreshed the Daily Command Center: ${result.output.summary}`);
      clientAction ??= { type: "navigate", href: "/dashboard", refresh: true };
    } else if (action.id === "run_market_intelligence") {
      const result = await runMarketIntelligenceAgent({ userId: options.userId ?? undefined, researchDepth: normalized.includes("deep") ? "deep" : "standard" });
      executed.push({ ...action, status: "executed", detail: `Generated ${result.output.marketTemperature.length} lane signal(s) and ${result.output.recommendedActions.length} recommendation(s).`, href: "/profiles" });
      replyParts.push(`I refreshed Market Intelligence: ${result.output.summary}`);
      clientAction ??= { type: "navigate", href: "/profiles", refresh: true };
    }
  }

  return {
    handled: true,
    reply: [`I handled that through Jolene's ADK app-operator tools.`, ...replyParts, "I stopped before any guarded or external action."].join(" "),
    actionJson: {
      action: "jolene_adk_operator",
      operator,
      executedActions: executed,
    },
    clientAction,
  };
}

function safeWorkflowPlan(normalized: string): JoleneOperatorAction[] {
  const actions: JoleneOperatorAction[] = [];
  if (/\b(run|start|kick off|launch|begin)\b/.test(normalized) && /\b(new |fresh |another )?(job )?(search|discovery)\b/.test(normalized)) {
    actions.push(safeAction("run_job_search", "Run job search", "Start or reuse the current internal job-search run."));
  }
  if (/\b(check|detect|find|scan|clean up|dedupe|deduplicate)\b/.test(normalized) && /\b(duplicate|duplicates|dedupe|deduplication)\b/.test(normalized)) {
    actions.push(safeAction("check_duplicates", "Check duplicates", "Run the duplicate/stale job detector."));
  }
  if (/\b(check|scan|sync|fetch|poll)\b/.test(normalized) && /\b(email|emails|gmail|inbox|mail|messages|responses|replies)\b/.test(normalized)) {
    actions.push(safeAction("sync_email", "Sync job-response email", "Sync job-response email and reconcile detected confirmations."));
  }
  if (/\b(run|refresh|generate|update)\b/.test(normalized) && /\b(daily command|command center|daily plan|today s plan|todays plan)\b/.test(normalized)) {
    actions.push(safeAction("run_daily_command_center", "Refresh Daily Command Center", "Generate the current prioritized app operating plan."));
  }
  if (/\b(run|refresh|generate|update)\b/.test(normalized) && /\b(market intelligence|market research|job market|market trends)\b/.test(normalized)) {
    actions.push(safeAction("run_market_intelligence", "Refresh Market Intelligence", "Generate a review-only market intelligence brief."));
  }
  return uniqueActions(actions);
}

function guardedActionPlan(normalized: string) {
  if (/\b(submit|send)\b/.test(normalized) && /\b(application|applications|email|outreach|message)\b/.test(normalized)) {
    return confirmationPlan("I can help prepare or launch the workflow, but I need confirmation before external submission or sending anything.", [
      guardedAction("external_submit_or_send", "Confirm external action", "Would submit an application, send email/outreach, or interact with a third-party system.", "external_manual_gate"),
    ]);
  }
  if (/\b(approve|reject|archive|delete|remove|disable|cancel|retry|repair|mark)\b/.test(normalized) && /\b(job|jobs|application|applications|profile|profiles|rule|rules|agent|run|duplicate|duplicates)\b/.test(normalized)) {
    const bulk = /\b(all|every|top \d+|\d+\s+(job|jobs|application|applications|duplicates|records))\b/.test(normalized);
    const label = bulk ? "Confirm bulk app change" : "Confirm app change";
    return confirmationPlan("I can do that, but it changes app state. Confirm first and I will execute the exact affected records.", [
      guardedAction("guarded_app_mutation", label, bulk ? "Would change multiple app records and must show affected records first." : "Would change app records and must be confirmed first.", "guarded_mutation"),
    ]);
  }
  return null;
}

function isDuplicateApplicationDiagnostic(normalized: string) {
  return /\b(why|still|showing|visible|duplicate|duplicates|sync|state)\b/.test(normalized)
    && /\b(application|applications|ready to apply|applied|approved|job|jobs)\b/.test(normalized);
}

async function diagnoseApplicationVisibility(message: string, userId?: string | null) {
  const query = extractLikelyEntity(message);
  const [applications, matches, jobs] = await Promise.all([
    prisma.application.findMany({
      where: userId ? { userId } : undefined,
      include: { jobPosting: { select: { id: true, company: true, title: true, duplicateGroupId: true } } },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.jobProfileMatch.findMany({
      include: { jobPosting: { select: { id: true, company: true, title: true, duplicateGroupId: true } }, jobSearchProfile: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
    prisma.jobPosting.findMany({ select: { id: true, company: true, title: true, duplicateGroupId: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 300 }),
  ]);
  const scoredApplications = applications.map((application) => ({ score: scoreRecord(query, application.jobPosting.company, application.jobPosting.title), application })).filter((item) => item.score > 0);
  const scoredMatches = matches.map((match) => ({ score: scoreRecord(query, match.jobPosting.company, match.jobPosting.title), match })).filter((item) => item.score > 0);
  const scoredJobs = jobs.map((job) => ({ score: scoreRecord(query, job.company, job.title), job })).filter((item) => item.score > 0);
  const activeApplications = scoredApplications.filter(({ application }) => ["approved", "ready_to_apply", "resume_generated", "cover_letter_generated"].includes(application.status));
  const appliedApplications = scoredApplications.filter(({ application }) => ["applied", "follow_up_due", "screening", "interviewing", "offer", "rejected_by_company"].includes(application.status));

  const reply = [
    query ? `I checked app state for "${query}".` : "I checked application visibility across local app state.",
    `Matching applications: ${scoredApplications.length}; active/ready: ${activeApplications.length}; applied/submitted: ${appliedApplications.length}; matching job rows: ${scoredJobs.length}; matching profile matches: ${scoredMatches.length}.`,
    activeApplications.length && appliedApplications.length
      ? "This looks like a sync issue: at least one tracker is already applied while another related tracker is still active. Use application integrity repair before acting on the duplicate."
      : activeApplications.length
        ? "The role is visible because at least one application tracker is still in an active pre-submit state."
        : appliedApplications.length
          ? "The role appears submitted/applied in the application tracker; if it is still visible elsewhere, the job-match row likely needs reconciliation."
          : "I did not find an active application tracker for that query, so the visible row may be a job match rather than an application.",
  ].join(" ");

  return {
    reply,
    data: {
      query,
      applications: scoredApplications.slice(0, 8).map(({ application }) => ({
        id: application.id,
        status: application.status,
        jobId: application.jobPosting.id,
        company: application.jobPosting.company,
        title: application.jobPosting.title,
        href: `/applications/${application.id}`,
      })),
      matches: scoredMatches.slice(0, 8).map(({ match }) => ({
        id: match.id,
        status: match.status,
        score: match.overallScore,
        profile: match.jobSearchProfile.name,
        jobId: match.jobPosting.id,
        company: match.jobPosting.company,
        title: match.jobPosting.title,
        href: `/jobs/${match.jobPosting.id}`,
      })),
      jobs: scoredJobs.slice(0, 8).map(({ job }) => ({
        id: job.id,
        company: job.company,
        title: job.title,
        duplicateGroupId: job.duplicateGroupId,
        href: `/jobs/${job.id}`,
      })),
      recommendedAction: activeApplications.length && appliedApplications.length ? "run_application_integrity_repair" : "review_matching_records",
    },
  };
}

function operatorMetadata() {
  const registration = getAdkJoleneOperatorRegistration();
  return {
    id: registration?.id ?? "jolene-app-operator",
    enabled: isAdkEnabled(),
    mode: "deterministic_tool_planner" as const,
    risk: registration?.risk ?? "guarded_mutation",
    tools: registration?.tools ?? [],
  };
}

function safeAction(id: string, label: string, detail: string): JoleneOperatorAction {
  return { id, label, detail, risk: "safe_mutation", status: "planned" };
}

function guardedAction(id: string, label: string, detail: string, risk: JoleneOperatorAction["risk"]): JoleneOperatorAction {
  return { id, label, detail, risk, status: "planned" };
}

function confirmationPlan(reply: string, actions: JoleneOperatorAction[]) {
  return { reply, actions };
}

function uniqueActions(actions: JoleneOperatorAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.id)) return false;
    seen.add(action.id);
    return true;
  });
}

function extractLikelyEntity(message: string) {
  const quoted = message.match(/["“]([^"”]+)["”]/)?.[1];
  if (quoted) return quoted.trim();
  const company = message.match(/\b(?:for|at|from)\s+([A-Z][A-Za-z0-9&.\- ]{1,60})/)?.[1];
  if (company) return company.replace(/\b(is|still|showing|visible|listed|in|on)\b.*$/i, "").trim();
  return message
    .replace(/\b(why|is|are|still|showing|visible|duplicate|duplicates|application|applications|job|jobs|ready to apply|applied|approved|column|page|the|this|that|I|see|listed)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreRecord(query: string, company: string, title: string) {
  const terms = normalize(query).split(" ").filter((term) => term.length > 2);
  if (!terms.length) return 0;
  const haystack = normalize(`${company} ${title}`);
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function normalize(message: string) {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
