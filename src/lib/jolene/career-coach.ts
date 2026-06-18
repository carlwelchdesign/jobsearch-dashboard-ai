import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";

export type JoleneCareerCoachingResult = {
  handled: boolean;
  reply?: string;
  actionJson?: {
    action: "interview_coaching" | "career_advice";
    themes: string[];
    evidenceIds: string[];
    gaps: string[];
  };
};

type CareerContext = {
  profile: {
    fullName: string;
    yearsExperience: number | null;
    summary: string;
    roles: string[];
    skills: string[];
    industries: string[];
    domains: string[];
  } | null;
  evidence: Array<{ id: string; title: string; content: string; tags: string[]; sourceType: string }>;
  work: Array<{ company: string; title: string; summary: string | null; achievements: string[]; skills: string[] }>;
  projects: Array<{ name: string; description: string | null; technologies: string[]; highlights: string[] }>;
  bullets: Array<{ id: string; role: string; company: string; text: string; category: string }>;
  outcomes: Array<{ company: string; title: string; status: string; appliedAt: Date | null }>;
};

const successProfiles = [
  {
    theme: "end-to-end ownership",
    terms: ["ownership", "owned", "end to end", "high visibility", "high-visibility", "founder", "lead", "architect", "launched"],
    talkingPoint: "You can show ownership through products and workflows you drove from problem definition through architecture, implementation, iteration, and operational repair.",
  },
  {
    theme: "measurable impact",
    terms: ["metrics", "impact", "customers", "business", "quantifying", "revenue", "conversion", "performance", "reduced", "increased"],
    talkingPoint: "You should bring numbers for user/customer impact, workflow time saved, quality improvements, applications processed, interviews landed, and system reliability improvements.",
  },
  {
    theme: "ambiguity and fast-moving environments",
    terms: ["ambiguous", "unclear", "evolving", "startup", "fast moving", "hard to solve", "unknown", "tradeoff"],
    talkingPoint: "This app gives a strong ambiguity story: agent behavior, stale data, duplicate jobs, ATS constraints, anti-fraud boundaries, and human-in-the-loop automation required constant product and architecture judgment.",
  },
  {
    theme: "decision-making and trade-offs",
    terms: ["decision", "trade off", "trade-off", "evaluate", "risk", "safety", "manual", "automation", "guardrail"],
    talkingPoint: "You can discuss choosing trust over reckless automation, keeping submit manual, isolating LangGraph from RSC bundles, and preferring deterministic guardrails around AI agents.",
  },
  {
    theme: "AI workflow leverage",
    terms: ["ai", "workflow", "efficiency", "agent", "rag", "langgraph", "langsmith", "automation", "maximize"],
    talkingPoint: "You are using AI as an operating layer: grounded evidence retrieval, job scoring, generated materials, LangGraph workflows, local assistant automation, quality loops, and app-aware Jolene retrieval.",
  },
];

export async function executeJoleneCareerCoaching(message: string, options: { userId?: string | null } = {}): Promise<JoleneCareerCoachingResult> {
  if (!isCareerCoachingIntent(message)) return { handled: false };

  const context = await buildCareerContext(options.userId);
  const themes = matchedThemes(message);
  const selectedThemes = themes.length ? themes : successProfiles.map((profile) => profile.theme);
  const evidence = rankEvidenceForThemes(context, selectedThemes).slice(0, 8);
  const gaps = evidenceGaps(context, selectedThemes);
  const company = extractCompany(message);

  return {
    handled: true,
    reply: buildInterviewCoachingReply({ context, themes: selectedThemes, evidence, gaps, company }),
    actionJson: {
      action: "interview_coaching",
      themes: selectedThemes,
      evidenceIds: evidence.map((item) => item.id),
      gaps,
    },
  };
}

export async function buildCareerContext(userId?: string | null): Promise<CareerContext> {
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, include: { profile: true } });
  const profile = user?.profile;
  if (!profile) {
    return { profile: null, evidence: [], work: [], projects: [], bullets: [], outcomes: [] };
  }
  const profileId = profile.id;

  const [evidence, work, projects, bullets, applications] = await Promise.all([
    prisma.candidateEvidence.findMany({
      where: {
        candidateProfileId: profileId,
        confidence: { in: ["VERIFIED", "INFERRED"] },
      },
      orderBy: [{ usableInResume: "desc" }, { updatedAt: "desc" }],
      take: 80,
    }),
    prisma.workExperience.findMany({
      where: { userProfileId: profileId },
      orderBy: [{ isCurrent: "desc" }, { updatedAt: "desc" }],
      take: 20,
    }),
    prisma.project.findMany({
      where: { userProfileId: profileId },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.experienceBullet.findMany({
      where: { userProfileId: profileId, truthLevel: { in: ["verified", "inferred"] } },
      orderBy: { updatedAt: "desc" },
      take: 40,
    }),
    prisma.application.findMany({
      where: { userId: user.id },
      include: { jobPosting: { select: { company: true, title: true } } },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
  ]);

  return {
    profile: {
      fullName: profile.fullName,
      yearsExperience: profile.yearsExperience,
      summary: profile.professionalSummary || profile.masterSummary,
      roles: jsonArray(profile.primaryRoles),
      skills: [...jsonArray(profile.coreSkills), ...jsonArray(profile.technicalSkills)].slice(0, 30),
      industries: jsonArray(profile.industries),
      domains: jsonArray(profile.domainExpertise),
    },
    evidence: evidence.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      tags: jsonArray(item.tags),
      sourceType: item.sourceType,
    })),
    work: work.map((item) => ({
      company: item.company,
      title: item.title,
      summary: item.summary,
      achievements: jsonArray(item.achievements),
      skills: jsonArray(item.skills),
    })),
    projects: projects.map((item) => ({
      name: item.name,
      description: item.description,
      technologies: jsonArray(item.technologies),
      highlights: jsonArray(item.highlights),
    })),
    bullets: bullets.map((item) => ({
      id: item.id,
      role: item.role,
      company: item.company,
      text: item.text,
      category: item.category,
    })),
    outcomes: applications.map((application) => ({
      company: application.jobPosting.company,
      title: application.jobPosting.title,
      status: application.status,
      appliedAt: application.appliedAt,
    })),
  };
}

function buildInterviewCoachingReply({
  context,
  themes,
  evidence,
  gaps,
  company,
}: {
  context: CareerContext;
  themes: string[];
  evidence: CareerContext["evidence"];
  gaps: string[];
  company: string | null;
}) {
  if (!context.profile) {
    return "I do not have an approved candidate profile yet, so I cannot ground this interview guidance. Upload and approve a resume or add evidence first, then ask me again.";
  }

  const intro = company
    ? `${company} is asking for ownership, impact, ambiguity, trade-off judgment, and practical AI leverage. Based on your local profile and evidence, this maps well to your recent full-stack agentic workflow work.`
    : "This maps well to your profile because your strongest evidence is not just implementation work; it is end-to-end product and systems ownership under ambiguity.";

  const profileLine = [
    context.profile.yearsExperience ? `${context.profile.yearsExperience}+ years of experience` : null,
    context.profile.roles.slice(0, 3).join(", "),
    context.profile.skills.slice(0, 8).join(", "),
  ].filter(Boolean).join(" | ");

  const storyLines = themes.slice(0, 5).map((theme) => {
    const profile = successProfiles.find((item) => item.theme === theme);
    const support = evidenceForTheme(evidence, theme)[0];
    const supportText = support ? ` Evidence to cite: ${support.title} - ${excerpt(support.content, 180)}` : " Evidence to add: a specific metric or artifact that proves this theme.";
    return `- ${capitalize(theme)}: ${profile?.talkingPoint ?? "Tie this to a concrete project and business outcome."}${supportText}`;
  });

  const outcomes = context.outcomes.filter((item) => ["screening", "interviewing", "offer"].includes(item.status)).slice(0, 4);
  const outcomeLine = outcomes.length
    ? `Real outcome signal: the system has already helped create positive application movement with ${outcomes.map((item) => `${item.company} (${item.status})`).join(", ")}.`
    : "Real outcome signal to prepare: quantify interviews landed, applications submitted, duplicate jobs suppressed, packets generated, and time saved.";

  return [
    intro,
    profileLine ? `Your positioning: ${profileLine}.` : null,
    "Interview-ready talking points:",
    ...storyLines,
    outcomeLine,
    gaps.length ? `Metrics to prepare before the call: ${gaps.join("; ")}.` : "Metrics to prepare before the call: pick 2-3 concrete numbers for customer/business impact, automation time saved, quality improvement, and interview/application conversion.",
  ].filter(Boolean).join("\n\n");
}

function isCareerCoachingIntent(message: string) {
  const normalized = normalize(message);
  if (/\b(how many|count|number of|total)\b/.test(normalized) && /\b(apply sprint|ready to apply|applications?|jobs?|pipeline)\b/.test(normalized)) return false;
  if (normalized.length > 700 && /\b(interview|success profile|during interviews|evaluating|come prepared|conversation)\b/.test(normalized)) return true;
  if (/\b(how|what|why)\b.*\b(applies|answer|say|position|frame|prepare|interview|observed|observations)\b/.test(normalized)) return true;
  if (/\b(socure|interview|success profiles?|ownership|real world impact|trade offs?|ai workflows?)\b/.test(normalized) && /\b(me|my|career|experience|skill|work|story|stories)\b/.test(normalized)) return true;
  return false;
}

function matchedThemes(message: string) {
  const normalized = normalize(message);
  return successProfiles
    .filter((profile) => profile.terms.some((term) => normalized.includes(term)))
    .map((profile) => profile.theme);
}

function rankEvidenceForThemes(context: CareerContext, themes: string[]) {
  const candidates = context.evidence.map((item) => ({
    item,
    score: themes.reduce((total, theme) => total + scoreText(`${item.title} ${item.content} ${item.tags.join(" ")}`, theme), 0),
  }));
  return candidates
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((candidate) => candidate.item);
}

function evidenceForTheme(evidence: CareerContext["evidence"], theme: string) {
  return evidence.filter((item) => scoreText(`${item.title} ${item.content} ${item.tags.join(" ")}`, theme) > 0);
}

function evidenceGaps(context: CareerContext, themes: string[]) {
  const gaps: string[] = [];
  if (themes.includes("measurable impact") && !hasMetric(context)) gaps.push("specific metrics for customer or business impact");
  if (themes.includes("end-to-end ownership") && !hasTheme(context, "ownership")) gaps.push("one concise end-to-end project story with your decisions and result");
  if (themes.includes("decision-making and trade-offs") && !hasTheme(context, "trade")) gaps.push("a trade-off example where you chose safety, reliability, or trust over speed");
  if (themes.includes("AI workflow leverage") && !hasTheme(context, "ai")) gaps.push("before/after productivity impact from AI workflow use");
  return gaps;
}

function hasMetric(context: CareerContext) {
  const text = allContextText(context);
  return /\b\d+[%x]?\b|\bpercent|revenue|conversion|saved|reduced|increased|faster|hours?\b/i.test(text);
}

function hasTheme(context: CareerContext, theme: string) {
  return normalize(allContextText(context)).includes(theme);
}

function allContextText(context: CareerContext) {
  return [
    context.profile?.summary,
    ...context.evidence.flatMap((item) => [item.title, item.content, item.tags.join(" ")]),
    ...context.work.flatMap((item) => [item.company, item.title, item.summary, item.achievements.join(" ")]),
    ...context.projects.flatMap((item) => [item.name, item.description, item.highlights.join(" "), item.technologies.join(" ")]),
    ...context.bullets.map((item) => item.text),
  ].filter(Boolean).join(" ");
}

function scoreText(value: string, theme: string) {
  const normalized = normalize(value);
  const profile = successProfiles.find((item) => item.theme === theme);
  if (!profile) return 0;
  return profile.terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0);
}

function extractCompany(message: string) {
  const socure = message.match(/\bsocure\b/i);
  if (socure) return "Socure";
  const company = message.match(/\bcompany called ([a-z0-9 .&-]+)/i)?.[1] ?? message.match(/\bwith ([a-z0-9 .&-]+)\b/i)?.[1];
  return company ? capitalize(company.trim()) : null;
}

function excerpt(value: string, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trim()}...`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s+-]/g, " ").replace(/\s+/g, " ").trim();
}

export function isLikelyPastedInterviewPrompt(message: string) {
  const normalized = normalize(message);
  return normalized.length > 500 && /\b(interview|success profile|during interviews|evaluating|come prepared|conversation)\b/.test(normalized);
}
