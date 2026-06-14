import type { AgentRun, Prisma } from "@prisma/client";
import { z } from "zod";
import { runAgent } from "@/lib/agents/run-agent";
import { buildLinkedInContentMemoryPack, jsonValue, type LinkedInContentMemoryPack } from "@/lib/agents/linkedin-content-memory";
import { parseStructuredOutput } from "@/lib/ai/openai";
import { prisma } from "@/lib/prisma";

export type LinkedInContentInput = {
  userId?: string;
  contentPillar?: LinkedInContentPillar;
  prompt?: string;
  tone?: "bold_grounded" | "practical" | "experimental";
  format?: LinkedInContentFormat;
  visualDirection?: string;
  parentRunId?: string;
};

export type LinkedInContentPillar = "app_progress" | "search_learning" | "architecture" | "workflow_design";
export type LinkedInContentFormat = "build_log" | "lesson" | "decision_diary" | "teardown" | "before_after" | "contrarian_take" | "field_note" | "visual_walkthrough" | "product_thesis";

export type LinkedInScreenshotAsset = {
  label: string;
  path: string;
  mimeType: "image/png";
  description: string;
  route: string;
  privacyStatus: "PASS" | "NEEDS_REVIEW";
  warnings: string[];
};

export type LinkedInAgentReview = {
  agent: "Narrative Strategist" | "Documentarian" | "Editorial Challenger" | "Analytics Narrator" | "Product Strategist" | "Editor" | "Visual Producer" | "Privacy Reviewer";
  summary: string;
  recommendation: string;
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
  draftId?: string;
};

type LinkedInContentDirection = {
  prompt: string;
  tone: NonNullable<LinkedInContentInput["tone"]>;
  format: LinkedInContentFormat;
  legacyPillar: LinkedInContentPillar;
  visualDirection: string;
  selectedAngle: string;
  rejectedAngles: string[];
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
  return runAgent<LinkedInContentInput, LinkedInContentOutput>({
    agentType: "LINKEDIN_CONTENT",
    input: { ...input, contentPillar: pillar, prompt: direction.prompt, tone: direction.tone, format: direction.format, visualDirection: direction.visualDirection },
    userId: user.id,
    parentRunId: input.parentRunId,
    execute: async (run) => {
      const generated = await generateLinkedInContent({ pillar, memoryPack, direction });
      const screenshotAssets = await createSafeLinkedInScreenshotAssets(memoryPack, direction);
      const selectedScreenshots = selectBestScreenshots(screenshotAssets, direction);
      const agentReviews = buildAgentReviews(memoryPack, generated, direction, selectedScreenshots);
      const claims = buildClaims(generated, memoryPack);
      const privacyReview = reviewLinkedInPostPrivacy({
        body: generated.body,
        hook: generated.hook,
        disclosureText: defaultDisclosure,
        sourceFacts: generated.sourceFacts,
        screenshotAssets: selectedScreenshots,
        claims,
      });
      const output: LinkedInContentOutput = {
        ...generated,
        disclosureText: defaultDisclosure,
        memorySources: memoryPack.memorySources,
        analyticsSources: memoryPack.analyticsSources,
        agentReviews,
        claims,
        risks: privacyReview.warnings,
        screenshotAssets,
        selectedScreenshots,
        privacyReview,
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
        "Use aggregate analytics only. Do not mention company names, recruiters, salaries, emails, job URLs, private application outcomes, or unsupported traction. " +
        "Avoid hype, cliches, emojis, em dashes, and unverifiable claims.",
      input: {
        dailyBrief: input.direction.prompt,
        tone: input.direction.tone,
        format: input.direction.format,
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
          body: "LinkedIn post body, 180-450 words, grounded only in memoryPack facts.",
          hashtags: "3-6 relevant hashtags.",
        },
      },
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
    };
  } catch {
    return fallback;
  }
}

export function buildLinkedInContentFallback(input: {
  pillar: LinkedInContentPillar;
  direction?: LinkedInContentDirection;
  memoryPack: Pick<LinkedInContentMemoryPack, "aggregateFacts" | "analytics" | "storyAngles" | "planSources" | "noveltySignals">;
}): Omit<LinkedInContentOutput, "screenshotAssets" | "selectedScreenshots" | "privacyReview" | "draftId" | "disclosureText" | "memorySources" | "analyticsSources" | "agentReviews" | "claims" | "risks"> {
  const latest = input.memoryPack.analytics.latestSearchRun;
  const direction = input.direction ?? {
    prompt: "Document recent Job Search OS progress.",
    tone: "bold_grounded" as const,
    format: "field_note" as const,
    legacyPillar: input.pillar,
    visualDirection: "",
    selectedAngle: input.memoryPack.storyAngles[0] ?? "A field note from the build log.",
    rejectedAngles: [],
  };
  const funnelLine = latest
    ? `The latest run moved through ${latest.funnel.map((item) => `${item.label.toLowerCase()} ${item.value}`).join(", ")}.`
    : "The current work is focused on making the app's workflow memory useful enough to explain itself.";
  const planLine = input.memoryPack.planSources?.[0]
    ? `One plan in the build log keeps pulling me back: ${input.memoryPack.planSources[0].title}. ${input.memoryPack.planSources[0].summary}`
    : "The build log is becoming useful source material, not just project bookkeeping.";
  const body = [
    `Today's content brief: ${direction.prompt}`,
    "",
    `${formatLabel(direction.format)}: ${direction.selectedAngle}`,
    "",
    planLine,
    "",
    funnelLine,
    latest?.drops.length ? `The more interesting signal was the drop-off pattern: ${latest.drops.slice(0, 4).map((item) => `${item.label.toLowerCase()} ${item.value}`).join(", ")}.` : "The useful part is not just the count; it is whether the system can explain what changed and why.",
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

function buildAgentReviews(memoryPack: LinkedInContentMemoryPack, generated: Pick<LinkedInContentOutput, "title" | "body">, direction: LinkedInContentDirection, selectedScreenshots: LinkedInScreenshotAsset[]): LinkedInAgentReview[] {
  const latest = memoryPack.analytics.latestSearchRun;
  return [
    { agent: "Narrative Strategist", summary: `Prompt: ${direction.prompt}`, recommendation: `Selected angle: ${direction.selectedAngle}. Rejected: ${direction.rejectedAngles.join(" | ") || "none"}.` },
    { agent: "Documentarian", summary: memoryPack.recentDecisions.slice(0, 2).join(" "), recommendation: `Use plan memory and build evidence, including ${memoryPack.planSources.slice(0, 2).map((plan) => plan.title).join(", ") || "recent app work"}.` },
    { agent: "Editorial Challenger", summary: `Avoid recent phrases: ${memoryPack.noveltySignals.avoidPhrases.join(", ")}.`, recommendation: "Do not reuse the same future-CMS/operating-system framing unless the prompt explicitly asks for it." },
    { agent: "Analytics Narrator", summary: latest ? `Latest funnel has ${latest.funnel.length} stages and ${latest.drops.length} visible drop-off reasons.` : "No latest search analytics are available.", recommendation: "Use aggregate funnel numbers only." },
    { agent: "Product Strategist", summary: memoryPack.storyAngles[0] ?? "The product angle is creator workflow memory.", recommendation: "Frame this as a content operating system learning from its own work." },
    { agent: "Editor", summary: `Draft title: ${generated.title}.`, recommendation: "Keep the post concrete, non-hype, and readable without internal app knowledge." },
    { agent: "Visual Producer", summary: selectedScreenshots.map((item) => `${item.route}: ${item.description}`).join(" | ") || "No passing screenshot selected.", recommendation: `Visual rationale: ${direction.visualDirection || "choose the app area that best explains the selected angle"}.` },
    { agent: "Privacy Reviewer", summary: memoryPack.publicPolicy, recommendation: "Block named entities, private outcomes, external URLs, and unsupported claims before publishing." },
  ];
}

function buildContentDirection(input: LinkedInContentInput, memoryPack: LinkedInContentMemoryPack): LinkedInContentDirection {
  const prompt = cleanLine(input.prompt || defaultPromptForPillar(input.contentPillar));
  const tone = input.tone ?? "bold_grounded";
  const format = input.format ?? inferFormat(prompt);
  const legacyPillar = input.contentPillar ?? "app_progress";
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
    provenance: facts.has(fact) ? "memory_pack.aggregateFacts" : "missing",
    status: facts.has(fact) ? "grounded" as const : "ungrounded" as const,
  }));
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
