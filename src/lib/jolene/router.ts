import { z } from "zod";
import { parseStructuredOutput } from "@/lib/ai/openai";

export type JoleneReadOnlyDomain =
  | "dashboard"
  | "apply_sprint"
  | "applications"
  | "jobs"
  | "search"
  | "profiles"
  | "agents"
  | "email_ops"
  | "market"
  | "evidence";

export type JoleneQuestionKind = "count" | "status" | "blockers" | "why" | "which" | "health" | "summary";

export type JoleneReadOnlyRoute = {
  kind: "read_only_question";
  domains: JoleneReadOnlyDomain[];
  questionKind: JoleneQuestionKind;
  confidence: "low" | "medium" | "high";
  reason: string;
};

const routeSchema = z.object({
  route: z.enum(["read_only_question", "not_read_only"]),
  domains: z.array(z.enum([
    "dashboard",
    "apply_sprint",
    "applications",
    "jobs",
    "search",
    "profiles",
    "agents",
    "email_ops",
    "market",
    "evidence",
  ])).default([]),
  questionKind: z.enum(["count", "status", "blockers", "why", "which", "health", "summary"]).default("summary"),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  reason: z.string().default(""),
});

export async function classifyJoleneReadOnlyQuestion(message: string): Promise<JoleneReadOnlyRoute | null> {
  const deterministic = deterministicReadOnlyRoute(message);
  if (!deterministic) return null;

  const structured = await parseStructuredOutput({
    schema: routeSchema,
    schemaName: "jolene_read_only_router",
    system: [
      "Classify whether a Job Search OS Jolene message is a read-only question about local app state.",
      "Return not_read_only for requests to run, approve, reject, submit, send, delete, archive, repair, or mutate anything.",
      "Return read_only_question for questions about counts, status, blockers, health, why something happened, which records need attention, or summaries.",
      "Prefer domains that match the user's wording. Use apply_sprint only for Apply Sprint, ready-to-apply, or application assistant.",
    ].join(" "),
    input: { message },
  }).catch(() => null);

  if (!structured || structured.route !== "read_only_question" || structured.domains.length === 0) return deterministic;

  return {
    kind: "read_only_question",
    domains: uniqueDomains(structured.domains),
    questionKind: structured.questionKind,
    confidence: structured.confidence,
    reason: structured.reason || "OpenAI structured router classified this as a read-only app-state question.",
  };
}

export function deterministicReadOnlyRoute(message: string): JoleneReadOnlyRoute | null {
  const normalized = normalize(message);
  if (!normalized) return null;
  if (!isQuestionLike(normalized)) return null;
  if (isMutationOrExecutionRequest(normalized)) return null;

  const domains: JoleneReadOnlyDomain[] = [];
  if (/\b(apply sprint|ready to apply|ready applications?|ready jobs?|application assistant)\b/.test(normalized)) domains.push("apply_sprint", "applications");
  if (/\b(applications?|applied|submitted|packets?|cover letters?|resumes?|follow ups?|followups?)\b/.test(normalized)) domains.push("applications");
  if (/\b(jobs?|job queue|matches?|job review|duplicates?|stale|suppression|suppressed)\b/.test(normalized)) domains.push("jobs");
  if (/\b(search|discovery|profiles?|profile health|sources?|quality|fit|score|scores|yield)\b/.test(normalized)) domains.push("search", "profiles");
  if (/\b(blockers?|needs me|stuck|blocked|waiting|review)\b/.test(normalized)) domains.push("dashboard", "applications", "agents");
  if (/\b(agents?|runs?|failed|failures?|jolene|operating loop|chief of staff)\b/.test(normalized)) domains.push("agents");
  if (/\b(email ops|email operations|email|emails|gmail|inbox|replies|responses)\b/.test(normalized)) domains.push("email_ops");
  if (/\b(market|market intelligence|compensation|salary|income|offer)\b/.test(normalized)) domains.push("market", "profiles");
  if (/\b(evidence|profile|skills?|experience|resume profile|candidate profile)\b/.test(normalized)) domains.push("evidence", "profiles");
  if (/\b(today|dashboard|command center|pipeline|overall|summary|status|health)\b/.test(normalized)) domains.push("dashboard");

  const unique = uniqueDomains(domains);
  if (!unique.length) return null;

  return {
    kind: "read_only_question",
    domains: unique,
    questionKind: questionKind(normalized),
    confidence: unique.length > 0 ? "medium" : "low",
    reason: "Deterministic router matched app-state question terms.",
  };
}

function questionKind(normalized: string): JoleneQuestionKind {
  if (/\b(how many|count|number of|total)\b/.test(normalized)) return "count";
  if (/\b(blocked|blockers?|stuck|waiting|needs me|preventing|holding)\b/.test(normalized)) return "blockers";
  if (/\b(why|because|cause|reason)\b/.test(normalized)) return "why";
  if (/\b(which|what are|list|show)\b/.test(normalized)) return "which";
  if (/\b(health|quality|fit|score|status)\b/.test(normalized)) return "health";
  if (/\b(status|state|looking|going)\b/.test(normalized)) return "status";
  return "summary";
}

function isQuestionLike(normalized: string) {
  return /\b(what|why|where|when|which|who|how|count|number|total|status|health|summary|blocked|stuck|looking)\b/.test(normalized);
}

function isMutationOrExecutionRequest(normalized: string) {
  return /\b(run|start|kick off|launch|begin|approve|reject|archive|delete|remove|disable|cancel|retry|repair|fix|sync|reconcile|submit|send|publish|move|mark)\b/.test(normalized);
}

function uniqueDomains(domains: JoleneReadOnlyDomain[]) {
  return Array.from(new Set(domains));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
