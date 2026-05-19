import type { JoleneMessageRole } from "@prisma/client";
import { createTextResponse, isOpenAiConfigured } from "@/lib/ai/openai";
import { formatJoleneContextForPrompt, type JolenePageContext } from "@/lib/jolene/context";
import type { JoleneGlobalContext, JoleneKnowledgeItem } from "@/lib/jolene/knowledge";

type JoleneHistoryMessage = {
  role: JoleneMessageRole;
  content: string;
};

export async function generateJoleneReply({
  message,
  context,
  globalContext,
  history,
  retrievedItems = [],
}: {
  message: string;
  context: JolenePageContext;
  globalContext?: JoleneGlobalContext;
  history: JoleneHistoryMessage[];
  retrievedItems?: JoleneKnowledgeItem[];
}) {
  if (isOpenAiConfigured()) {
    const response = await createTextResponse({
      system: [
        "You are Jolene, the user's embedded job search operating system agent.",
        "Answer from the provided app context first. Be direct, specific, and concise.",
        "You can explain why a job is shown, what data supports it, what is blocking progress, and which app action should happen next.",
        "Treat AUTOMATED_CONFIRMATION and receivedConfirmation entries as proof that the company received the application. Say these are application receipts, even if they are not interviews, offers, or human replies.",
        "Do not claim you performed an action unless the context explicitly proves it.",
        "Do not invent career claims, metrics, job facts, or application status.",
        "For destructive or external actions, recommend the next user-approved step instead of pretending to execute it.",
        "Avoid em dashes, hype, filler, and obvious AI phrasing.",
      ].join(" "),
      input: JSON.stringify(
        {
          userMessage: message,
          pageContext: JSON.parse(formatJoleneContextForPrompt(context)),
          globalContext: globalContext ?? null,
          retrievedItems,
          recentConversation: history.slice(-10).map((item) => ({ role: item.role, content: item.content })),
        },
        null,
        2,
      ),
    });

    if (response) return response;
  }

  return deterministicReply(message, context);
}

function deterministicReply(message: string, context: JolenePageContext) {
  const lower = message.toLowerCase();

  if (context.routeType === "job_detail") {
    const data = context.data as {
      job?: { title?: string; company?: string };
      bestMatch?: {
        profile?: string;
        overallScore?: number;
        strongestMatches?: unknown;
        concerns?: unknown;
        missingKeywords?: unknown;
        explanation?: string;
      } | null;
      bestEvaluation?: {
        fitScore?: number;
        opportunityScore?: number;
        confidenceScore?: number;
        recommendedAction?: string;
        strengths?: unknown;
        risks?: unknown;
        explanation?: string;
      } | null;
    };
    const jobLabel = [data.job?.title, data.job?.company].filter(Boolean).join(" at ") || "this job";
    const match = data.bestMatch;
    const evaluation = data.bestEvaluation;

    if (lower.includes("why") || lower.includes("shown") || lower.includes("match")) {
      return [
        `${jobLabel} is being shown because it matched the ${match?.profile ?? "selected"} search profile with an overall score of ${match?.overallScore ?? "unknown"}.`,
        evaluation
          ? `The newer evaluation has fit ${evaluation.fitScore}, opportunity ${evaluation.opportunityScore}, and confidence ${evaluation.confidenceScore}, with a recommended action of ${evaluation.recommendedAction}.`
          : null,
        match?.explanation ? `Reasoning: ${match.explanation}` : null,
        `Strong signals: ${formatUnknownList(match?.strongestMatches ?? evaluation?.strengths) || "none recorded yet"}.`,
        `Risks or gaps: ${formatUnknownList(match?.concerns ?? evaluation?.risks) || "none recorded yet"}.`,
      ].filter(Boolean).join("\n\n");
    }

    return [
      `${jobLabel} is the active context. I can explain its score, compare it to your search profiles, or help decide whether to approve, reject, save, or prepare an application packet.`,
      evaluation ? `Current recommendation: ${evaluation.recommendedAction} with fit ${evaluation.fitScore} and opportunity ${evaluation.opportunityScore}.` : null,
    ].filter(Boolean).join("\n\n");
  }

  if (context.routeType === "dashboard") {
    const data = context.data as {
      latestSearchRun?: { status?: string; jobsFetched?: number; jobsSaved?: number } | null;
      needsMeCount?: number;
      packetsNeedingReview?: number;
    };
    return [
      "This Command Center is showing the current operating state of your job search.",
      data.latestSearchRun
        ? `Latest search run: ${data.latestSearchRun.status}, ${data.latestSearchRun.jobsFetched ?? 0} fetched, ${data.latestSearchRun.jobsSaved ?? 0} saved.`
        : "No search run is recorded yet.",
      `${data.needsMeCount ?? 0} items need your input and ${data.packetsNeedingReview ?? 0} packets need review.`,
    ].join("\n\n");
  }

  if (context.routeType === "needs_me") {
    const data = context.data as { openRequests?: unknown[] };
    return `This page contains ${data.openRequests?.length ?? 0} open agent blockers. Answering these lets the system continue application, email, and follow-up work.`;
  }

  if (context.routeType === "settings") {
    return "This settings page controls schedules, email connections, automation safety gates, company policies, and admin tools. Tell me what outcome you want, and I can point you to the exact setting to change.";
  }

  return `${context.summary} Ask me what to inspect, explain, or tune from here.`;
}

function formatUnknownList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean).slice(0, 5).join(", ");
  if (typeof value === "string") return value;
  return "";
}
