import { executeJoleneStateQuery, type JoleneStateQueryResult } from "@/lib/jolene/state-query";
import type { JoleneReadOnlyDomain, JoleneReadOnlyRoute } from "@/lib/jolene/router";

export type JoleneCapabilityRisk = "read_only" | "safe_internal" | "guarded_mutation" | "external_blocked";

export type JoleneCapability = {
  id: string;
  label: string;
  risk: JoleneCapabilityRisk;
  domains: JoleneReadOnlyDomain[];
  apiSurfaces: string[];
  pageSurfaces: string[];
  examples: string[];
  keywords: RegExp[];
};

export type JoleneCapabilityRouterResult = JoleneStateQueryResult;

export const joleneCapabilities: JoleneCapability[] = [
  {
    id: "dashboard.command_center",
    label: "Command Center and daily operating state",
    risk: "read_only",
    domains: ["dashboard", "applications", "jobs", "agents"],
    apiSurfaces: ["/api/readiness", "/api/agents/daily-command-center", "/api/jolene/chief-of-staff", "/api/jolene/operating-loop"],
    pageSurfaces: ["/dashboard"],
    examples: ["What needs attention today?", "What is the overall system status?", "What is blocking me?"],
    keywords: [/\b(command center|dashboard|today|overall|system status|needs attention|what now|next actions?)\b/i],
  },
  {
    id: "applications.apply_sprint",
    label: "Apply Sprint queue and application assistant",
    risk: "read_only",
    domains: ["apply_sprint", "applications"],
    apiSurfaces: ["/api/applications/ready-for-extension", "/api/applications/next-ready/launch-assistant", "/api/applications/assistant/prepare-candidates"],
    pageSurfaces: ["/applications/assistant"],
    examples: ["How many jobs are in Apply Sprint?", "What is blocking Apply Sprint?", "Which ready jobs should I work?"],
    keywords: [/\b(apply sprint|ready to apply|ready applications?|ready jobs?|application assistant|local assistant)\b/i],
  },
  {
    id: "applications.pipeline",
    label: "Application pipeline, packets, and follow-ups",
    risk: "read_only",
    domains: ["applications"],
    apiSurfaces: ["/api/applications", "/api/applications/integrity", "/api/applications/follow-ups/scan", "/api/applications/packets/backfill"],
    pageSurfaces: ["/applications", "/needs-me"],
    examples: ["How many applications are active?", "Which packets need review?", "What follow-ups are due?"],
    keywords: [/\b(applications?|pipeline|packets?|cover letters?|resumes?|follow ups?|followups?|needs me|blockers?)\b/i],
  },
  {
    id: "jobs.search_pipeline",
    label: "Jobs, search, duplicates, and suppressions",
    risk: "read_only",
    domains: ["jobs", "search", "profiles"],
    apiSurfaces: ["/api/jobs", "/api/jobs/search/run/status", "/api/jobs/detect-duplicates", "/api/search-optimization/latest"],
    pageSurfaces: ["/jobs", "/dashboard/search", "/profiles"],
    examples: ["Why am I not getting better jobs?", "What did search find?", "How many duplicates are there?"],
    keywords: [/\b(jobs?|job search|search|matches?|duplicates?|stale|suppression|suppressed|sources?|yield|profile health)\b/i],
  },
  {
    id: "profiles.evidence",
    label: "Profiles, evidence, skills, and career context",
    risk: "read_only",
    domains: ["profiles", "evidence"],
    apiSurfaces: ["/api/profiles", "/api/evidence", "/api/resumes/bullets", "/api/resumes/work-experiences/merge"],
    pageSurfaces: ["/profiles", "/evidence", "/resumes/profile"],
    examples: ["What evidence is strongest?", "How is profile health?", "What skills are represented?"],
    keywords: [/\b(profiles?|profile health|evidence|skills?|experience|resume profile|candidate profile|work history)\b/i],
  },
  {
    id: "agents.runs",
    label: "Agent runs, failures, and operating loop",
    risk: "read_only",
    domains: ["agents", "dashboard"],
    apiSurfaces: ["/api/agents/runs/[id]/control", "/api/jolene/chief-of-staff", "/api/jolene/operating-loop", "/api/architecture"],
    pageSurfaces: ["/agents", "/runs", "/architecture"],
    examples: ["What failed recently?", "What agents are running?", "What did the operating loop skip?"],
    keywords: [/\b(agents?|runs?|failed|failures?|operating loop|chief of staff|architecture|skipped)\b/i],
  },
  {
    id: "email_ops",
    label: "Email Ops and inbox findings",
    risk: "read_only",
    domains: ["email_ops", "applications"],
    apiSurfaces: ["/api/jolene/email-ops", "/api/jolene/email-ops/run", "/api/email/messages"],
    pageSurfaces: ["/dashboard/email-ops"],
    examples: ["What is Email Ops status?", "Any recruiter replies?", "What email findings need approval?"],
    keywords: [/\b(email ops|email operations|email|emails|gmail|inbox|replies|responses|recruiter replies)\b/i],
  },
  {
    id: "market_intelligence",
    label: "Market Intelligence, compensation, and hiring signals",
    risk: "read_only",
    domains: ["market", "profiles", "jobs"],
    apiSurfaces: ["/api/market-intelligence/run", "/api/linkedin-analytics/summary", "/api/networking/strategy"],
    pageSurfaces: ["/dashboard/market", "/networking", "/outcomes"],
    examples: ["What is the market saying?", "How is compensation looking?", "What lanes are strongest?"],
    keywords: [/\b(market|market intelligence|compensation|salary|income|offer|hiring signals?|lanes?)\b/i],
  },
  {
    id: "materials.retrieval",
    label: "Generated materials retrieval",
    risk: "read_only",
    domains: ["applications", "jobs", "evidence"],
    apiSurfaces: ["/api/cover-letters/[id]/plain-text", "/api/resumes/generated/[id]/plain-text", "/api/applications/[id]/assistant-package"],
    pageSurfaces: ["/resumes/generated", "/applications"],
    examples: ["Where is the cover letter for Linear?", "Show me materials for Terzo."],
    keywords: [/\b(cover letter|generated materials?|resume|packet|materials?)\b/i],
  },
  {
    id: "safe_internal_workflows",
    label: "Safe internal workflow starts",
    risk: "safe_internal",
    domains: ["dashboard", "jobs", "agents", "email_ops", "market"],
    apiSurfaces: ["/api/jobs/search/run", "/api/jobs/detect-duplicates", "/api/jolene/email-ops/run", "/api/agents/daily-command-center", "/api/market-intelligence/run"],
    pageSurfaces: ["/dashboard", "/jobs", "/dashboard/email-ops", "/dashboard/market"],
    examples: ["Run email ops.", "Start job search.", "Refresh market intelligence."],
    keywords: [/\b(run|start|refresh|kick off|check duplicates|sync email|email ops|market intelligence|job search)\b/i],
  },
  {
    id: "guarded_or_external_actions",
    label: "Guarded mutations and external actions",
    risk: "guarded_mutation",
    domains: ["applications", "jobs", "agents"],
    apiSurfaces: ["/api/jolene/confirm", "/api/applications/[id]/mark-applied", "/api/linkedin-content/drafts/[id]/publish"],
    pageSurfaces: ["/applications", "/linkedin-content", "/settings"],
    examples: ["Approve these jobs.", "Send this recruiter email.", "Publish this LinkedIn post."],
    keywords: [/\b(approve|reject|archive|delete|submit|send|publish|mark applied|move|repair|retry|cancel)\b/i],
  },
];

export async function executeJoleneCapabilityRouter(message: string, options: { userId?: string | null } = {}): Promise<JoleneCapabilityRouterResult> {
  if (!options.userId) return { handled: false };

  if (isCapabilityCatalogQuestion(message)) {
    return capabilityCatalogAnswer(joleneCapabilities);
  }

  const matches = matchJoleneCapabilities(message);
  if (!matches.length) return { handled: false };

  const readOnlyMatches = matches.filter((capability) => capability.risk === "read_only");
  const asksForMutation = matches.some((capability) => capability.risk === "guarded_mutation");
  if (asksForMutation && !readOnlyQuestionLike(message)) return { handled: false };

  if (!readOnlyMatches.length) return { handled: false };

  const domains = uniqueDomains(readOnlyMatches.flatMap((capability) => capability.domains));
  const route: JoleneReadOnlyRoute = {
    kind: "read_only_question",
    domains,
    questionKind: questionKind(message),
    confidence: "high",
    reason: `Jolene capability router matched: ${readOnlyMatches.map((capability) => capability.id).join(", ")}.`,
  };

  const result = await executeJoleneStateQuery(message, {
    userId: options.userId,
    route,
  });
  if (!result.handled) return result;

  return {
    ...result,
    actionJson: result.actionJson
      ? {
          ...result.actionJson,
          data: {
            ...result.actionJson.data,
            capabilities: readOnlyMatches.map(publicCapabilitySummary),
          },
        }
      : result.actionJson,
  };
}

export function matchJoleneCapabilities(message: string) {
  const normalized = message.trim();
  if (!normalized) return [];
  return joleneCapabilities.filter((capability) => capability.keywords.some((pattern) => pattern.test(normalized)));
}

function capabilityCatalogAnswer(capabilities: JoleneCapability[]) {
  const lines = capabilities.slice(0, 8).map((capability) => `- ${capability.label}: ${capability.risk.replace(/_/g, " ")}; surfaces ${capability.pageSurfaces.join(", ")}.`);
  return {
    handled: true,
    reply: [
      "I can route natural-language questions through the Jolene capability registry. Each capability maps app language to local APIs/pages with a declared safety policy.",
      "",
      ...lines,
      "",
      "Read-only questions can be answered directly. Safe internal workflows can run through existing services. Guarded or external actions stay behind confirmation or manual review.",
    ].join("\n"),
    actionJson: {
      action: "jolene_state_query" as const,
      route: {
        kind: "read_only_question" as const,
        domains: ["dashboard" as const],
        questionKind: "summary" as const,
        confidence: "high" as const,
        reason: "User asked what Jolene can access.",
      },
      checkedSources: ["dashboard" as const],
      facts: capabilities.map((capability) => `${capability.label}: ${capability.risk}`),
      blockers: [],
      recommendedActions: [],
      resultLinks: [{ label: "Open Command Center", href: "/dashboard", kind: "page" as const }],
      data: { capabilities: capabilities.map(publicCapabilitySummary) },
    },
    clientAction: { type: "navigate" as const, href: "/dashboard", refresh: true },
  };
}

function isCapabilityCatalogQuestion(message: string) {
  return /\b(what can jolene|what can you access|which apis|what apis|capabilities|tools do you have|access to)\b/i.test(message);
}

function readOnlyQuestionLike(message: string) {
  return /\b(what|why|where|when|which|who|how|count|number|total|status|health|summary|blocked|stuck|looking|show|list)\b/i.test(message);
}

function questionKind(message: string): JoleneReadOnlyRoute["questionKind"] {
  const normalized = message.toLowerCase();
  if (/\b(how many|count|number of|total)\b/.test(normalized)) return "count";
  if (/\b(blocked|blockers?|stuck|waiting|needs me|preventing|holding)\b/.test(normalized)) return "blockers";
  if (/\b(why|because|cause|reason)\b/.test(normalized)) return "why";
  if (/\b(which|what are|list|show)\b/.test(normalized)) return "which";
  if (/\b(health|quality|fit|score|status)\b/.test(normalized)) return "health";
  if (/\b(status|state|looking|going)\b/.test(normalized)) return "status";
  return "summary";
}

function uniqueDomains(domains: JoleneReadOnlyDomain[]) {
  return Array.from(new Set(domains));
}

function publicCapabilitySummary(capability: JoleneCapability) {
  return {
    id: capability.id,
    label: capability.label,
    risk: capability.risk,
    domains: capability.domains,
    apiSurfaces: capability.apiSurfaces,
    pageSurfaces: capability.pageSurfaces,
    examples: capability.examples,
  };
}
