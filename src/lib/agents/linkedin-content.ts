import type { AgentRun, Prisma } from "@prisma/client";
import { z } from "zod";
import { runAgent } from "@/lib/agents/run-agent";
import { buildLinkedInContentMemoryPack, jsonValue, type LinkedInContentMemoryPack } from "@/lib/agents/linkedin-content-memory";
import { createImageGeneration, parseStructuredOutput } from "@/lib/ai/openai";
import type { SearchRunAnalytics } from "@/lib/job-search/run-analytics";
import { prisma } from "@/lib/prisma";
import { syncMaterialClaimsForLinkedInDraft } from "@/lib/trust/material-claims";
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
  layoutKind?: "topology_legend" | "workflow_columns";
  qualityReview?: DiagramQualityReview;
  imageModel?: string;
  sourceSpec?: unknown;
  topologySpec?: unknown;
  provenance?: string[];
  rationale?: string;
  privacyStatus: "PASS" | "NEEDS_REVIEW";
  warnings: string[];
};

export type LinkedInAgentReview = {
  agent:
    | "Assignment Editor"
    | "Evidence Reporter"
    | "Documentary Producer"
    | "Narrative Editor"
    | "Authenticity Reviewer"
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
  promptRelevanceScore: number;
  evidenceAnchors: ContentEvidenceAnchor[];
  rejectedEvidence: ContentEvidenceAnchor[];
};

export type ContentEvidenceAnchor = {
  sourceType: "analytics" | "plan" | "aggregate_fact" | "source_coverage";
  label: string;
  text: string;
  relevance: number;
  sourceRef?: string;
  sourceTitle?: string;
  sourcePath?: string;
};

type LinkedInGeneratedContent = Omit<LinkedInContentOutput, "screenshotAssets" | "selectedScreenshots" | "privacyReview" | "draftId" | "disclosureText" | "memorySources" | "analyticsSources" | "agentReviews" | "claims" | "risks"> & {
  repairAttempt?: "not_needed" | "evidence_anchor_added";
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
    topology?: "PASS" | "NEEDS_REVIEW";
    legend?: "PASS" | "NEEDS_REVIEW";
  };
  warnings: string[];
  reviewedAt: string;
};

export type ArchitectureTopologyGroup = {
  id: string;
  label: string;
  kind: "region" | "boundary" | "layer";
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ArchitectureTopologyNode = {
  id: string;
  label: string;
  icon: string;
  groupId?: string;
  x: number;
  y: number;
};

export type ArchitectureTopologyEdge = {
  from: string;
  to: string;
  label?: string;
  style: "solid" | "dashed" | "bidirectional";
};

export type ArchitectureTopologyLegendItem = {
  number: number;
  title: string;
  bullets: string[];
  color: string;
};

export type ArchitectureTopologySpec = {
  id: string;
  title: string;
  subtitle: string;
  diagramKind: "system_architecture";
  rationale: string;
  designIntent: string;
  groups: ArchitectureTopologyGroup[];
  nodes: ArchitectureTopologyNode[];
  edges: ArchitectureTopologyEdge[];
  legend: ArchitectureTopologyLegendItem[];
  footer: string;
  provenance: string[];
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
      let generated = await generateLinkedInContent({ pillar, memoryPack, direction, model: generationModel });
      const screenshotAssets = await createSafeLinkedInScreenshotAssets(memoryPack, direction);
      const diagramAssets = await createPromptDiagramAssets(direction, diagramImageModel);
      const visualAssets = [...diagramAssets, ...screenshotAssets];
      const selectedScreenshots = selectBestScreenshots(visualAssets, direction);
      generated = repairDraftWithEvidence({ generated, direction });
      generated = withEvidenceSourceFacts(generated, direction);
      const promptReview = reviewPromptSatisfaction({
        generated,
        direction,
        visualAssets,
      });
      const agentReviews = buildAgentReviews(memoryPack, generated, direction, selectedScreenshots, promptReview, visualAssets);
      const claims = buildClaims(generated, memoryPack, direction);
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
}): Promise<LinkedInGeneratedContent> {
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
}): LinkedInGeneratedContent {
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
    promptRelevanceScore: 100,
    evidenceAnchors: [],
    rejectedEvidence: [],
  };
  if (direction.intent === "architecture_diagram" || direction.intent === "architecture_explainer") {
    return buildArchitectureFallback(input.pillar, input.memoryPack, direction);
  }
  const latest = input.memoryPack.analytics.latestSearchRun;
  const evidence = direction.evidenceAnchors[0] ?? fallbackEvidenceAnchor(input.memoryPack, direction);
  const body = documentaryBodyForFormat({
    format: direction.format,
    prompt: direction.prompt,
    angle: direction.selectedAngle,
    evidence,
    latest,
    includeAnalytics: direction.obligations.allowSearchFunnelAnalytics,
  });
  return {
    title: direction.selectedAngle.slice(0, 110),
    hook: hookForFormat(direction.format),
    body,
    hashtags: defaultHashtags,
    contentPillar: input.pillar,
    sourceFacts: input.memoryPack.aggregateFacts,
    mode: "deterministic",
    generationModel: input.model ?? "",
    repairAttempt: bodyIncludesEvidence(body, direction) ? "not_needed" : "evidence_anchor_added",
  };
}

function buildArchitectureFallback(
  pillar: LinkedInContentPillar,
  memoryPack: Pick<LinkedInContentMemoryPack, "aggregateFacts" | "analytics" | "storyAngles" | "planSources" | "noveltySignals">,
  direction: LinkedInContentDirection,
): LinkedInGeneratedContent {
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
    repairAttempt: "not_needed",
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
  const matchedConcepts = input.direction.obligations.requiredConcepts.filter((concept) => conceptMatchesDraft(concept, haystack, input.direction));
  const missingConcepts = input.direction.obligations.requiredConcepts.filter((concept) => !matchedConcepts.includes(concept));
  const forbiddenMatches = input.direction.obligations.forbiddenPhrases.filter((phrase) => haystack.includes(phrase.toLowerCase()));
  const hasRequiredDiagram = !input.direction.obligations.requiredVisuals.includes("architecture_diagram")
    || input.visualAssets.some((asset) => asset.assetType === "diagram" && asset.privacyStatus === "PASS" && asset.path);
  const hasRequiredScreenshot = !input.direction.obligations.requiredVisuals.includes("app_screenshot")
    || input.visualAssets.some((asset) => isPassingAppScreenshot(asset));
  const warnings = [
    ...missingConcepts.map((concept) => `Prompt obligation missing: ${concept}.`),
    ...forbiddenMatches.map((phrase) => `Generic fallback phrase still present: ${phrase}.`),
    ...(hasRequiredDiagram ? [] : ["Architecture prompt requires at least one generated diagram asset."]),
    ...(hasRequiredScreenshot ? [] : ["Prompt requires at least one passing app screenshot asset."]),
  ];
  const conceptScore = Math.round((matchedConcepts.length / Math.max(input.direction.obligations.requiredConcepts.length, 1)) * 80);
  const visualScore = hasRequiredDiagram && hasRequiredScreenshot ? 20 : 0;
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

function isPassingAppScreenshot(asset: LinkedInScreenshotAsset) {
  const route = asset.route.toLowerCase();
  return (asset.assetType === undefined || asset.assetType === "screenshot")
    && asset.privacyStatus === "PASS"
    && Boolean(asset.path)
    && !route.startsWith("diagram:")
    && !route.startsWith("ai-polish:");
}

async function createPromptDiagramAssets(direction: LinkedInContentDirection, imageModel: string): Promise<LinkedInScreenshotAsset[]> {
  if (!direction.obligations.requiredVisuals.includes("architecture_diagram")) return [];
  const topologySpec = buildArchitectureTopologySpec(direction);
  const specs = buildArchitectureDiagramSpecs(direction);
  const assets: LinkedInScreenshotAsset[] = [];
  assets.push(await captureTopologyDiagramAsset(topologySpec));
  for (const spec of specs.filter((item) => item.diagramKind !== "system_architecture")) assets.push(await captureDiagramAsset(spec));
  const polishAsset = await createAiVisualPolishAsset(specs[0], direction, imageModel);
  if (polishAsset) assets.push(polishAsset);
  return assets;
}

export function buildArchitectureTopologySpec(direction: LinkedInContentDirection): ArchitectureTopologySpec {
  return {
    id: "job-search-os-topology",
    title: "Job Search OS Architecture",
    subtitle: "Human intent, orchestration, specialist agents, memory, and external approval gates",
    diagramKind: "system_architecture",
    rationale: "Shows a traditional system topology for architecture prompts instead of a generic stage-card workflow.",
    designIntent: "Traditional architecture map with nested boundaries, compact service nodes, connector labels, and a numbered legend.",
    groups: [
      { id: "experience", label: "Creator-facing app", kind: "layer", x: 50, y: 80, w: 220, h: 500 },
      { id: "control", label: "Control plane", kind: "layer", x: 310, y: 80, w: 260, h: 500 },
      { id: "agents", label: "Agent teams", kind: "region", x: 610, y: 80, w: 300, h: 500 },
      { id: "memory", label: "Durable memory", kind: "boundary", x: 350, y: 620, w: 360, h: 120 },
      { id: "external", label: "External gates", kind: "boundary", x: 750, y: 620, w: 220, h: 120 },
    ],
    nodes: [
      { id: "dashboard", label: "Dashboard", icon: "UI", groupId: "experience", x: 95, y: 150 },
      { id: "linkedin-content", label: "LinkedIn Content", icon: "LI", groupId: "experience", x: 95, y: 300 },
      { id: "settings", label: "Settings", icon: "ST", groupId: "experience", x: 95, y: 450 },
      { id: "api-routes", label: "Next.js API Routes", icon: "API", groupId: "control", x: 365, y: 145 },
      { id: "jolene-loop", label: "Jolene Operating Loop", icon: "JO", groupId: "control", x: 365, y: 295 },
      { id: "approval-gates", label: "Approval Gates", icon: "OK", groupId: "control", x: 365, y: 445 },
      { id: "email-ops", label: "Email Ops Team", icon: "EM", groupId: "agents", x: 660, y: 145 },
      { id: "content-team", label: "Content Team", icon: "CT", groupId: "agents", x: 790, y: 145 },
      { id: "market-search", label: "Market/Search Agents", icon: "MS", groupId: "agents", x: 660, y: 335 },
      { id: "diagram-qa", label: "Diagram QA", icon: "QA", groupId: "agents", x: 790, y: 335 },
      { id: "postgres", label: "Prisma/Postgres", icon: "DB", groupId: "memory", x: 400, y: 665 },
      { id: "agentrun", label: "AgentRun History", icon: "AR", groupId: "memory", x: 560, y: 665 },
      { id: "screenshots", label: "Playwright PNGs", icon: "PNG", groupId: "external", x: 790, y: 665 },
      { id: "linkedin-publish", label: "LinkedIn Publish", icon: "PUB", groupId: "external", x: 900, y: 665 },
    ],
    edges: [
      { from: "dashboard", to: "api-routes", label: "intent", style: "solid" },
      { from: "linkedin-content", to: "api-routes", label: "draft request", style: "solid" },
      { from: "api-routes", to: "jolene-loop", label: "plan", style: "solid" },
      { from: "jolene-loop", to: "email-ops", label: "propose", style: "dashed" },
      { from: "jolene-loop", to: "content-team", label: "brief", style: "solid" },
      { from: "content-team", to: "diagram-qa", label: "visual review", style: "solid" },
      { from: "market-search", to: "agentrun", label: "events", style: "dashed" },
      { from: "email-ops", to: "agentrun", label: "findings", style: "dashed" },
      { from: "content-team", to: "postgres", label: "drafts", style: "solid" },
      { from: "diagram-qa", to: "screenshots", label: "render", style: "solid" },
      { from: "approval-gates", to: "linkedin-publish", label: "approved only", style: "solid" },
      { from: "postgres", to: "api-routes", label: "memory", style: "bidirectional" },
    ],
    legend: [
      { number: 1, title: "Creator-facing surfaces", color: "#c7f9e8", bullets: ["Dashboard, settings, and LinkedIn Content collect human intent.", "The user remains the final approval gate."] },
      { number: 2, title: "Next.js API control plane", color: "#fff0bf", bullets: ["Routes create drafts, run agents, fetch memory, and record approvals.", "No public request shape changes for draft generation."] },
      { number: 3, title: "Jolene orchestration", color: "#e7d7ff", bullets: ["Jolene plans work and refreshes executive context.", "Specialist teams run only after explicit approval."] },
      { number: 4, title: "Specialist agent teams", color: "#ffd7e8", bullets: ["Email Ops, content, market/search, and Diagram QA produce grounded work.", "Every public claim must trace back to stored evidence."] },
      { number: 5, title: "Durable memory", color: "#d8eefc", bullets: ["Prisma/Postgres stores drafts, AgentRun history, analytics, and review records.", "Plans and prior edits become reusable creative memory."] },
      { number: 6, title: "External gates", color: "#ffe3cb", bullets: ["Playwright renders deterministic diagrams and screenshots.", "LinkedIn publishing stays behind approval and privacy review."] },
    ],
    footer: `Prompt: ${direction.prompt}`,
    provenance: ["LinkedIn content prompt", "Repository architecture context", "AgentRun and LinkedInPostDraft data model", "/plans build log"],
  };
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

export function reviewTopologySpecQuality(spec: ArchitectureTopologySpec, layoutWarnings: string[] = []): DiagramQualityReview {
  const warnings: string[] = [];
  const nodeById = new Map(spec.nodes.map((node) => [node.id, node]));
  if (!spec.provenance.length) warnings.push("Topology diagram is missing source provenance.");
  if (!spec.groups.length) warnings.push("Topology diagram is missing architecture boundaries.");
  if (spec.nodes.length > 18) warnings.push("Topology diagram has too many nodes for LinkedIn readability.");
  if (spec.edges.length > 16) warnings.push("Topology diagram has too many connector paths.");
  if (spec.legend.length > 7) warnings.push("Legend has too many explanation cards.");
  for (const node of spec.nodes) {
    if (node.label.length > 30) warnings.push(`Node label is too long: ${node.label}.`);
    if (node.x < 0 || node.y < 0 || node.x > 980 || node.y > 760) warnings.push(`Node is outside topology bounds: ${node.label}.`);
    const group = spec.groups.find((item) => item.id === node.groupId);
    if (group && (node.x < group.x || node.x > group.x + group.w || node.y < group.y || node.y > group.y + group.h)) {
      warnings.push(`Node is outside its group boundary: ${node.label}.`);
    }
  }
  for (const edge of spec.edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) warnings.push(`Connector references an unknown node: ${edge.from} to ${edge.to}.`);
    if ((edge.label ?? "").length > 24) warnings.push(`Connector label is too long: ${edge.label}.`);
  }
  for (const item of spec.legend) {
    if (item.title.length > 42) warnings.push(`Legend title is too long: ${item.title}.`);
    if (item.bullets.length > 2) warnings.push(`Legend card is too dense: ${item.title}.`);
    if (item.bullets.some((bullet) => bullet.length > 98)) warnings.push(`Legend bullet is too long: ${item.title}.`);
  }
  warnings.push(...layoutWarnings);
  const typographyFailed = spec.nodes.some((node) => node.label.length > 30) || spec.legend.some((item) => item.title.length > 42 || item.bullets.some((bullet) => bullet.length > 98));
  const topologyFailed = spec.groups.length === 0 || spec.nodes.length > 18 || spec.edges.length > 16 || spec.nodes.some((node) => node.x < 0 || node.y < 0 || node.x > 980 || node.y > 760);
  const legendFailed = spec.legend.length > 7 || spec.legend.some((item) => item.bullets.length > 2 || item.bullets.some((bullet) => bullet.length > 98));
  const checks = {
    typography: typographyFailed ? "NEEDS_REVIEW" as const : "PASS" as const,
    spacing: topologyFailed || legendFailed ? "NEEDS_REVIEW" as const : "PASS" as const,
    overflow: layoutWarnings.length ? "NEEDS_REVIEW" as const : "PASS" as const,
    contrast: "PASS" as const,
    provenance: spec.provenance.length ? "PASS" as const : "NEEDS_REVIEW" as const,
    topology: topologyFailed ? "NEEDS_REVIEW" as const : "PASS" as const,
    legend: legendFailed ? "NEEDS_REVIEW" as const : "PASS" as const,
  };
  const score = Math.max(0, 100 - warnings.length * 10);
  return {
    status: warnings.length ? "NEEDS_REVIEW" : "PASS",
    score,
    checks,
    warnings,
    reviewedAt: new Date().toISOString(),
  };
}

async function captureTopologyDiagramAsset(spec: ArchitectureTopologySpec): Promise<LinkedInScreenshotAsset> {
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
    await page.setContent(topologyDiagramHtml(spec), { waitUntil: "load" });
    const layoutWarnings = await page.evaluate(() => {
      const warnings: string[] = [];
      document.querySelectorAll<HTMLElement>("[data-topology-node]").forEach((element) => {
        if (element.scrollHeight > element.clientHeight + 2 || element.scrollWidth > element.clientWidth + 2) {
          warnings.push(`Topology node overflow: ${element.dataset.topologyNode || "unknown"}.`);
        }
      });
      document.querySelectorAll<HTMLElement>("[data-legend-card]").forEach((element) => {
        if (element.scrollHeight > element.clientHeight + 2 || element.scrollWidth > element.clientWidth + 2) {
          warnings.push(`Legend card overflow: ${element.dataset.legendCard || "unknown"}.`);
        }
      });
      document.querySelectorAll<HTMLElement>("[data-qa-text]").forEach((element) => {
        if (element.scrollWidth > element.clientWidth + 2) {
          warnings.push(`Text overflow: ${element.textContent?.trim() || "unknown"}.`);
        }
      });
      return warnings;
    });
    const qualityReview = reviewTopologySpecQuality(spec, layoutWarnings);
    await page.screenshot({ path: filePath, fullPage: true });
    await browser.close();
    return {
      label: `Topology diagram: ${spec.title}`,
      path: `/generated/linkedin-content/${filename}`,
      mimeType: "image/png",
      route: `diagram:${spec.id}`,
      assetType: "diagram",
      diagramKind: spec.diagramKind,
      renderEngine: "architecture-topology-v1",
      layoutKind: "topology_legend",
      description: spec.subtitle,
      rationale: spec.rationale,
      qualityReview,
      sourceSpec: spec,
      topologySpec: spec,
      provenance: spec.provenance,
      privacyStatus: qualityReview.status,
      warnings: qualityReview.warnings,
    };
  } catch (error) {
    const qualityReview = reviewTopologySpecQuality(spec, [error instanceof Error ? error.message : "Topology diagram generation failed."]);
    return {
      label: `Topology diagram unavailable: ${spec.title}`,
      path: "",
      mimeType: "image/png",
      route: `diagram:${spec.id}`,
      assetType: "diagram",
      diagramKind: spec.diagramKind,
      renderEngine: "architecture-topology-v1",
      layoutKind: "topology_legend",
      description: spec.subtitle,
      rationale: spec.rationale,
      qualityReview,
      sourceSpec: spec,
      topologySpec: spec,
      provenance: spec.provenance,
      privacyStatus: "NEEDS_REVIEW",
      warnings: [error instanceof Error ? error.message : "Topology diagram generation failed."],
    };
  }
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
      layoutKind: "workflow_columns",
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
      layoutKind: "workflow_columns",
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
      layoutKind: "workflow_columns",
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
    layoutKind: "workflow_columns",
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
  generated: Pick<LinkedInGeneratedContent, "title" | "body" | "mode" | "repairAttempt">,
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
  const selectedEvidence = direction.evidenceAnchors[0];
  return [
    { agent: "Assignment Editor", summary: `Prompt: ${direction.prompt}`, recommendation: `Primary assignment score ${direction.promptRelevanceScore}/100. Selected angle: ${direction.selectedAngle}.`, metadata: { prompt: direction.prompt, promptRelevanceScore: direction.promptRelevanceScore, selectedAngle: direction.selectedAngle, rejectedAngles: direction.rejectedAngles } },
    { agent: "Evidence Reporter", summary: selectedEvidence ? `${selectedEvidence.label}: ${selectedEvidence.text}` : "No strong evidence anchor selected.", recommendation: selectedEvidence ? `Use ${selectedEvidence.sourceType} evidence because it is the closest source to the prompt.` : "Do not publish until the draft has a concrete source anchor.", metadata: { selectedEvidence, rejectedEvidence: direction.rejectedEvidence } },
    { agent: "Documentary Producer", summary: `Format: ${direction.format}.`, recommendation: "Build the post around scene, evidence, decision, consequence, artifact, and takeaway instead of a generic build-log template." },
    { agent: "Narrative Editor", summary: generated.repairAttempt === "evidence_anchor_added" ? "A deterministic evidence repair was applied." : "No deterministic evidence repair was needed.", recommendation: "Avoid repeated hooks, stale build-log openings, and documentarian-loop filler.", metadata: { repairAttempt: generated.repairAttempt ?? "not_needed" } },
    { agent: "Authenticity Reviewer", summary: promptReview.warnings.length ? promptReview.warnings.join(" ") : "Draft has prompt evidence and passes public-safety shape checks.", recommendation: "Keep the post candid, concrete, and grounded in the selected artifact." },
    { agent: "Narrative Strategist", summary: `Prompt: ${direction.prompt}`, recommendation: `Intent: ${direction.intent}. Selected angle: ${direction.selectedAngle}. Rejected: ${direction.rejectedAngles.join(" | ") || "none"}.`, metadata: { prompt: direction.prompt, intent: direction.intent, format: direction.format, selectedAngle: direction.selectedAngle, rejectedAngles: direction.rejectedAngles } },
    { agent: "Documentarian", summary: memoryPack.recentDecisions.slice(0, 2).join(" "), recommendation: `Use plan memory and build evidence, including ${memoryPack.planSources.slice(0, 2).map((plan) => plan.title).join(", ") || "recent app work"}.` },
    { agent: "Editorial Challenger", summary: `Avoid recent phrases: ${memoryPack.noveltySignals.avoidPhrases.join(", ")}.`, recommendation: "Do not reuse the same future-CMS/operating-system framing unless the prompt explicitly asks for it." },
    { agent: "Prompt Fidelity Reviewer", summary: `Prompt match ${promptReview.score}/100, ${promptReview.status.toLowerCase().replace(/_/g, " ")}.`, recommendation: promptReview.warnings.length ? promptReview.warnings.join(" ") : "Draft satisfies the prompt obligations.", metadata: { ...promptReview, generationMode: generated.mode, obligations: direction.obligations } },
    { agent: "Analytics Narrator", summary: latest ? `Latest funnel has ${latest.funnel.length} stages and ${latest.drops.length} visible drop-off reasons.` : "No latest search analytics are available.", recommendation: "Use aggregate funnel numbers only." },
    { agent: "Product Strategist", summary: memoryPack.storyAngles[0] ?? "The product angle is creator workflow memory.", recommendation: "Frame this as a content operating system learning from its own work." },
    { agent: "Editor", summary: `Draft title: ${generated.title}.`, recommendation: "Keep the post concrete, non-hype, and readable without internal app knowledge." },
    { agent: "Technical Documentation Architect", summary: direction.intent.includes("architecture") ? `Architecture brief: ${direction.obligations.topic}` : "No technical diagram brief required for this prompt.", recommendation: "Use repo-level systems, memory, approval gates, and provenance as the diagram's source of truth.", metadata: { requiredConcepts: direction.obligations.requiredConcepts, requiredVisuals: direction.obligations.requiredVisuals } },
    { agent: "Diagram Systems Designer", summary: diagramAssets.length ? `${diagramAssets.length} deterministic technical diagram asset(s) generated.` : "No deterministic technical diagram generated.", recommendation: "Prefer the deterministic technical diagram for exact labels and system documentation.", metadata: { diagramAssets: diagramAssets.map((asset) => ({ label: asset.label, diagramKind: asset.diagramKind, renderEngine: asset.renderEngine, layoutKind: asset.layoutKind, provenance: asset.provenance })) } },
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
  if (/\b(analytics|metrics|funnel|numbers|performance|chart|charts|graph|graphs|search operations|search ops|digest)\b/.test(normalized)) return "analytics_insight";
  if (/\b(workflow|process|approval|handoff)\b/.test(normalized)) return "workflow_story";
  if (legacyPillar === "architecture") return "architecture_explainer";
  if (legacyPillar === "search_learning") return "analytics_insight";
  if (legacyPillar === "workflow_design") return "workflow_story";
  return "build_log";
}

function promptObligationsFor(intent: LinkedInPromptIntent, prompt: string): PromptObligations {
  const architectureConcepts = ["architecture", "Next.js", "API routes", "agent services", "Prisma/Postgres", "AgentRun", "memory", "approval gates", "LinkedIn publish", "diagram"];
  const baseForbidden = ["practical testbed", "blank page", "boundary matters", "today's content brief", "i would document", "clearest source", "one plan in the build log keeps pulling me back", "documentarian loop"];
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
  const evidence = selectContentEvidence(memoryPack, { prompt, intent });
  const candidates = [
    ...promptAngles(prompt, format),
    ...evidence.selected.filter((item) => item.sourceType === "plan").map((item) => `${item.label}: ${item.text}`),
    ...memoryPack.storyAngles,
  ].filter(Boolean);
  const scored = candidates
    .map((angle) => ({ angle: cleanLine(angle).slice(0, 180), score: noveltyScore(angle, memoryPack) + promptRelevanceScore(angle, prompt, intent) * 3 }))
    .sort((left, right) => right.score - left.score);
  const selectedAngle = scored[0]?.angle || "A field note from the Job Search OS build log.";
  return {
    prompt,
    tone,
    format,
    legacyPillar,
    visualDirection,
    selectedAngle,
    rejectedAngles: scored.slice(1, 4).map((item) => item.angle),
    intent,
    obligations,
    promptRelevanceScore: Math.round(promptRelevanceScore(selectedAngle, prompt, intent)),
    evidenceAnchors: evidence.selected,
    rejectedEvidence: evidence.rejected,
  };
}

function promptAngles(prompt: string, format: LinkedInContentFormat) {
  const topic = cleanPromptTopic(prompt);
  if (format === "before_after") {
    return [
      `Search Operations charts before and after`,
      `What changed when ${topic} became the artifact`,
      `Why the chart upgrade is easier to read`,
    ];
  }
  if (format === "visual_walkthrough") {
    return [
      `A visual walkthrough of ${topic}`,
      `What the Search Operations dashboard now makes easier to see`,
      `The chart upgrade as a product decision`,
    ];
  }
  return [
    `${humanFormatLabel(format)} on ${topic}`,
    `What changed when ${topic}`,
    `The product note inside ${topic}`,
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

function selectContentEvidence(
  memoryPack: Pick<LinkedInContentMemoryPack, "aggregateFacts" | "analytics" | "planSources">,
  direction: { prompt: string; intent: LinkedInPromptIntent },
) {
  const latest = memoryPack.analytics.latestSearchRun;
  const candidates: ContentEvidenceAnchor[] = [];
  if (latest && direction.intent === "analytics_insight") {
    candidates.push({
      sourceType: "analytics",
      label: "Search Operations analytics",
      text: `Latest Search Operations run: ${latest.funnel.map((item) => `${item.label} ${item.value}`).join(", ")}; top blocker ${latest.topBlocker ? `${latest.topBlocker.label} ${latest.topBlocker.value}` : "none recorded"}.`,
      relevance: 95,
      sourceRef: "analytics.latestSearchRun",
      sourceTitle: "Latest Search Operations run",
    });
  }
  for (const [index, fact] of memoryPack.aggregateFacts.slice(0, 8).entries()) {
    candidates.push({
      sourceType: "aggregate_fact",
      label: factLabel(fact),
      text: fact,
      relevance: promptRelevanceScore(fact, direction.prompt, direction.intent),
      sourceRef: `memoryPack.aggregateFacts[${index}]`,
      sourceTitle: factLabel(fact),
    });
  }
  for (const plan of memoryPack.planSources.slice(0, 10)) {
    const text = `${plan.title}: ${plan.summary}`;
    candidates.push({
      sourceType: "plan",
      label: plan.title,
      text: plan.summary,
      relevance: promptRelevanceScore(text, direction.prompt, direction.intent),
      sourceRef: `plan:${plan.filename}`,
      sourceTitle: plan.title,
      sourcePath: `plans/${plan.filename}`,
    });
  }
  const sorted = candidates
    .filter((item) => item.text.trim())
    .sort((left, right) => right.relevance - left.relevance);
  return {
    selected: sorted.filter((item) => item.relevance >= 20).slice(0, 3),
    rejected: sorted.filter((item) => item.relevance < 20).slice(0, 4),
  };
}

function promptRelevanceScore(text: string, prompt: string, intent: LinkedInPromptIntent) {
  const normalized = text.toLowerCase();
  const promptWords = keywordSet(prompt);
  let score = 0;
  for (const word of promptWords) {
    if (normalized.includes(word)) score += 8;
  }
  if (intent === "analytics_insight" && /\b(search|operations|ops|chart|charts|graph|graphs|analytics|funnel|qualified|saved|run|runs|blocker)\b/.test(normalized)) score += 35;
  if (intent === "email_ops" && /\b(email|gmail|inbox|calendar|interview|scheduling)\b/.test(normalized)) score += 35;
  if (intent === "jolene_ops" && /\b(jolene|chief of staff|standup|delegated)\b/.test(normalized)) score += 35;
  if (intent === "market_intelligence" && /\b(market|research|signal|labor|hiring)\b/.test(normalized)) score += 35;
  if (intent === "workflow_story" && /\b(workflow|approval|handoff|review|gate)\b/.test(normalized)) score += 30;
  if (intent.startsWith("architecture") && /\b(architecture|diagram|system|agent|prisma|api|router)\b/.test(normalized)) score += 35;
  if (intent === "analytics_insight" && /\b(email ops|gmail|calendar|source management|company-source)\b/.test(normalized)) score -= 35;
  return clampNumber(Math.round(score), 0, 100);
}

function keywordSet(value: string) {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 4 && !["about", "would", "could", "there", "their", "because"].includes(word)));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function factLabel(fact: string) {
  return fact.split(":")[0].replace(/\.$/, "").slice(0, 80) || "Aggregate fact";
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

function topologyDiagramHtml(spec: ArchitectureTopologySpec) {
  const nodeById = new Map(spec.nodes.map((node) => [node.id, node]));
  const groups = spec.groups.map((group) => `
    <section class="topologyGroup ${escapeHtml(group.kind)}" style="left:${group.x}px;top:${group.y}px;width:${group.w}px;height:${group.h}px;">
      <span data-qa-text>${escapeHtml(group.label)}</span>
    </section>
  `).join("");
  const edges = spec.edges.flatMap((edge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) return [];
    const x1 = from.x + 52;
    const y1 = from.y + 35;
    const x2 = to.x + 52;
    const y2 = to.y + 35;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 - 8;
    const dash = edge.style === "dashed" ? `stroke-dasharray="8 7"` : "";
    const reverse = edge.style === "bidirectional" ? `marker-start="url(#arrowStart)"` : "";
    return [`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="edgeLine" ${dash} ${reverse} marker-end="url(#arrowEnd)" />${edge.label ? `<text x="${mx}" y="${my}" class="edgeLabel">${escapeHtml(edge.label)}</text>` : ""}`];
  }).join("");
  const nodes = spec.nodes.map((node) => `
    <article class="topologyNode" data-topology-node="${escapeHtml(node.label)}" style="left:${node.x}px;top:${node.y}px;">
      <div class="nodeIcon">${escapeHtml(node.icon)}</div>
      <div class="nodeLabel" data-qa-text>${escapeHtml(node.label)}</div>
    </article>
  `).join("");
  const legend = spec.legend.map((item) => `
    <article class="legendCard" data-legend-card="${escapeHtml(item.title)}" style="background:${escapeHtml(item.color)};">
      <h2 data-qa-text>${item.number}. ${escapeHtml(item.title)}</h2>
      <ul>
        ${item.bullets.map((bullet) => `<li data-qa-text>${escapeHtml(bullet)}</li>`).join("")}
      </ul>
    </article>
  `).join("");
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
            color: #172033;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background:
              radial-gradient(circle at 1px 1px, rgba(15, 23, 42, 0.12) 1px, transparent 0) 0 0 / 18px 18px,
              #f8fafc;
          }
          .page {
            width: 1600px;
            height: 900px;
            padding: 34px 46px 36px;
            display: grid;
            grid-template-columns: 1010px 1fr;
            gap: 34px;
          }
          .left {
            display: grid;
            grid-template-rows: auto 1fr auto;
            min-width: 0;
          }
          .titleBlock {
            width: 420px;
            margin: 0 0 18px;
            padding: 18px 22px;
            background: rgba(255, 255, 255, 0.92);
            box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
          }
          h1 {
            margin: 0 0 8px;
            font-size: 27px;
            line-height: 1.12;
            font-weight: 760;
            letter-spacing: 0;
          }
          .subtitle {
            margin: 0;
            color: #475569;
            font-size: 13px;
            line-height: 1.35;
            font-weight: 430;
          }
          .map {
            position: relative;
            width: 1010px;
            height: 770px;
            border: 2px solid rgba(15, 23, 42, 0.58);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.82);
            overflow: hidden;
          }
          .topologyGroup {
            position: absolute;
            border: 2px solid #93c5fd;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.52);
          }
          .topologyGroup.boundary { border-color: #86efac; }
          .topologyGroup.region { border-color: #a5b4fc; }
          .topologyGroup span {
            position: absolute;
            left: 10px;
            top: 8px;
            color: #0369a1;
            font-size: 12px;
            line-height: 1;
            font-weight: 760;
          }
          .edgeSvg {
            position: absolute;
            inset: 0;
            width: 1010px;
            height: 770px;
            pointer-events: none;
          }
          .edgeLine {
            stroke: #475569;
            stroke-width: 1.8;
            fill: none;
          }
          .edgeLabel {
            paint-order: stroke;
            stroke: rgba(255, 255, 255, 0.9);
            stroke-width: 5px;
            fill: #334155;
            font-size: 11px;
            line-height: 1;
            font-weight: 650;
            text-anchor: middle;
          }
          .topologyNode {
            position: absolute;
            width: 104px;
            min-height: 78px;
            display: grid;
            justify-items: center;
            gap: 6px;
            padding: 0 4px;
            overflow: hidden;
          }
          .nodeIcon {
            width: 43px;
            height: 43px;
            display: grid;
            place-items: center;
            border-radius: 10px;
            color: #ffffff;
            background: linear-gradient(135deg, #7c3aed, #06b6d4);
            box-shadow: 0 10px 20px rgba(15, 23, 42, 0.16);
            font-size: 12px;
            line-height: 1;
            font-weight: 800;
          }
          .nodeLabel {
            max-width: 104px;
            color: #111827;
            font-size: 11px;
            line-height: 1.13;
            font-weight: 760;
            text-align: center;
            overflow-wrap: anywhere;
          }
          .footer {
            margin-top: 8px;
            color: #64748b;
            font-size: 11px;
            line-height: 1.25;
          }
          .legend {
            display: grid;
            gap: 12px;
            align-content: start;
            padding-top: 52px;
          }
          .legendCard {
            min-height: 90px;
            padding: 11px 14px 10px;
            border: 1px solid rgba(15, 23, 42, 0.08);
            overflow: hidden;
          }
          .legendCard h2 {
            margin: 0 0 6px;
            color: #172033;
            font-size: 17px;
            line-height: 1.08;
            font-weight: 760;
            letter-spacing: 0;
          }
          .legendCard ul {
            margin: 0;
            padding-left: 18px;
          }
          .legendCard li {
            color: #263245;
            font-size: 14px;
            line-height: 1.18;
            font-weight: 430;
            margin: 2px 0;
          }
        </style>
      </head>
      <body>
        <main class="page" role="img" aria-label="${escapeHtml(spec.title)}">
          <section class="left">
            <header class="titleBlock">
              <h1 data-qa-text>${escapeHtml(spec.title)}</h1>
              <p class="subtitle" data-qa-text>${escapeHtml(spec.subtitle)}</p>
            </header>
            <section class="map">
              ${groups}
              <svg class="edgeSvg" viewBox="0 0 1010 770" aria-hidden="true">
                <defs>
                  <marker id="arrowEnd" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" fill="#475569"></path>
                  </marker>
                  <marker id="arrowStart" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto">
                    <path d="M8,0 L0,4 L8,8 Z" fill="#475569"></path>
                  </marker>
                </defs>
                ${edges}
              </svg>
              ${nodes}
            </section>
            <footer class="footer" data-qa-text>${escapeHtml(spec.footer)} | Prepared by the Job Search OS agent content team. No private application details included.</footer>
          </section>
          <aside class="legend">${legend}</aside>
        </main>
      </body>
    </html>
  `;
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

function humanFormatLabel(format: LinkedInContentFormat) {
  return format.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hookForFormat(format: LinkedInContentFormat) {
  const hooks: Record<LinkedInContentFormat, string> = {
    build_log: "A build log only works when it shows the artifact.",
    lesson: "The useful lesson came from the evidence, not the slogan.",
    decision_diary: "One product decision changed what the system had to prove.",
    teardown: "The part worth tearing down was the part that hid the signal.",
    before_after: "The before-and-after is operational, not cosmetic.",
    contrarian_take: "The next AI feature I want is less magic and more receipts.",
    field_note: "Field note: the post got better when the agent had to show its source.",
    visual_walkthrough: "The screenshot matters when it changes the explanation.",
    product_thesis: "My current product thesis: agents need evidence before voice.",
  };
  return hooks[format];
}

function documentaryBodyForFormat(input: {
  format: LinkedInContentFormat;
  prompt: string;
  angle: string;
  evidence: ContentEvidenceAnchor;
  latest: SearchRunAnalytics | null;
  includeAnalytics: boolean;
}) {
  const scene = sceneForPrompt(input.prompt);
  const angle = angleLine(input.angle);
  const evidence = evidenceLine(input.evidence);
  const artifact = artifactLine(input);
  const decision = decisionLine(input.format);
  const consequence = consequenceLine(input.format);
  const takeaway = takeawayLine(input.format);
  const analyticsLine = input.includeAnalytics && input.latest?.drops.length
    ? `The useful signal is the blocker view: ${input.latest.drops.slice(0, 3).map((item) => `${item.label.toLowerCase()} ${item.value}`).join(", ")}. That is the difference between a chart that looks busy and a chart that tells you what to fix next.`
    : "";
  const structures: Record<LinkedInContentFormat, string[]> = {
    build_log: [scene, angle, evidence, decision, artifact, consequence, takeaway],
    lesson: [scene, angle, evidence, takeaway, artifact, consequence],
    decision_diary: [scene, angle, decision, evidence, consequence, artifact, takeaway],
    teardown: [scene, angle, "The weak version flattened the work into generic narration.", evidence, decision, artifact, consequence],
    before_after: [scene, angle, "Before, the chart story was basically a conversion line: a lot came in, a tiny amount survived, and the user had to infer the rest.", "After, the dashboard has to explain where the run went, what blocked value, which source/profile worked, and what the next action should be.", evidence, analyticsLine || artifact, takeaway],
    contrarian_take: [scene, angle, "Public AI content should start with receipts, not personality.", evidence, decision, consequence, takeaway],
    field_note: [scene, angle, evidence, artifact, consequence, takeaway],
    visual_walkthrough: [scene, angle, artifact, evidence, analyticsLine || decision, consequence, takeaway],
    product_thesis: [scene, angle, "Content agents get useful when they behave like documentary producers.", evidence, decision, consequence, takeaway],
  };
  return structures[input.format].filter(Boolean).join("\n\n");
}

function angleLine(angle: string) {
  if (/\bsearch operations charts before and after\b/i.test(angle)) {
    return "The before-and-after is straightforward: the dashboard needs to explain why a run worked, not just how much it shrank.";
  }
  return `The useful angle is ${angle.replace(/[.?!]+$/, "")}.`;
}

function sceneForPrompt(prompt: string) {
  if (/\b(search operations|graphs|charts|dashboard)\b/i.test(prompt)) {
    return "The Search Operations page had a real comprehension problem: the old charts showed a run shrinking, but they did not make the next action obvious.";
  }
  return `I wanted to explain ${cleanPromptTopic(prompt)} without turning it into a generic progress update.`;
}

function cleanPromptTopic(prompt: string) {
  return prompt
    .replace(/\b(can we discuss|write|create|draft|post|explain|document|show|i would like|please)\b/gi, "")
    .replace(/\b(a|an|the)\s+(decision diary|field note|lesson|post|draft)\s+(about|on)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:,-]+|[\s?.!]+$/g, "")
    || "the selected product work";
}

function artifactLine(input: { evidence: ContentEvidenceAnchor; latest: SearchRunAnalytics | null; includeAnalytics: boolean }) {
  if (input.includeAnalytics && input.latest) {
    return `The Search Operations dashboard now has to make ${input.latest.stats.jobsAfterFilters} qualified jobs, ${input.latest.stats.jobsSaved} saved matches, and ${input.latest.topBlocker?.label.toLowerCase() ?? "the top blocker"} understandable at a glance.`;
  }
  if (input.evidence.sourceType === "plan") return `The plan source is ${input.evidence.label}, used as supporting context rather than the whole story.`;
  return `The selected source is ${input.evidence.label}, which gives the post a concrete source to stand on.`;
}

function evidenceLine(evidence: ContentEvidenceAnchor) {
  if (evidence.sourceType === "analytics") return `The run I am using as the receipt: ${evidence.text}`;
  if (evidence.sourceType === "plan") return `The build-log anchor is ${evidence.label}: ${evidence.text}`;
  return `The artifact behind this note is ${evidence.text}`;
}

function decisionLine(format: LinkedInContentFormat) {
  if (format === "visual_walkthrough") return "The product decision was to make the visual explain the user's next decision instead of decorating the post.";
  if (format === "teardown") return "The fix was to remove the vague narrative frame and force the draft to name the evidence.";
  return "The decision was to treat the prompt as the assignment and the build log as source material, not as a random quote generator.";
}

function consequenceLine(format: LinkedInContentFormat) {
  if (format === "product_thesis") return "The content system becomes more believable because it can show why this story was selected.";
  if (format === "before_after") return "That gives the reader a real before-and-after: what changed, why it changed, and which artifact proves it.";
  return "The draft gets more specific, less repetitive, and easier to review before anything goes public.";
}

function takeawayLine(format: LinkedInContentFormat) {
  if (format === "lesson") return "Better agent content is not louder. It is better sourced.";
  if (format === "contrarian_take") return "If an agent cannot cite the artifact, it should not get a polished voice.";
  return "The durable pattern is simple: scene first, evidence second, opinion last.";
}

function fallbackEvidenceAnchor(
  memoryPack: Pick<LinkedInContentMemoryPack, "aggregateFacts" | "analytics" | "planSources">,
  direction: LinkedInContentDirection,
): ContentEvidenceAnchor {
  return selectContentEvidence(memoryPack, direction).selected[0] ?? {
    sourceType: "plan",
    label: memoryPack.planSources[0]?.title ?? "Content memory",
    text: memoryPack.planSources[0] ? `${memoryPack.planSources[0].title}: ${memoryPack.planSources[0].summary}` : "The memory pack did not expose a strong source match, so this draft should stay review-only until a concrete artifact is selected.",
    relevance: 0,
  };
}

function repairDraftWithEvidence(input: { generated: LinkedInGeneratedContent; direction: LinkedInContentDirection }): LinkedInGeneratedContent {
  if (bodyIncludesEvidence(input.generated.body, input.direction)) {
    return { ...input.generated, repairAttempt: input.generated.repairAttempt ?? "not_needed" };
  }
  const anchor = input.direction.evidenceAnchors[0];
  if (!anchor) return input.generated;
  return {
    ...input.generated,
    body: `${input.generated.body}\n\n${evidenceLine(anchor)}`,
    repairAttempt: "evidence_anchor_added",
  };
}

function bodyIncludesEvidence(body: string, direction: LinkedInContentDirection) {
  const normalized = body.toLowerCase();
  return direction.evidenceAnchors.some((anchor) => {
    const anchorText = `${anchor.label} ${anchor.text}`;
    if (anchor.sourceType === "analytics") return analyticsAnchorMatches(normalized, anchorText);
    if (anchor.sourceType === "plan") return planAnchorMatches(normalized, anchor);
    const anchorWords = distinctiveWords(anchorText).slice(0, 8);
    if (!anchorWords.length) return false;
    const matches = anchorWords.filter((word) => normalized.includes(word)).length;
    return matches >= Math.max(3, Math.ceil(anchorWords.length * 0.5));
  });
}

function conceptMatchesDraft(concept: string, haystack: string, direction: LinkedInContentDirection) {
  if (concept.toLowerCase() === "evidence") return bodyIncludesEvidence(haystack, direction);
  if (concept.toLowerCase() === "analytics") return /\b(analytics|funnel|qualified|saved|run|blocker|metric|chart|graph)\b/.test(haystack);
  if (concept.toLowerCase() === "funnel") return /\b(funnel|fetched|qualified|saved|agency eligible|new matches|scored|detail candidates)\b/.test(haystack);
  if (concept.toLowerCase() === "aggregate") return /\b(aggregate|funnel|qualified|saved|run|blocker|metric|chart|graph|fetched|matches)\b/.test(haystack);
  if (concept.toLowerCase() === "insight") return /\b(insight|signal|means|shows|because|digest|understandable)\b/.test(haystack);
  return haystack.includes(concept.toLowerCase());
}

function analyticsAnchorMatches(normalizedBody: string, anchorText: string) {
  const metrics = anchorText.match(/\b[A-Z][A-Za-z ]+\s+\d[\d,]*/g) ?? [];
  if (metrics.some((metric) => normalizedBody.includes(metric.toLowerCase()))) return true;
  const numbers = anchorText.match(/\b\d[\d,]*\b/g) ?? [];
  const labels = distinctiveWords(anchorText).filter((word) => /fetched|qualified|saved|matches|agency|eligible|blocker|scored|candidates/.test(word));
  return numbers.some((number) => normalizedBody.includes(number.toLowerCase()))
    && labels.some((label) => normalizedBody.includes(label));
}

function planAnchorMatches(normalizedBody: string, anchor: ContentEvidenceAnchor) {
  if (normalizedBody.includes(anchor.label.toLowerCase())) return true;
  const words = distinctiveWords(anchor.text).slice(0, 10);
  if (!words.length) return false;
  const matches = words.filter((word) => normalizedBody.includes(word)).length;
  return matches >= Math.max(3, Math.ceil(words.length * 0.45));
}

function distinctiveWords(value: string) {
  return [...keywordSet(value)].filter((word) => ![
    "latest",
    "source",
    "evidence",
    "grounded",
    "receipt",
    "draft",
    "content",
    "build",
    "about",
    "because",
  ].includes(word));
}

function withEvidenceSourceFacts(generated: LinkedInGeneratedContent, direction: LinkedInContentDirection): LinkedInGeneratedContent {
  const sourceFacts = uniqueStrings([
    ...generated.sourceFacts,
    ...direction.evidenceAnchors.map((anchor) => evidenceSourceFact(anchor)),
  ]).slice(0, 12);
  return { ...generated, sourceFacts };
}

function evidenceSourceFact(anchor: ContentEvidenceAnchor) {
  const ref = anchor.sourceRef ? ` (${anchor.sourceRef})` : "";
  return `${anchor.label}${ref}: ${anchor.text}`;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function buildClaims(generated: Pick<LinkedInContentOutput, "body" | "sourceFacts">, memoryPack: LinkedInContentMemoryPack, direction?: LinkedInContentDirection) {
  const facts = new Set(memoryPack.aggregateFacts);
  const evidenceFacts = new Map((direction?.evidenceAnchors ?? []).map((anchor) => [evidenceSourceFact(anchor), evidenceProvenance(anchor)]));
  const sourceClaims = generated.sourceFacts.slice(0, 8).map((fact) => ({
    text: fact,
    provenance: facts.has(fact)
      ? "memory_pack.aggregateFacts"
      : evidenceFacts.get(fact) ?? (architectureFact(fact) ? "repo_architecture_context" : "missing"),
    status: facts.has(fact) || evidenceFacts.has(fact) || architectureFact(fact) ? "grounded" as const : "ungrounded" as const,
  }));
  const bodyClaims = bodyClaimCandidates(generated.body).map((claim) => {
    const provenance = bodyClaimProvenance(claim, generated.sourceFacts, memoryPack, direction);
    return {
      text: claim,
      provenance,
      status: provenance === "missing" ? "ungrounded" as const : "grounded" as const,
    };
  });
  return uniqueClaims([...sourceClaims, ...bodyClaims]).slice(0, 12);
}

function evidenceProvenance(anchor: ContentEvidenceAnchor) {
  if (anchor.sourceRef) return anchor.sourceRef;
  return anchor.sourceType;
}

function bodyClaimCandidates(body: string) {
  return body
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim().replace(/\s+/g, " "))
    .filter((sentence) => sentence.length >= 20 && isFactualPublicClaim(sentence));
}

function isFactualPublicClaim(sentence: string) {
  return /\b\d[\d,]*\b/.test(sentence)
    || /\b(Next\.js|Prisma|Postgres|AgentRun|AgentRunEvent|LinkedIn|API|route handlers?|dashboard|screenshots?|publishing|approval gates?|drafts?|memory pack|search operations|qualified jobs?|saved matches?)\b/i.test(sentence);
}

function bodyClaimProvenance(claim: string, sourceFacts: string[], memoryPack: LinkedInContentMemoryPack, direction?: LinkedInContentDirection) {
  const normalized = claim.toLowerCase();
  const sources = [
    ...sourceFacts.map((fact) => ({ text: fact, provenance: memoryPack.aggregateFacts.includes(fact) ? "memory_pack.aggregateFacts" : "sourceFacts" })),
    ...(direction?.evidenceAnchors ?? []).map((anchor) => ({ text: `${anchor.label} ${anchor.text}`, provenance: evidenceProvenance(anchor) })),
  ];
  for (const source of sources) {
    if (textOverlapScore(normalized, source.text.toLowerCase()) >= 0.35) return source.provenance;
  }
  if (architectureFact(claim) || architectureClaimGrounded(claim, sourceFacts)) return "repo_architecture_context";
  return "missing";
}

function textOverlapScore(left: string, right: string) {
  const words = distinctiveWords(left);
  if (!words.length) return 0;
  const matches = words.filter((word) => right.includes(word)).length;
  return matches / words.length;
}

function architectureClaimGrounded(claim: string, sourceFacts: string[]) {
  return sourceFacts.some((fact) => architectureFact(fact))
    && /\b(Next\.js|Prisma|Postgres|AgentRun|AgentRunEvent|LinkedIn|API|route handlers?|approval gates?|memory)\b/i.test(claim);
}

function uniqueClaims(claims: Array<{ text: string; provenance: string; status: "grounded" | "ungrounded" }>) {
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const key = claim.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1120 }, deviceScaleFactor: 1, colorScheme: "light" });
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 15_000 });
    await page.addStyleTag({ content: privacyScreenshotCss });
    await page.locator("svg").first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
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
  const draft = await prisma.linkedInPostDraft.create({
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
  await syncMaterialClaimsForLinkedInDraft(draft.id);
  return draft;
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
