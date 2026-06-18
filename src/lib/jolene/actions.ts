import { runDuplicateStaleJobDetectorAgent } from "@/lib/agents/duplicate-stale-job-detector";
import { findReusableAnswerMemories, markAnswerMemoryUsed } from "@/lib/application-answer-memory";
import { startJobSearchRun } from "@/lib/job-search/start-run";
import { validateJoleneAnswer } from "@/lib/jolene/answer-guard";
import { executeJoleneAdkOperator, type JoleneOperatorAction } from "@/lib/jolene/adk-operator";
import { executeJoleneCapabilityRouter } from "@/lib/jolene/capabilities";
import { executeJoleneCareerCoaching, isLikelyPastedInterviewPrompt } from "@/lib/jolene/career-coach";
import { buildCareerCeoBrief, formatCareerCeoBrief } from "@/lib/jolene/career-ceo";
import { buildCareerStandup, formatCareerStandup } from "@/lib/jolene/career-standup";
import { runJoleneChiefOfStaffAgent } from "@/lib/jolene/chief-of-staff";
import { runJoleneEmailOperationsAgent } from "@/lib/jolene/email-ops";
import {
  buildJoleneGlobalContext,
  retrieveJoleneKnowledge,
  shouldUseJoleneGroundedAnswer,
  synthesizeJoleneGroundedAnswer,
} from "@/lib/jolene/knowledge";
import { executeJoleneRetrieval, type JoleneResultLink } from "@/lib/jolene/retrieval";
import { executeJoleneStateQuery } from "@/lib/jolene/state-query";

export type JoleneClientAction =
  | { type: "navigate"; href: string; refresh?: boolean }
  | { type: "refresh" };

export type JoleneActionResult = {
  handled: boolean;
  reply?: string;
  actionJson?: Record<string, unknown> & { resultLinks?: JoleneResultLink[] };
  requiresConfirmation?: boolean;
  plannedActions?: JoleneOperatorAction[];
  executedActions?: JoleneOperatorAction[];
  clientAction?: JoleneClientAction;
};

export async function executeJoleneAction(message: string, options: { userId?: string | null } = {}): Promise<JoleneActionResult> {
  if (options.userId && isAnswerMemoryLookupIntent(message)) {
    const question = extractAnswerMemoryQuestion(message);
    if (!question) {
      return {
        handled: true,
        reply: "Tell me the exact application question in quotes and I will pull the latest saved answer for it.",
        actionJson: { action: "answer_memory_lookup", matches: [] },
      };
    }

    const matches = await findReusableAnswerMemories(options.userId, question, 3);
    const best = matches[0];
    if (!best) {
      return {
        handled: true,
        reply: `I do not have a saved answer for: "${question}".`,
        actionJson: { action: "answer_memory_lookup", question, matches: [] },
      };
    }

    await markAnswerMemoryUsed(best.id).catch(() => null);
    return {
      handled: true,
      reply: [
        `Latest saved answer for: "${best.questionText}"`,
        "",
        best.answer,
        "",
        `Match: ${best.matchScore}%. Reuse policy: ${best.reusePolicy.replace(/_/g, " ").toLowerCase()}. Sensitivity: ${best.sensitivity.toLowerCase()}.`,
      ].join("\n"),
      actionJson: {
        action: "answer_memory_lookup",
        question,
        answerMemory: best,
        matches,
      },
    };
  }

  const retrieval = await executeJoleneRetrieval(message, options);
  if (retrieval.handled) return retrieval;

  const operator = await executeJoleneAdkOperator(message, options);
  if (operator.handled) {
    return {
      ...operator,
      requiresConfirmation: operator.actionJson?.requiresConfirmation,
      plannedActions: operator.actionJson?.plannedActions,
      executedActions: operator.actionJson?.executedActions,
    };
  }

  if (!isLikelyPastedInterviewPrompt(message)) {
    const capability = await executeJoleneCapabilityRouter(message, options);
    if (capability.handled) return capability;
  }

  const stateQuery = await executeJoleneStateQuery(message, options);
  if (stateQuery.handled) return stateQuery;

  const coaching = await executeJoleneCareerCoaching(message, options);
  if (coaching.handled) {
    const guard = validateJoleneAnswer({
      message,
      reply: coaching.reply,
      actionJson: coaching.actionJson,
    });
    if (guard.ok) return coaching;
  }

  if (options.userId && isCareerStandupIntent(message)) {
    const chief = await runJoleneChiefOfStaffAgent({ userId: options.userId, source: "chat" });
    const standup = await buildCareerStandup(options.userId, { persist: true });
    return {
      handled: true,
      reply: [
        `Jolene, Chief of Staff: ${chief.output.summary}`,
        "",
        formatCareerStandup(standup).replace(/^Career CEO standup:/, "Jolene standup:"),
      ].join("\n"),
      actionJson: {
        action: "jolene_chief_of_staff_standup",
        chiefRunId: chief.run.id,
        chiefBrief: chief.output,
        careerStandup: standup,
        sprintScore: standup.sprintScore,
        incomeMomentum: standup.incomeMomentum,
        attentionDebt: standup.attentionDebt,
        moneyMoveStatus: standup.moneyMoveStatus,
        proactivePromptReason: standup.proactivePromptReason,
      },
    };
  }

  if (options.userId && isCareerCeoBriefIntent(message)) {
    const chief = await runJoleneChiefOfStaffAgent({ userId: options.userId, source: "chat" });
    const brief = await buildCareerCeoBrief(options.userId);
    return {
      handled: true,
      reply: [
        `Jolene, Chief of Staff: ${chief.output.summary}`,
        "",
        formatCareerCeoBrief(brief).replace(/^Career CEO brief:/, "Jolene career brief:"),
      ].join("\n"),
      actionJson: {
        action: "jolene_chief_of_staff_brief",
        chiefRunId: chief.run.id,
        chiefBrief: chief.output,
        missionContext: brief.mission,
        moneyMoves: brief.moneyMoves,
        incomeRisks: brief.incomeRisks,
        pipelineLeverage: brief.pipelineLeverage,
        recommendedSprintActions: brief.recommendedSprintActions,
        confidence: brief.confidence,
      },
    };
  }

  if (options.userId && shouldUseJoleneGroundedAnswer(message)) {
    const [globalContext, retrievedItems] = await Promise.all([
      buildJoleneGlobalContext(options.userId),
      retrieveJoleneKnowledge(message, options.userId),
    ]);
    const grounded = synthesizeJoleneGroundedAnswer({
      message,
      globalContext,
      retrievedItems,
    });

    return {
      handled: true,
      reply: grounded.reply,
      actionJson: grounded.actionJson,
    };
  }

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
    const result = await runJoleneEmailOperationsAgent({ userId: options.userId ?? undefined, source: "chat" });
    const providerSummary = result.output.providerStatuses.map((provider) => `${provider.provider}: ${provider.detail}`).join("; ");

    return {
      handled: true,
      reply: `I ran Jolene Email Operations. It scanned ${result.output.scanned} message(s), ingested ${result.output.ingested}, created ${result.output.findingsCreated} finding(s), auto-applied ${result.output.autoApplied}, and found ${result.output.needsApproval} approval-needed item(s). ${providerSummary ? `Provider status: ${providerSummary}.` : ""}`,
      actionJson: {
        action: "check_email",
        runId: result.run.id,
        scanned: result.output.scanned,
        ingested: result.output.ingested,
        findingsCreated: result.output.findingsCreated,
        autoApplied: result.output.autoApplied,
        needsApproval: result.output.needsApproval,
        calendarDrafts: result.output.calendarDrafts,
        providers: result.output.providerStatuses,
      },
      clientAction: { type: "navigate", href: "/dashboard/email-ops", refresh: true },
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

function isCareerCeoBriefIntent(message: string) {
  const normalized = normalize(message);
  return /\b(career ceo|ceo brief|career brief|money moves|income sprint|high income sprint|maximize income|career mission)\b/.test(normalized);
}

function isCareerStandupIntent(message: string) {
  const normalized = normalize(message);
  return /\b(career standup|ceo standup|daily standup|sprint score|income momentum|attention debt|closed loop)\b/.test(normalized);
}

function isAnswerMemoryLookupIntent(message: string) {
  const normalized = normalize(message);
  return (
    /\b(pull up|show|get|find|retrieve|what was|what did i)\b/.test(normalized) &&
    /\b(latest|last|saved|previous|prior|gave|used|answered|answer)\b/.test(normalized) &&
    /\b(answer|application question|field|question)\b/.test(normalized)
  ) || /\b(latest|last|saved|previous|prior)\s+answer\s+(i\s+)?(gave|used|answered)\b/.test(normalized);
}

function extractAnswerMemoryQuestion(message: string) {
  const quoted = message.match(/["“”']([^"“”']{4,500})["“”']/);
  if (quoted?.[1]) return quoted[1].trim();

  const normalized = message.replace(/\s+/g, " ").trim();
  const forMatch = normalized.match(/\b(?:for|to|about)\s+(.{4,500})$/i);
  return forMatch?.[1]?.replace(/[?.!]+$/, "").trim() ?? null;
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
