export type JoleneAnswerGuardResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateJoleneAnswer(input: {
  message: string;
  reply?: string | null;
  actionJson?: Record<string, unknown> | null;
}): JoleneAnswerGuardResult {
  const normalized = normalize(input.message);
  const reply = input.reply ?? "";
  const action = typeof input.actionJson?.action === "string" ? input.actionJson.action : null;

  if (isInterviewPrompt(normalized)) return { ok: true };

  if (isCountQuestion(normalized) && !/\d/.test(reply)) {
    return { ok: false, reason: "count_question_without_count" };
  }

  if (isOperationalQuestion(normalized) && action === "interview_coaching") {
    return { ok: false, reason: "operational_question_routed_to_interview_coaching" };
  }

  if (isActionRequest(normalized) && !/\b(executed|started|ran|blocked|confirmation|confirm|cannot|will not|manual|skipped|planned)\b/i.test(reply)) {
    return { ok: false, reason: "action_request_without_boundary" };
  }

  return { ok: true };
}

function isCountQuestion(normalized: string) {
  return /\b(how many|count|number of|total)\b/.test(normalized);
}

function isOperationalQuestion(normalized: string) {
  return /\b(apply sprint|ready to apply|job queue|application queue|pipeline|search|profiles?|agents?|email ops|blockers?|needs me)\b/.test(normalized);
}

function isActionRequest(normalized: string) {
  return /\b(run|start|approve|reject|archive|delete|repair|sync|submit|send|publish|mark|move)\b/.test(normalized);
}

function isInterviewPrompt(normalized: string) {
  return /\b(interview|success profile|during interviews|come prepared|talking points|career story|stories)\b/.test(normalized);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
