import type { AgentRun, Prisma } from "@prisma/client";
import { z } from "zod";
import { runAgent } from "@/lib/agents/run-agent";
import { buildLinkedInContentMemoryPack, jsonValue, type LinkedInContentMemoryPack } from "@/lib/agents/linkedin-content-memory";
import { createImageGeneration, parseStructuredOutput } from "@/lib/ai/openai";
import { prisma } from "@/lib/prisma";
import { getLinkedInContentModel, getLinkedInDiagramImageModel } from "@/lib/settings/ai-settings";

export type LinkedInContentInput = {
  userId?: string;
  contentPillar?: LinkedInContentPillar;
  prompt?: string;
  tone?: "bold_grounded" | "practical" | "experimental";
  format?: LinkedInContentFormat;
  visualDirection?: string;
  parentRunId?: string;
  generationModel?: string;
  diagramImageModel?: string;
};

export type LinkedInContentPillar = "app_progress" | "search_learning" | "architecture" | "workflow_design";
export type LinkedInContentFormat = "build_log" | "lesson" | "decision_diary" | "teardown" | "before_after" | "contrarian_take" | "field_note" | "visual_walkthrough" | "product_thesis";

export type LinkedInScreenshotAsset = {
  label: string;
  path: string;
  mimeType: "image/png";
  description: string;
  route: string;
  assetType?: "screenshot" | "diagram" | "ai_polish";
  diagramKind?: string;
  renderEngine?: string;
  qualityReview?: DiagramQualityReview;
  imageModel?: string;
  sourceSpec?: unknown;
  provenance?: string[];
  rationale?: string;
  privacyStatus: "PASS" | "NEEDS_REVIEW";
  warnings: string[];
};

export type LinkedInAgentReview = {
  agent:
    | "Narrative Strategist"
    | "Documentarian"
    | "Editorial Challenger"
    | "Prompt Fidelity Reviewer"
    | "Analytics Narrator"
    | "Product Strategist"
    | "Editor"
    | "Visual Producer"
    | "Technical Documentation Architect"
    | "Diagram Systems Designer"
    | "Visual Design Reviewer"
    | "Diagram QA Reviewer"
    | "AI Visual Polish Producer"
    | "Privacy Reviewer";
  summary: string;
  recommendation: string;
  metadata?: Record<string, unknown>;
};

export type LinkedInPrivacyReview = {
  status: "PASS" | "NEEDS_REVIEW";
  warnings: string[];
  blockedTerms: string[];
  reviewedAt: string;
};

export type LinkedInContentOutput = {
  title: string;
  hook: string;
  body: string;
  hashtags: string[];
  disclosureText: string;
  contentPillar: LinkedInContentPillar;
  sourceFacts: string[];
  memorySources: Array<{ type: string; ref: string; label: string }>;
  analyticsSources: Array<{ type: string; ref: string; label: string }>;
  agentReviews: LinkedInAgentReview[];
  claims: Array<{ text: string; provenance: string; status: "grounded" | "ungrounded" }>;
  risks: string[];
  screenshotAssets: LinkedInScreenshotAsset[];
  selectedScreenshots: LinkedInScreenshotAsset[];
  privacyReview: LinkedInPrivacyReview;
  mode: "llm" | "deterministic";
  generationModel: string;
  draftId?: string;
};

export type LinkedInContentDirection = {
  prompt: string;
  tone: NonNullable<LinkedInContentInput["tone"]>;
  format: LinkedInContentFormat;
  legacyPillar: LinkedInContentPillar;
  visualDirection: string;
  selectedAngle: string;
  rejectedAngles: string[];
  intent: LinkedInPromptIntent;
  obligations: PromptObligations;
};

export type LinkedInPromptIntent =
  | "architecture_diagram"
  | "architecture_explainer"
  | "build_log"
  | "workflow_story"
  | "analytics_insight"
  | "jolene_ops"
  | "email_ops"
  | "market_intelligence";

export type PromptObligations = {
  topic: string;
  requiredConcepts: string[];
  requiredVisuals: Array<"architecture_diagram" | "app_screenshot">;
  forbiddenPhrases: string[];
  allowSearchFunnelAnalytics: boolean;
};

export type PromptSatisfactionReview = {
  status: "PASS" | "NEEDS_REVIEW";
  score: number;
  intent: LinkedInPromptIntent;
  prompt: string;
  matchedConcepts: string[];
  missingConcepts: string[];
  warnings: string[];
  reviewedAt: string;
};

export type DiagramColumn = {
  title: string;
  items: string[];
};

export type StaffEngineerDiagramSpec = {
  id: string;
  title: string;
  subtitle: string;
  diagramKind: "system_architecture" | "agent_workflow" | "data_flow" | "approval_gates";
  rationale: string;
  designIntent: string;
  columns: DiagramColumn[];
  relationships: Array<{ from: string; to: string; label: string }>;
  callouts: string[];
  footer: string;
  provenance: string[];
};

export type DiagramQualityReview = {
  status: "PASS" | "NEEDS_REVIEW";
  score: number;
  checks: {
    typography: "PASS" | "NEEDS_REVIEW";
    spacing: "PASS" | "NEEDS_REVIEW";
    overflow: "PASS" | "NEEDS_REVIEW";
    contrast: "PASS" | "NEEDS_REVIEW";
    provenance: "PASS" | "NEEDS_REVIEW";
  };
  warnings: string[];
  reviewedAt: string;
};

const generatedLinkedInPostSchema = z.object({
  title: z.string().min(1).max(120),
  hook: z.string().min(1).max(220),
  body: z.string().min(80).max(3000),
  hashtags: z.array(z.string().min(1).max(40)).max(8),
});

const defaultHashtags = ["#BuildInPublic", "#AgenticAI", "#CreatorTools", "#ProductEngineering"];
const defaultDisclosure = "Prepared by my agent content team from the Job Search OS build log.";
const allowedScreenshotRoutes = new Set([
  "/dashboard",
  "/dashboard/search",
  "/dashboard/social",
  "/dashboard/market",
  "/dashboard/pipeline",
  "/dashboard/email-ops",
  "/sources",
  "/runs",
  "/applications",
  "/applications/assistant",
  "/jobs",
  "/profiles",
  "/evidence",
  "/resumes",
  "/needs-me",
  "/agents",
  "/settings",
  "/settings/learning",
  "/linkedin-content",
]);

export async function runLinkedInContentAgent(input: LinkedInContentInput = {}) {
  const user = input.userId
    ? await prisma.user.findUnique({ where: { id: input.userId } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user exists. Run seed first.");

  const memoryPack = await buildLinkedInContentMemoryPack(user.id);
  const pillar = input.contentPillar ?? "app_progress";
  const direction = buildContentDirection(input, memoryPack);
  const generationModel = await getLinkedInContentModel(user.id);
  const diagramImageModel = await getLinkedInDiagramImageModel(user.id);
  return runAgent<LinkedInContentInput, LinkedInContentOutput>({
    agentType: "LINKEDIN_CONTENT",
    input: { ...input, contentPillar: pillar, prompt: direction.prompt, tone: direction.tone, format: direction.format, visualDirection: direction.visualDirection, generationModel, diagramImageModel },
    userId: user.id,
    parentRunId: input.parentRunId,
    execute: async (run) => {
      const generated = await generateLinkedInContent({ pillar, memoryPack, direction, model: generationModel });
      const screenshotAssets = await createSafeLinkedInScreenshotAssets(memoryPack, direction);
      const diagramAssets = await createPromptDiagramAssets(direction, diagramImageModel);
      const visualAssets = [...diagramAssets, ...screenshotAssets];
      const selectedScreenshots = selectBestScreenshots(visualAssets, direction);
      const promptReview = reviewPromptSatisfaction({
        generated,
        direction,
        visualAssets,
      });
      const agentReviews = buildAgentReviews(memoryPack, generated, direction, selectedScreenshots, promptReview, visualAssets);
      const claims = buildClaims(generated, memoryPack);
      const privacyReview = reviewLinkedInPostPrivacy({
        body: generated.body,
        hook: generated.hook,
        disclosureText: defaultDisclosure,
        sourceFacts: generated.sourceFacts,
        screenshotAssets: selectedScreenshots,
        claims,
      });
      const mergedReview: LinkedInPrivacyReview = {
        ...privacyReview,
        status: privacyReview.status === "PASS" && promptReview.status === "PASS" ? "PASS" : "NEEDS_REVIEW",
        warnings: [...privacyReview.warnings, ...promptReview.warnings],
      };
      const output: LinkedInContentOutput = {
        ...generated,
        disclosureText: defaultDisclosure,
        memorySources: memoryPack.memorySources,
        analyticsSources: memoryPack.analyticsSources,
        agentReviews,
        claims,
        risks: mergedReview.warnings,
        screenshotAssets: visualAssets,
        selectedScreenshots,
        privacyReview: mergedReview,
        generationModel,
      };
      const draft = await persistLinkedInPostDraft(user.id, run, output);
      return { ...output, draftId: draft.id };
    },
  });
}

export async function generateLinkedInContent(input: {
  pillar: LinkedInContentPillar;
  memoryPack: LinkedInContentMemoryPack;
  direction: LinkedInContentDirection;
  model: string;
}): Promise<Omit<LinkedInContentOutput, "screenshotAssets" | "selectedScreenshots" | "privacyReview" | "draftId" | "disclosureText" | "memorySources" | "analyticsSources" | "agentReviews" | "claims" | "risks">> {
  const fallback = buildLinkedInContentFallback(input);
  try {
    const generated = await parseStructuredOutput({
      schema: generatedLinkedInPostSchema,
      schemaName: "generate_linkedin_content_team_post",
      system:
        "Write a LinkedIn post draft as an agent content team documenting Job Search OS work. " +
        "Use the user's daily brief as the primary assignment. Act as documentarians: observe what was built, what decisions were made, and why it matters. " +
        "Use a candid senior builder voice, disclose that agents prepared the update, and ground every public claim in the provided memory pack. " +
        "Be more creative than a status update: choose a sharp narrative shape, specific lesson, or field note. Avoid repeating recent hooks, titles, structures, screenshots, or phrases. " +
        "Do not echo the user's brief, do not write 'Today's content brief', do not say what you would document, and do not include internal planning instructions in the post. " +
        "Use aggregate analytics only. Do not mention company names, recruiters, salaries, emails, job URLs, private application outcomes, or unsupported traction. " +
        "Avoid hype, cliches, emojis, em dashes, and unverifiable claims.",
      input: {
        dailyBrief: input.direction.prompt,
        tone: input.direction.tone,
        format: input.direction.format,
        detectedIntent: input.direction.intent,
        promptObligations: input.direction.obligations,
        selectedAngle: input.direction.selectedAngle,
        rejectedAngles: input.direction.rejectedAngles,
        visualDirection: input.direction.visualDirection,
        pillar: input.pillar,
        publicPolicy: input.memoryPack.publicPolicy,
        aggregateFacts: input.memoryPack.aggregateFacts,
        recentDecisions: input.memoryPack.recentDecisions,
        lessonsLearned: input.memoryPack.lessonsLearned,
        storyAngles: input.memoryPack.storyAngles,
        planSources: input.memoryPack.planSources,
        noveltySignals: input.memoryPack.noveltySignals,
        doNotClaim: input.memoryPack.doNotClaim,
        requiredOutput: {
          title: "Short internal title for the draft.",
          hook: "Strong first line.",
          body: "LinkedIn post body, 180-450 words, grounded only in memoryPack facts and satisfying every prompt obligation. Do not quote the prompt or narrate the assignment.",
          hashtags: "3-6 relevant hashtags.",
        },
      },
      model: input.model,
    });
    if (!generated) return fallback;
    return {
      title: cleanLine(generated.title),
      hook: cleanLine(generated.hook),
      body: stripUnsafeStyle(generated.body),
      hashtags: normalizeHashtags(generated.hashtags),
      contentPillar: input.pillar,
      sourceFacts: input.memoryPack.aggregateFacts,
      mode: "llm",
      generationModel: input.model,
    };
  } catch {
    return fallback;
  }
}

export function buildLinkedInContentFallback(input: {
  pillar: LinkedInContentPillar;
  direction?: LinkedInContentDirection;
  model?: string;
  memoryPack: Pick<LinkedInContentMemoryPack, "aggregateFacts" | "analytics" | "storyAngles" | "planSources" | "noveltySignals">;
}): Omit<LinkedInContentOutput, "screenshotAssets" | "selectedScreenshots" | "privacyReview" | "draftId" | "disclosureText" | "memorySources" | "analyticsSources" | "agentReviews" | "claims" | "risks"> {
  const direction = input.direction ?? {
    prompt: "Document recent Job Search OS progress.",
    tone: "bold_grounded" as const,
    format: "field_note" as const,
    legacyPillar: input.pillar,
    visualDirection: "",
    selectedAngle: input.memoryPack.storyAngles[0] ?? "A field note from the build log.",
    rejectedAngles: [],
    intent: "build_log" as const,
    obligations: promptObligationsFor("build_log", "Document recent Job Search OS progress."),
  };
  if (direction.intent === "architecture_diagram" || direction.intent === "architecture_explainer") {
    return buildArchitectureFallback(input.pillar, input.memoryPack, direction);
  }
  const latest = input.memoryPack.analytics.latestSearchRun;
  const dropLine = direction.obligations.allowSearchFunnelAnalytics && latest?.drops.length
    ? `The more interesting signal was the drop-off pattern: ${latest.drops.slice(0, 4).map((item) => `${item.label.toLowerCase()} ${item.value}`).join(", ")}.`
    : "The useful part is not just the count; it is whether the system can explain what changed and why.";
  const funnelLine = direction.obligations.allowSearchFunnelAnalytics && latest
    ? `The latest run moved through ${latest.funnel.map((item) => `${item.label.toLowerCase()} ${item.value}`).join(", ")}.`
    : "The current work is focused on documenting the relevant system behavior instead of forcing every post through search funnel numbers.";
  const planLine = input.memoryPack.planSources?.[0]
    ? `One plan in the build log keeps pulling me back: ${input.memoryPack.planSources[0].title}. ${input.memoryPack.planSources[0].summary}`
    : "The build log is becoming useful source material, not just project bookkeeping.";
  const body = [
    `${formatLabel(direction.format)}: ${direction.selectedAngle}`,
    "",
    planLine,
    "",
    funnelLine,
    dropLine,
    "",
    "The post-worthy part is not the automation by itself. It is the documentarian loop: plans, agent runs, analytics, screenshots, review gates, and edits all becoming usable context for the next public note.",
    "",
    "That makes the content less repetitive because the agents are not choosing from a static category. They are reading the work, picking a fresh angle, and showing the artifact that best explains it while the final judgment stays human.",
  ].join("\n");
  return {
    title: direction.selectedAngle.slice(0, 110),
    hook: hookForFormat(direction.format),
    body,
    hashtags: defaultHashtags,
    contentPillar: input.pillar,
    sourceFacts: input.memoryPack.aggregateFacts,
    mode: "deterministic",
    generationModel: input.model ?? "",
  };
}

function buildArchitectureFallback(
  pillar: LinkedInContentPillar,
  memoryPack: Pick<LinkedInContentMemoryPack, "aggregateFacts" | "analytics" | "storyAngles" | "planSources" | "noveltySignals">,
  direction: LinkedInContentDirection,
): Omit<LinkedInContentOutput, "screenshotAssets" | "selectedScreenshots" | "privacyReview" | "draftId" | "disclosureText" | "memorySources" | "analyticsSources" | "agentReviews" | "claims" | "risks"> {
  const relevantPlan = selectArchitecturePlanReference(memoryPack.planSources ?? []);
  const planLine = relevantPlan
    ? `The build-log evidence behind this architecture comes from ${relevantPlan.title}, which describes ${relevantPlan.summary.toLowerCase()}`
    : "The architecture can be read from the build itself: routes, API handlers, agent services, Prisma models, and review gates.";
  const body = [
    "The architecture diagram for Job Search OS has two views: the product system and the agent content pipeline.",
    "",
    "The product system starts in the Next.js App Router. Dashboard and workflow screens capture human intent, review decisions, and approvals. Route handlers turn those actions into internal work: draft generation, Jolene briefs, Email Ops scans, search runs, analytics imports, screenshot capture, and LinkedIn publishing attempts.",
    "",
    "The durable layer is Prisma/Postgres. It stores the operational memory: applications, AgentRun and AgentRunEvent observability, LinkedIn drafts, analytics snapshots, Email Ops findings, calendar proposals, and `/plans` context. That matters because the agents are not asked to invent a story from scratch. They are asked to explain work that is already recorded.",
    "",
    "The agent layer sits between those routes and that memory. Jolene acts as Chief of Staff, while specialist teams handle Email Ops, market intelligence, search, Apply Sprint, and content generation. They report through the same run/event model, which gives the system a way to show evidence, blockers, delegated work, and approval-needed actions.",
    "",
    "The LinkedIn content pipeline is a smaller version of the same architecture: prompt, memory pack, `/plans` context, analytics, visual selection, prompt-fidelity review, privacy review, editable draft, explicit approval, and then LinkedIn Share API publishing. The diagrams are not decoration. They are the audit trail for how a public post moved from idea to artifact.",
    "",
    planLine,
    "",
    "The design principle is simple: agentic software gets more credible when its memory, decisions, diagrams, and approval gates are visible. The architecture should make the handoff between human judgment and agent work inspectable.",
  ].join("\n");
  return {
    title: "Job Search OS system architecture with agent audit trails",
    hook: "The most important layer in an agentic system is the audit trail.",
    body,
    hashtags: ["#AgenticAI", "#SystemArchitecture", "#ProductEngineering", "#BuildInPublic"],
    contentPillar: pillar,
    sourceFacts: [
      ...(relevantPlan ? [`Architecture plan context: ${relevantPlan.title} covers ${relevantPlan.summary}`] : []),
      "Architecture context: Next.js App Router, API routes, agent services, Prisma/Postgres, AgentRun observability, privacy review, and LinkedIn approval gates.",
    ],
    mode: "deterministic",
    generationModel: "",
  };
}

export function reviewLinkedInPostPrivacy(input: {
  body: string;
  hook: string;
  disclosureText?: string;
  sourceFacts: string[];
  screenshotAssets: Array<Pick<LinkedInScreenshotAsset, "label" | "description" | "route" | "privacyStatus" | "warnings">>;
  claims?: Array<{ text: string; provenance: string; status: "grounded" | "ungrounded" }>;
}): LinkedInPrivacyReview {
  const text = [
    input.hook,
    input.body,
    input.disclosureText ?? "",
    ...input.sourceFacts,
    ...input.screenshotAssets.map((asset) => `${asset.label} ${asset.description} ${asset.route} ${asset.warnings.join(" ")}`),
  ].join("\n");
  const blockedPatterns: Array<[RegExp, string]> = [
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, "email address"],
    [/https?:\/\/(?!localhost|127\.0\.0\.1)[^\s)]+/i, "external URL"],
    [/\$\s?\d[\d,]*(?:k|K)?\b/, "salary or compensation"],
    [/\b(applied|interviewing|rejected|offer|screening)\s+at\s+[A-Z][A-Za-z0-9&.\- ]+/i, "application outcome with company"],
    [/\blinkedin\.com\/jobs\/view\/\d+/i, "LinkedIn job URL"],
    [/\b(recruiter|hiring manager)\s+[A-Z][A-Za-z]+\b/i, "named recruiter or hiring contact"],
  ];
  const blockedTerms = blockedPatterns.flatMap(([pattern, label]) => pattern.test(text) ? [label] : []);
  const ungroundedClaims = (input.claims ?? []).filter((claim) => claim.status !== "grounded");
  const screenshotWarnings = input.screenshotAssets.flatMap((asset) => asset.privacyStatus === "PASS" ? [] : asset.warnings);
  const warnings = [
    ...blockedTerms.map((term) => `Potential private ${term} detected.`),
    ...screenshotWarnings,
    ...ungroundedClaims.map((claim) => `Ungrounded public claim: ${claim.text}`),
  ];
  return {
    status: warnings.length ? "NEEDS_REVIEW" : "PASS",
    warnings,
    blockedTerms,
    reviewedAt: new Date().toISOString(),
  };
}

export async function createSafeLinkedInScreenshotAssets(memoryPack: LinkedInContentMemoryPack, direction?: LinkedInContentDirection): Promise<LinkedInScreenshotAsset[]> {
  const recommendations = recommendScreenshotRoutes(memoryPack, direction).slice(0, 3);
  const output: LinkedInScreenshotAsset[] = [];
  for (const recommendation of recommendations) {
    const captured = await captureRouteScreenshot(recommendation.route, recommendation.reason);
    if (captured) output.push(captured);
  }
  return output;
}

export function reviewPromptSatisfaction(input: {
  generated: Pick<LinkedInContentOutput, "title" | "hook" | "body">;
  direction: LinkedInContentDirection;
  visualAssets: LinkedInScreenshotAsset[];
}): PromptSatisfactionReview {
  const haystack = `${input.generated.title}\n${input.generated.hook}\n${input.generated.body}`.toLowerCase();
  const matchedConcepts = input.direction.obligations.requiredConcepts.filter((concept) => haystack.includes(concept.toLowerCase()));
  const missingConcepts = input.direction.obligations.requiredConcepts.filter((concept) => !matchedConcepts.includes(concept));
  const forbiddenMatches = input.direction.obligations.forbiddenPhrases.filter((phrase) => haystack.includes(phrase.toLowerCase()));
  const hasRequiredDiagram = !input.direction.obligations.requiredVisuals.includes("architecture_diagram")
    || input.visualAssets.some((asset) => asset.assetType === "diagram" && asset.privacyStatus === "PASS" && asset.path);
  const warnings = [
    ...missingConcepts.slice(0, 4).map((concept) => `Prompt obligation missing: ${concept}.`),
    ...forbiddenMatches.map((phrase) => `Generic fallback phrase still present: ${phrase}.`),
    ...(hasRequiredDiagram ? [] : ["Architecture prompt requires at least one generated diagram asset."]),
  ];
  const conceptScore = Math.round((matchedConcepts.length / Math.max(input.direction.obligations.requiredConcepts.length, 1)) * 80);
  const visualScore = hasRequiredDiagram ? 20 : 0;
  const penalty = forbiddenMatches.length * 15;
  const score = Math.max(0, Math.min(100, conceptScore + visualScore - penalty));
  return {
    status: warnings.length || score < 70 ? "NEEDS_REVIEW" : "PASS",
    score,
    intent: input.direction.intent,
    prompt: input.direction.prompt,
    matchedConcepts,
    missingConcepts,
    warnings,
    reviewedAt: new Date().toISOString(),
  };
}

async function createPromptDiagramAssets(direction: LinkedInContentDirection, imageModel: string): Promise<LinkedInScreenshotAsset[]> {
  if (!direction.obligations.requiredVisuals.includes("architecture_diagram")) return [];
  const specs = buildArchitectureDiagramSpecs(direction);
  const assets: LinkedInScreenshotAsset[] = [];
  for (const spec of specs) assets.push(await captureDiagramAsset(spec));
  const polishAsset = await createAiVisualPolishAsset(specs[0], direction, imageModel);
  if (polishAsset) assets.push(polishAsset);
  return assets;
}

export function buildArchitectureDiagramSpecs(direction: LinkedInContentDirection): StaffEngineerDiagramSpec[] {
  return [
    {
      id: "system-architecture",
      title: "System Architecture",
      subtitle: "Human intent, app routes, agent services, durable memory, and external gates",
      diagramKind: "system_architecture",
      rationale: "Shows the repo-level architecture requested by the prompt.",
      designIntent: "Technical editorial architecture diagram with restrained color, clear grouping, and documentation-quality hierarchy.",
      columns: [
        { title: "Experience", items: ["Next.js App Router UI", "Dashboard command center", "LinkedIn content studio", "Human review actions"] },
        { title: "API Control", items: ["Draft generation routes", "Jolene and Email Ops routes", "Analytics and sync routes", "Approval endpoints"] },
        { title: "Agent Services", items: ["Jolene Chief of Staff", "Email Operations team", "LinkedIn content team", "Market and search agents"] },
        { title: "Durable Memory", items: ["Prisma/Postgres", "AgentRun event history", "Plan files as build log", "Draft and analytics records"] },
        { title: "External Gates", items: ["OpenAI generation", "Playwright capture", "LinkedIn publish approval", "Privacy review"] },
      ],
      relationships: [
        { from: "Experience", to: "API Control", label: "intent and approval" },
        { from: "API Control", to: "Agent Services", label: "delegated work" },
        { from: "Agent Services", to: "Durable Memory", label: "evidence and state" },
        { from: "Durable Memory", to: "External Gates", label: "publishable artifacts" },
      ],
      callouts: ["Every public claim needs provenance.", "External writes stay approval-gated."],
      footer: `Prompt: ${direction.prompt}`,
      provenance: ["LinkedIn content prompt", "Repository architecture context", "AgentRun and LinkedInPostDraft data model", "/plans build log"],
    },
    {
      id: "agent-content-flow",
      title: "Agent Content Flow",
      subtitle: "How a prompt becomes a reviewable LinkedIn draft",
      diagramKind: "agent_workflow",
      rationale: "Shows why content generation should follow the prompt instead of defaulting to funnel analytics.",
      designIntent: "Workflow diagram with strong left-to-right scanning, compact labels, and explicit review gates.",
      columns: [
        { title: "Brief", items: ["User prompt", "Detected intent", "Prompt obligations"] },
        { title: "Memory Pack", items: ["Plan files", "Agent runs", "Aggregate analytics", "Prior drafts"] },
        { title: "Creation", items: ["Narrative strategy", "Technical documentation", "Diagram system design", "Editor pass"] },
        { title: "Gates", items: ["Prompt fidelity review", "Diagram QA review", "Privacy review", "Grounded claims"] },
        { title: "Publish", items: ["Editable draft", "User approval", "LinkedIn Share API"] },
      ],
      relationships: [
        { from: "Brief", to: "Memory Pack", label: "context" },
        { from: "Memory Pack", to: "Creation", label: "source material" },
        { from: "Creation", to: "Gates", label: "review" },
        { from: "Gates", to: "Publish", label: "approval" },
      ],
      callouts: ["The deterministic diagram is the source of truth.", "AI polish is optional and non-authoritative."],
      footer: `Intent: ${direction.intent}`,
      provenance: ["Prompt obligations", "LinkedIn content memory pack", "Content-team review model", "LinkedIn publishing gates"],
    },
  ];
}

export function reviewDiagramSpecQuality(spec: StaffEngineerDiagramSpec, layoutWarnings: string[] = []): DiagramQualityReview {
  const warnings: string[] = [];
  const allLabels = [spec.title, spec.subtitle, ...spec.columns.flatMap((column) => [column.title, ...column.items]), ...spec.callouts];
  if (!spec.provenance.length) warnings.push("Diagram is missing source provenance.");
  if (spec.columns.length > 5) warnings.push("Diagram has too many columns for a readable LinkedIn visual.");
  if (spec.columns.some((column) => column.items.length > 4)) warnings.push("At least one diagram column is too dense.");
  if (allLabels.some((label) => label.length > 88)) warnings.push("At least one label is too long for staff-engineer diagram typography.");
  warnings.push(...layoutWarnings);
  const checks = {
    typography: allLabels.some((label) => label.length > 88) ? "NEEDS_REVIEW" as const : "PASS" as const,
    spacing: spec.columns.length > 5 || spec.columns.some((column) => column.items.length > 4) ? "NEEDS_REVIEW" as const : "PASS" as const,
    overflow: layoutWarnings.length ? "NEEDS_REVIEW" as const : "PASS" as const,
    contrast: "PASS" as const,
    provenance: spec.provenance.length ? "PASS" as const : "NEEDS_REVIEW" as const,
  };
  const score = Math.max(0, 100 - warnings.length * 12);
  return {
    status: warnings.length ? "NEEDS_REVIEW" : "PASS",
    score,
    checks,
    warnings,
    reviewedAt: new Date().toISOString(),
  };
}

async function captureDiagramAsset(spec: StaffEngineerDiagramSpec): Promise<LinkedInScreenshotAsset> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const { chromium } = await import("playwright");
    const dir = path.join(process.cwd(), "public", "generated", "linkedin-content");
    await fs.mkdir(dir, { recursive: true });
    const filename = `${Date.now()}-${spec.id}.png`;
    const filePath = path.join(dir, filename);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, colorScheme: "light" });
    await page.setContent(diagramHtml(spec), { waitUntil: "load" });
    const layoutWarnings = await page.evaluate(() => {
      const warnings: string[] = [];
      document.querySelectorAll<HTMLElement>("[data-diagram-card]").forEach((element) => {
        if (element.scrollHeight > element.clientHeight + 2 || element.scrollWidth > element.clientWidth + 2) {
          warnings.push(`Diagram card overflow: ${element.dataset.diagramCard || "unknown"}.`);
        }
      });
      document.querySelectorAll<HTMLElement>("[data-qa-text]").forEach((element) => {
        if (element.scrollWidth > element.clientWidth + 2) {
          warnings.push(`Text overflow: ${element.textContent?.trim() || "unknown"}.`);
        }
      });
      return warnings;
    });
    const qualityReview = reviewDiagramSpecQuality(spec, layoutWarnings);
    await page.screenshot({ path: filePath, fullPage: true });
    await browser.close();
    return {
      label: `Architecture diagram: ${spec.title}`,
      path: `/generated/linkedin-content/${filename}`,
      mimeType: "image/png",
      route: `diagram:${spec.id}`,
      assetType: "diagram",
      diagramKind: spec.diagramKind,
      renderEngine: "staff-engineer-html-v1",
      description: spec.subtitle,
      rationale: spec.rationale,
      qualityReview,
      sourceSpec: spec,
      provenance: spec.provenance,
      privacyStatus: qualityReview.status,
      warnings: qualityReview.warnings,
    };
  } catch (error) {
    const qualityReview = reviewDiagramSpecQuality(spec, [error instanceof Error ? error.message : "Diagram generation failed."]);
    return {
      label: `Diagram unavailable: ${spec.title}`,
      path: "",
      mimeType: "image/png",
      route: `diagram:${spec.id}`,
      assetType: "diagram",
      diagramKind: spec.diagramKind,
      renderEngine: "staff-engineer-html-v1",
      description: spec.subtitle,
      rationale: spec.rationale,
      qualityReview,
      sourceSpec: spec,
      provenance: spec.provenance,
      privacyStatus: "NEEDS_REVIEW",
      warnings: [error instanceof Error ? error.message : "Diagram generation failed."],
    };
  }
}

async function createAiVisualPolishAsset(spec: StaffEngineerDiagramSpec, direction: LinkedInContentDirection, imageModel: string): Promise<LinkedInScreenshotAsset | null> {
  if (process.env.LINKEDIN_ENABLE_AI_VISUAL_POLISH !== "true") return null;
  const fs = await import("fs/promises");
  const path = await import("path");
  const dir = path.join(process.cwd(), "public", "generated", "linkedin-content");
  await fs.mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${spec.id}-ai-polish.png`;
  const filePath = path.join(dir, filename);
  const prompt = [
    "Create a polished editorial cover image for a technical LinkedIn post.",
    "No readable text, no labels, no UI screenshots, no logos, no people.",
    "Use abstract system architecture cues: layered blocks, evidence trails, approval gates, agent workflow, and durable memory.",
    "Style: staff engineer documentation, quiet high-contrast palette, premium technical publication, not cartoonish.",
    `Topic: ${direction.prompt}`,
    `Diagram brief: ${spec.title} - ${spec.subtitle}`,
  ].join("\n");
  try {
    const generated = await createImageGeneration({ prompt, model: imageModel, size: "1536x864", quality: "medium" });
    if (!generated) {
      return aiPolishWarningAsset(spec, imageModel, "OpenAI image generation is not configured or returned no image.");
    }
    await fs.writeFile(filePath, generated.buffer);
    return {
      label: `AI visual polish: ${spec.title}`,
      path: `/generated/linkedin-content/${filename}`,
      mimeType: "image/png",
      route: `ai-polish:${spec.id}`,
      assetType: "ai_polish",
      diagramKind: spec.diagramKind,
      renderEngine: "openai-image-generation",
      description: "Optional non-authoritative polish variant. Exact technical text remains in the deterministic diagram.",
      rationale: "Adds a social cover option without making the image model responsible for architecture labels.",
      imageModel: generated.model,
      sourceSpec: { id: spec.id, title: spec.title, prompt },
      provenance: ["OpenAI image generation", "Deterministic diagram brief"],
      privacyStatus: "PASS",
      warnings: ["AI polish variant is non-authoritative and should not replace the deterministic technical diagram for exact architecture text."],
    };
  } catch (error) {
    return aiPolishWarningAsset(spec, imageModel, error instanceof Error ? error.message : "OpenAI image generation failed.");
  }
}

function aiPolishWarningAsset(spec: StaffEngineerDiagramSpec, imageModel: string, warning: string): LinkedInScreenshotAsset {
  return {
    label: `AI visual polish unavailable: ${spec.title}`,
    path: "",
    mimeType: "image/png",
    route: `ai-polish:${spec.id}`,
    assetType: "ai_polish",
    diagramKind: spec.diagramKind,
    renderEngine: "openai-image-generation",
    description: "Optional AI polish variant could not be generated; deterministic diagram remains available.",
    rationale: "Image generation failures are non-blocking because text-heavy technical diagrams are rendered deterministically.",
    imageModel,
    sourceSpec: { id: spec.id, title: spec.title },
    provenance: ["OpenAI image generation attempted"],
    privacyStatus: "NEEDS_REVIEW",
    warnings: [warning],
  };
}

function buildAgentReviews(
  memoryPack: LinkedInContentMemoryPack,
  generated: Pick<LinkedInContentOutput, "title" | "body" | "mode">,
  direction: LinkedInContentDirection,
  selectedScreenshots: LinkedInScreenshotAsset[],
  promptReview: PromptSatisfactionReview,
  visualAssets: LinkedInScreenshotAsset[],
): LinkedInAgentReview[] {
  const latest = memoryPack.analytics.latestSearchRun;
  const diagramAssets = visualAssets.filter((asset) => asset.assetType === "diagram");
  const aiPolishAssets = visualAssets.filter((asset) => asset.assetType === "ai_polish");
  const diagramReviews = diagramAssets.flatMap((asset) => asset.qualityReview ? [asset.qualityReview] : []);
  const diagramWarnings = diagramReviews.flatMap((review) => review.warnings);
  const bestDiagramScore = diagramReviews.reduce((score, review) => Math.max(score, review.score), 0);
  return [
    { agent: "Narrative Strategist", summary: `Prompt: ${direction.prompt}`, recommendation: `Intent: ${direction.intent}. Selected angle: ${direction.selectedAngle}. Rejected: ${direction.rejectedAngles.join(" | ") || "none"}.`, metadata: { prompt: direction.prompt, intent: direction.intent, format: direction.format, selectedAngle: direction.selectedAngle, rejectedAngles: direction.rejectedAngles } },
    { agent: "Documentarian", summary: memoryPack.recentDecisions.slice(0, 2).join(" "), recommendation: `Use plan memory and build evidence, including ${memoryPack.planSources.slice(0, 2).map((plan) => plan.title).join(", ") || "recent app work"}.` },
    { agent: "Editorial Challenger", summary: `Avoid recent phrases: ${memoryPack.noveltySignals.avoidPhrases.join(", ")}.`, recommendation: "Do not reuse the same future-CMS/operating-system framing unless the prompt explicitly asks for it." },
    { agent: "Prompt Fidelity Reviewer", summary: `Prompt match ${promptReview.score}/100, ${promptReview.status.toLowerCase().replace(/_/g, " ")}.`, recommendation: promptReview.warnings.length ? promptReview.warnings.join(" ") : "Draft satisfies the prompt obligations.", metadata: { ...promptReview, generationMode: generated.mode, obligations: direction.obligations } },
    { agent: "Analytics Narrator", summary: latest ? `Latest funnel has ${latest.funnel.length} stages and ${latest.drops.length} visible drop-off reasons.` : "No latest search analytics are available.", recommendation: "Use aggregate funnel numbers only." },
    { agent: "Product Strategist", summary: memoryPack.storyAngles[0] ?? "The product angle is creator workflow memory.", recommendation: "Frame this as a content operating system learning from its own work." },
    { agent: "Editor", summary: `Draft title: ${generated.title}.`, recommendation: "Keep the post concrete, non-hype, and readable without internal app knowledge." },
    { agent: "Technical Documentation Architect", summary: direction.intent.includes("architecture") ? `Architecture brief: ${direction.obligations.topic}` : "No technical diagram brief required for this prompt.", recommendation: "Use repo-level systems, memory, approval gates, and provenance as the diagram's source of truth.", metadata: { requiredConcepts: direction.obligations.requiredConcepts, requiredVisuals: direction.obligations.requiredVisuals } },
    { agent: "Diagram Systems Designer", summary: diagramAssets.length ? `${diagramAssets.length} deterministic technical diagram asset(s) generated.` : "No deterministic technical diagram generated.", recommendation: "Prefer the deterministic technical diagram for exact labels and system documentation.", metadata: { diagramAssets: diagramAssets.map((asset) => ({ label: asset.label, diagramKind: asset.diagramKind, renderEngine: asset.renderEngine, provenance: asset.provenance })) } },
    { agent: "Visual Design Reviewer", summary: diagramAssets.length ? `Best diagram quality score: ${bestDiagramScore}/100.` : "No diagram typography review available.", recommendation: "Use restrained type, normal-weight body labels, fixed gutters, and high contrast for LinkedIn readability.", metadata: { qualityReviews: diagramReviews } },
    { agent: "Diagram QA Reviewer", summary: diagramWarnings.length ? diagramWarnings.join(" ") : "No text overflow, spacing, contrast, or provenance blockers detected.", recommendation: diagramWarnings.length ? "Do not publish media until the deterministic diagram passes QA." : "Deterministic diagram is publishable from a layout QA perspective.", metadata: { warnings: diagramWarnings } },
    { agent: "AI Visual Polish Producer", summary: aiPolishAssets.length ? aiPolishAssets.map((asset) => `${asset.label}: ${asset.warnings.join(" ") || "generated"}`).join(" | ") : "AI visual polish was not requested for this draft.", recommendation: "Treat AI polish as optional social texture; never rely on it for exact architecture labels.", metadata: { aiPolishAssets: aiPolishAssets.map((asset) => ({ label: asset.label, path: asset.path, imageModel: asset.imageModel, warnings: asset.warnings })) } },
    { agent: "Visual Producer", summary: selectedScreenshots.map((item) => `${item.route}: ${item.description}`).join(" | ") || "No passing visual selected.", recommendation: `Visual rationale: ${direction.visualDirection || "choose the artifact that best explains the selected angle"}.`, metadata: { visualRationale: direction.visualDirection || "choose the artifact that best explains the selected angle", selectedAssets: selectedScreenshots.map((asset) => ({ label: asset.label, path: asset.path, route: asset.route, assetType: asset.assetType ?? "screenshot" })) } },
    { agent: "Privacy Reviewer", summary: memoryPack.publicPolicy, recommendation: "Block named entities, private outcomes, external URLs, and unsupported claims before publishing." },
  ];
}

export function planLinkedInPromptIntent(prompt: string, legacyPillar: LinkedInContentPillar = "app_progress"): LinkedInPromptIntent {
  const normalized = prompt.toLowerCase();
  if (/\b(architecture|system design|data flow|diagram|diagrams|layer|layers)\b/.test(normalized) && /\b(diagram|diagrams|architecture)\b/.test(normalized)) return "architecture_diagram";
  if (/\b(architecture|system design|data flow|layer|layers)\b/.test(normalized)) return "architecture_explainer";
  if (/\b(email|inbox|calendar|interview invite|email ops)\b/.test(normalized)) return "email_ops";
  if (/\b(jolene|chief of staff|standup)\b/.test(normalized)) return "jolene_ops";
  if (/\b(market|research|signals|labor|hiring)\b/.test(normalized)) return "market_intelligence";
  if (/\b(analytics|metrics|funnel|numbers|performance)\b/.test(normalized)) return "analytics_insight";
  if (/\b(workflow|process|approval|handoff)\b/.test(normalized)) return "workflow_story";
  if (legacyPillar === "architecture") return "architecture_explainer";
  if (legacyPillar === "search_learning") return "analytics_insight";
  if (legacyPillar === "workflow_design") return "workflow_story";
  return "build_log";
}

function promptObligationsFor(intent: LinkedInPromptIntent, prompt: string): PromptObligations {
  const architectureConcepts = ["architecture", "Next.js", "API routes", "agent services", "Prisma/Postgres", "AgentRun", "memory", "approval gates", "LinkedIn publish", "diagram"];
  const baseForbidden = ["practical testbed", "blank page", "boundary matters", "today's content brief", "i would document", "clearest source"];
  if (intent === "architecture_diagram" || intent === "architecture_explainer") {
    return {
      topic: prompt,
      requiredConcepts: architectureConcepts,
      requiredVisuals: intent === "architecture_diagram" ? ["architecture_diagram"] : ["app_screenshot"],
      forbiddenPhrases: [...baseForbidden, "latest run moved through", "drop-off pattern"],
      allowSearchFunnelAnalytics: false,
    };
  }
  if (intent === "analytics_insight") {
    return { topic: prompt, requiredConcepts: ["analytics", "funnel", "aggregate", "insight"], requiredVisuals: ["app_screenshot"], forbiddenPhrases: baseForbidden, allowSearchFunnelAnalytics: true };
  }
  return { topic: prompt, requiredConcepts: [intent.replace(/_/g, " "), "agents", "evidence"], requiredVisuals: ["app_screenshot"], forbiddenPhrases: baseForbidden, allowSearchFunnelAnalytics: false };
}

function buildContentDirection(input: LinkedInContentInput, memoryPack: LinkedInContentMemoryPack): LinkedInContentDirection {
  const prompt = cleanLine(input.prompt || defaultPromptForPillar(input.contentPillar));
  const tone = input.tone ?? "bold_grounded";
  const format = input.format ?? inferFormat(prompt);
  const legacyPillar = input.contentPillar ?? "app_progress";
  const intent = planLinkedInPromptIntent(prompt, legacyPillar);
  const obligations = promptObligationsFor(intent, prompt);
  const visualDirection = cleanLine(input.visualDirection || "");
  const candidates = [
    ...promptAngles(prompt, format),
    ...memoryPack.planSources.slice(0, 4).map((plan) => `${plan.title}: ${plan.summary}`),
    ...memoryPack.storyAngles,
  ].filter(Boolean);
  const scored = candidates
    .map((angle) => ({ angle: cleanLine(angle).slice(0, 180), score: noveltyScore(angle, memoryPack) }))
    .sort((left, right) => right.score - left.score);
  return {
    prompt,
    tone,
    format,
    legacyPillar,
    visualDirection,
    selectedAngle: scored[0]?.angle || "A field note from the Job Search OS build log.",
    rejectedAngles: scored.slice(1, 4).map((item) => item.angle),
    intent,
    obligations,
  };
}

function promptAngles(prompt: string, format: LinkedInContentFormat) {
  return [
    `${formatLabel(format)} about ${prompt}`,
    `What changed in the build after ${prompt}`,
    `The documentarian note hidden inside ${prompt}`,
  ];
}

function noveltyScore(angle: string, memoryPack: LinkedInContentMemoryPack) {
  const normalized = angle.toLowerCase();
  let score = Math.min(80, angle.length);
  for (const phrase of memoryPack.noveltySignals.avoidPhrases) {
    if (normalized.includes(phrase.toLowerCase())) score -= 20;
  }
  for (const hook of memoryPack.noveltySignals.recentHooks) {
    if (sharedWords(normalized, hook.toLowerCase()) >= 4) score -= 12;
  }
  for (const title of memoryPack.noveltySignals.recentTitles) {
    if (sharedWords(normalized, title.toLowerCase()) >= 3) score -= 8;
  }
  if (/\b(plan|decision|field note|walkthrough|teardown|before)\b/i.test(angle)) score += 15;
  return score;
}

function sharedWords(left: string, right: string) {
  const leftWords = new Set(left.split(/[^a-z0-9]+/).filter((word) => word.length > 4));
  return right.split(/[^a-z0-9]+/).filter((word) => leftWords.has(word)).length;
}

function recommendScreenshotRoutes(memoryPack: LinkedInContentMemoryPack, direction?: LinkedInContentDirection) {
  const prompt = [direction?.prompt, direction?.visualDirection, direction?.selectedAngle].join(" ").toLowerCase();
  const scored = memoryPack.screenshotRecommendations
    .filter((item) => allowedScreenshotRoutes.has(item.route))
    .map((item) => {
      const text = `${item.route} ${item.reason}`.toLowerCase();
      let score = 0;
      for (const word of prompt.split(/[^a-z0-9]+/).filter((part) => part.length > 3)) {
        if (text.includes(word)) score += 3;
      }
      if (memoryPack.noveltySignals.recentScreenshotRoutes.includes(item.route)) score -= 8;
      if (item.route.includes("email-ops") && /\b(email|inbox|calendar|jolene)\b/.test(prompt)) score += 12;
      if (item.route.includes("market") && /\bmarket|research|signal\b/.test(prompt)) score += 12;
      if (item.route.includes("social") && /\blinkedin|content|analytics|post\b/.test(prompt)) score += 12;
      if (item.route.includes("runs") && /\bagent|run|document|build\b/.test(prompt)) score += 8;
      return { ...item, score };
    })
    .sort((left, right) => right.score - left.score);
  return scored.length ? scored : memoryPack.screenshotRecommendations.filter((item) => allowedScreenshotRoutes.has(item.route));
}

function selectBestScreenshots(assets: LinkedInScreenshotAsset[], direction: LinkedInContentDirection) {
  const prompt = `${direction.prompt} ${direction.visualDirection} ${direction.selectedAngle}`.toLowerCase();
  const passingDiagrams = assets.filter((asset) => asset.assetType === "diagram" && asset.privacyStatus === "PASS" && asset.path);
  if (direction.obligations.requiredVisuals.includes("architecture_diagram") && passingDiagrams.length) return passingDiagrams.slice(0, 1);
  return assets
    .filter((asset) => asset.privacyStatus === "PASS" && asset.path)
    .map((asset) => {
      const text = `${asset.route} ${asset.description}`.toLowerCase();
      const score = prompt.split(/[^a-z0-9]+/).filter((word) => word.length > 3 && text.includes(word)).length;
      return { asset, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 1)
    .map((item) => item.asset);
}

function diagramHtml(spec: StaffEngineerDiagramSpec) {
  const columns = spec.columns.map((column, index) => `
    <section class="stage" data-diagram-card="${escapeHtml(column.title)}">
      <div class="stageNumber">${String(index + 1).padStart(2, "0")}</div>
      <h2 data-qa-text>${escapeHtml(column.title)}</h2>
      <ul>
        ${column.items.map((item) => `<li data-qa-text>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>
  `).join("");
  const relationships = spec.relationships.map((relationship) => `
    <div class="relationship" data-qa-text>
      <span>${escapeHtml(relationship.from)}</span>
      <strong>${escapeHtml(relationship.label)}</strong>
      <span>${escapeHtml(relationship.to)}</span>
    </div>
  `).join("");
  const callouts = spec.callouts.map((callout) => `<div class="callout" data-qa-text>${escapeHtml(callout)}</div>`).join("");
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            width: 1600px;
            height: 900px;
            overflow: hidden;
            background: #f7f8fb;
            color: #141922;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          .page {
            width: 1600px;
            height: 900px;
            padding: 54px 60px 42px;
            display: grid;
            grid-template-rows: auto 1fr auto;
            gap: 28px;
          }
          header {
            display: grid;
            grid-template-columns: 1fr 280px;
            gap: 28px;
            align-items: start;
          }
          h1 {
            margin: 0 0 12px;
            max-width: 980px;
            font-size: 48px;
            line-height: 1.05;
            font-weight: 760;
            letter-spacing: 0;
            color: #111827;
          }
          .subtitle {
            margin: 0;
            max-width: 1100px;
            color: #4b5563;
            font-size: 22px;
            line-height: 1.35;
            font-weight: 430;
          }
          .badge {
            justify-self: end;
            padding: 12px 14px;
            border: 1px solid #cfd8e3;
            border-radius: 8px;
            background: #ffffff;
            color: #334155;
            font-size: 16px;
            line-height: 1.25;
            font-weight: 520;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(${spec.columns.length}, minmax(0, 1fr));
            gap: 18px;
            min-height: 0;
          }
          .stage {
            position: relative;
            min-width: 0;
            height: 454px;
            padding: 24px 22px 22px;
            border: 1px solid #d6dee9;
            border-top: 5px solid #2563eb;
            border-radius: 8px;
            background: #ffffff;
            overflow: hidden;
            box-shadow: 0 18px 40px rgba(15, 23, 42, 0.07);
          }
          .stageNumber {
            color: #64748b;
            font-size: 13px;
            line-height: 1;
            font-weight: 650;
            margin-bottom: 16px;
          }
          h2 {
            margin: 0 0 18px;
            color: #1d4ed8;
            font-size: 22px;
            line-height: 1.18;
            font-weight: 720;
            letter-spacing: 0;
            overflow-wrap: anywhere;
          }
          ul {
            margin: 0;
            padding: 0;
            list-style: none;
            display: grid;
            gap: 13px;
          }
          li {
            color: #1f2937;
            font-size: 17px;
            line-height: 1.34;
            font-weight: 430;
            overflow-wrap: anywhere;
          }
          li::before {
            content: "";
            display: inline-block;
            width: 7px;
            height: 7px;
            margin: 0 10px 2px 0;
            border-radius: 50%;
            background: #14b8a6;
          }
          .support {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            align-items: stretch;
          }
          .panel {
            min-width: 0;
            padding: 16px 18px;
            border: 1px solid #d6dee9;
            border-radius: 8px;
            background: #ffffff;
          }
          .panelTitle {
            margin: 0 0 10px;
            color: #475569;
            font-size: 13px;
            line-height: 1;
            font-weight: 720;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          .relationship, .callout {
            color: #1f2937;
            font-size: 15px;
            line-height: 1.28;
            font-weight: 430;
            overflow-wrap: anywhere;
          }
          .relationship {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            gap: 10px;
            align-items: center;
            padding: 6px 0;
          }
          .relationship strong {
            color: #0f766e;
            font-size: 13px;
            font-weight: 680;
            white-space: nowrap;
          }
          .callout + .callout { margin-top: 8px; }
          footer {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 24px;
            color: #64748b;
            font-size: 14px;
            line-height: 1.3;
            font-weight: 430;
          }
        </style>
      </head>
      <body>
        <main class="page" role="img" aria-label="${escapeHtml(spec.title)}">
          <header>
            <div>
              <h1 data-qa-text>${escapeHtml(spec.title)}</h1>
              <p class="subtitle" data-qa-text>${escapeHtml(spec.subtitle)}</p>
            </div>
            <div class="badge" data-qa-text>${escapeHtml(spec.designIntent)}</div>
          </header>
          <section>
            <div class="grid">${columns}</div>
            <div class="support">
              <div class="panel">
                <p class="panelTitle">Handoffs</p>
                ${relationships}
              </div>
              <div class="panel">
                <p class="panelTitle">Operating Principles</p>
                ${callouts}
              </div>
            </div>
          </section>
          <footer>
            <span data-qa-text>${escapeHtml(spec.footer)}</span>
            <span data-qa-text>Prepared by the Job Search OS agent content team. No private application details included.</span>
          </footer>
        </main>
      </body>
    </html>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function defaultPromptForPillar(pillar: LinkedInContentPillar = "app_progress") {
  const labels: Record<LinkedInContentPillar, string> = {
    app_progress: "Document the most interesting recent Job Search OS build progress.",
    search_learning: "Explain what the search workflow learned from recent funnel and source signals.",
    architecture: "Document a recent architecture decision and why it matters.",
    workflow_design: "Show how agentic workflow design is changing the way the app gets built.",
  };
  return labels[pillar];
}

function inferFormat(prompt: string): LinkedInContentFormat {
  const normalized = prompt.toLowerCase();
  if (/\b(before|after)\b/.test(normalized)) return "before_after";
  if (/\b(architecture|decision|decided)\b/.test(normalized)) return "decision_diary";
  if (/\b(contrarian|hot take|wrong)\b/.test(normalized)) return "contrarian_take";
  if (/\b(walkthrough|screen|screenshot|visual)\b/.test(normalized)) return "visual_walkthrough";
  if (/\b(teardown|breakdown)\b/.test(normalized)) return "teardown";
  if (/\b(lesson|learned)\b/.test(normalized)) return "lesson";
  if (/\b(thesis|future|strategy)\b/.test(normalized)) return "product_thesis";
  if (/\b(shipped|built|build)\b/.test(normalized)) return "build_log";
  return "field_note";
}

function formatLabel(format: LinkedInContentFormat) {
  return format.replace(/_/g, " ");
}

function hookForFormat(format: LinkedInContentFormat) {
  const hooks: Record<LinkedInContentFormat, string> = {
    build_log: "A build log is more useful when it can argue for what changed.",
    lesson: "The useful lesson was not obvious until the agents had to document it.",
    decision_diary: "One product decision changed how the system explains itself.",
    teardown: "Here is the part of the workflow I would rebuild first.",
    before_after: "The before-and-after is not cosmetic; it is operational.",
    contrarian_take: "The next AI feature I want is less magic and more memory.",
    field_note: "A field note from building an agentic job-search operating system.",
    visual_walkthrough: "The screenshot matters because it shows the workflow, not the pitch.",
    product_thesis: "My current product thesis: the best agents will be documentarians first.",
  };
  return hooks[format];
}

function buildClaims(generated: Pick<LinkedInContentOutput, "body" | "sourceFacts">, memoryPack: LinkedInContentMemoryPack) {
  const facts = new Set(memoryPack.aggregateFacts);
  return generated.sourceFacts.slice(0, 6).map((fact) => ({
    text: fact,
    provenance: facts.has(fact) ? "memory_pack.aggregateFacts" : architectureFact(fact) ? "repo_architecture_context" : "missing",
    status: facts.has(fact) || architectureFact(fact) ? "grounded" as const : "ungrounded" as const,
  }));
}

function architectureFact(value: string) {
  return /^(Architecture context|Architecture plan context):/i.test(value);
}

function selectArchitecturePlanReference(plans: Array<{ title: string; summary: string; themes?: string[] }>) {
  return plans.find((plan) => {
    const text = `${plan.title} ${plan.summary} ${(plan.themes ?? []).join(" ")}`.toLowerCase();
    return /\b(architecture|diagram|system design|agent|jolene|linkedin content|email ops|workflow)\b/.test(text);
  });
}

async function captureRouteScreenshot(route: string, reason: string): Promise<LinkedInScreenshotAsset | null> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const { chromium } = await import("playwright");
    const baseUrl = (process.env.JOB_SEARCH_OS_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
    const dir = path.join(process.cwd(), "public", "generated", "linkedin-content");
    await fs.mkdir(dir, { recursive: true });
    const filename = `${Date.now()}-${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}.png`;
    const filePath = path.join(dir, filename);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, colorScheme: "light" });
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 15_000 });
    await page.addStyleTag({ content: privacyScreenshotCss });
    const pageText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    const warnings = privacyWarnings(pageText);
    await page.screenshot({ path: filePath });
    await browser.close();
    return {
      label: `App screenshot: ${route}`,
      path: `/generated/linkedin-content/${filename}`,
      mimeType: "image/png",
      route,
      description: `Real redacted Job Search OS screenshot for ${reason}`,
      privacyStatus: warnings.length ? "NEEDS_REVIEW" : "PASS",
      warnings,
    };
  } catch (error) {
    return {
      label: `Screenshot unavailable: ${route}`,
      path: "",
      mimeType: "image/png",
      route,
      description: `Unable to capture real app screenshot for ${route}.`,
      privacyStatus: "NEEDS_REVIEW",
      warnings: [error instanceof Error ? error.message : "Screenshot capture failed."],
    };
  }
}

async function persistLinkedInPostDraft(userId: string, run: AgentRun, output: LinkedInContentOutput) {
  return prisma.linkedInPostDraft.create({
    data: {
      userId,
      agentRunId: run.id,
      title: output.title,
      hook: output.hook,
      body: output.body,
      hashtags: output.hashtags as Prisma.InputJsonValue,
      contentPillar: output.contentPillar,
      sourceFacts: output.sourceFacts as Prisma.InputJsonValue,
      screenshotAssets: jsonValue(output.screenshotAssets),
      privacyReview: jsonValue(output.privacyReview),
      disclosureText: output.disclosureText,
      memorySources: jsonValue(output.memorySources),
      analyticsSources: jsonValue(output.analyticsSources),
      agentReviews: jsonValue(output.agentReviews),
      claims: jsonValue(output.claims),
      risks: jsonValue(output.risks),
      selectedScreenshots: jsonValue(output.selectedScreenshots),
      status: output.privacyReview.status === "PASS" ? "DRAFT" : "NEEDS_REVIEW",
    },
  });
}

function normalizeHashtags(values: string[]) {
  const normalized = values
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.startsWith("#") ? value : `#${value.replace(/\s+/g, "")}`)
    .slice(0, 6);
  return normalized.length ? normalized : defaultHashtags;
}

function cleanLine(value: string) {
  return stripUnsafeStyle(value).replace(/\s+/g, " ").trim();
}

function stripUnsafeStyle(value: string) {
  return value.replace(/—/g, "-").replace(/[🚀✨🔥💡]/g, "").trim();
}

function privacyWarnings(value: string) {
  const warnings: string[] = [];
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) warnings.push("Screenshot text may include an email address.");
  if (/\$\s?\d[\d,]*(?:k|K)?\b/.test(value)) warnings.push("Screenshot text may include compensation.");
  if (/\blinkedin\.com\/jobs\/view\/\d+/i.test(value)) warnings.push("Screenshot text may include a LinkedIn job URL.");
  if (/\b(interviewing|applied|offer|rejected)\s+at\s+[A-Z][A-Za-z0-9&.\- ]+/i.test(value)) warnings.push("Screenshot text may include an application outcome with company.");
  return warnings;
}

const privacyScreenshotCss = `
  [data-private], [data-sensitive], input, textarea, [href*="linkedin.com/jobs"], [href^="mailto:"] {
    filter: blur(10px) !important;
  }
`;
