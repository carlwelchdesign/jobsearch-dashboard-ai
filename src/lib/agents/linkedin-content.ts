import type { AgentRun, Prisma } from "@prisma/client";
import { z } from "zod";
import { runAgent } from "@/lib/agents/run-agent";
import { buildLinkedInContentMemoryPack, jsonValue, type LinkedInContentMemoryPack } from "@/lib/agents/linkedin-content-memory";
import { parseStructuredOutput } from "@/lib/ai/openai";
import { prisma } from "@/lib/prisma";

export type LinkedInContentInput = {
  userId?: string;
  contentPillar?: LinkedInContentPillar;
  parentRunId?: string;
};

export type LinkedInContentPillar = "app_progress" | "search_learning" | "architecture" | "workflow_design";

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
  agent: "Documentarian" | "Analytics Narrator" | "Product Strategist" | "Editor" | "Visual Producer" | "Privacy Reviewer";
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

const generatedLinkedInPostSchema = z.object({
  title: z.string().min(1).max(120),
  hook: z.string().min(1).max(220),
  body: z.string().min(80).max(3000),
  hashtags: z.array(z.string().min(1).max(40)).max(8),
});

const defaultHashtags = ["#BuildInPublic", "#AgenticAI", "#CreatorTools", "#ProductEngineering"];
const defaultDisclosure = "Prepared by my agent content team from the Job Search OS build log.";
const allowedScreenshotRoutes = new Set(["/dashboard", "/sources", "/runs", "/applications/assistant", "/settings/learning", "/linkedin-content"]);

export async function runLinkedInContentAgent(input: LinkedInContentInput = {}) {
  const user = input.userId
    ? await prisma.user.findUnique({ where: { id: input.userId } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user exists. Run seed first.");

  const memoryPack = await buildLinkedInContentMemoryPack(user.id);
  const pillar = input.contentPillar ?? "app_progress";
  return runAgent<LinkedInContentInput, LinkedInContentOutput>({
    agentType: "LINKEDIN_CONTENT",
    input: { ...input, contentPillar: pillar },
    userId: user.id,
    parentRunId: input.parentRunId,
    execute: async (run) => {
      const generated = await generateLinkedInContent({ pillar, memoryPack });
      const agentReviews = buildAgentReviews(memoryPack, generated);
      const screenshotAssets = await createSafeLinkedInScreenshotAssets(memoryPack);
      const selectedScreenshots = screenshotAssets.filter((asset) => asset.privacyStatus === "PASS").slice(0, 1);
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
}): Promise<Omit<LinkedInContentOutput, "screenshotAssets" | "selectedScreenshots" | "privacyReview" | "draftId" | "disclosureText" | "memorySources" | "analyticsSources" | "agentReviews" | "claims" | "risks">> {
  const fallback = buildLinkedInContentFallback(input);
  try {
    const generated = await parseStructuredOutput({
      schema: generatedLinkedInPostSchema,
      schemaName: "generate_linkedin_content_team_post",
      system:
        "Write a LinkedIn post draft as an agent content team documenting Job Search OS work. " +
        "Use a candid senior builder voice, disclose that agents prepared the update, and ground every public claim in the provided memory pack. " +
        "Use aggregate analytics only. Do not mention company names, recruiters, salaries, emails, job URLs, private application outcomes, or unsupported traction. " +
        "Avoid hype, cliches, emojis, em dashes, and unverifiable claims.",
      input: {
        pillar: input.pillar,
        publicPolicy: input.memoryPack.publicPolicy,
        aggregateFacts: input.memoryPack.aggregateFacts,
        recentDecisions: input.memoryPack.recentDecisions,
        lessonsLearned: input.memoryPack.lessonsLearned,
        storyAngles: input.memoryPack.storyAngles,
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
  memoryPack: Pick<LinkedInContentMemoryPack, "aggregateFacts" | "analytics" | "storyAngles">;
}): Omit<LinkedInContentOutput, "screenshotAssets" | "selectedScreenshots" | "privacyReview" | "draftId" | "disclosureText" | "memorySources" | "analyticsSources" | "agentReviews" | "claims" | "risks"> {
  const latest = input.memoryPack.analytics.latestSearchRun;
  const funnelLine = latest
    ? `The latest run moved through ${latest.funnel.map((item) => `${item.label.toLowerCase()} ${item.value}`).join(", ")}.`
    : "The current work is focused on making the app's workflow memory useful enough to explain itself.";
  const body = [
    "I have been using Job Search OS as a practical testbed for a bigger product question: what happens when agents do not just generate output, but document the workflow they are part of?",
    "",
    funnelLine,
    latest?.drops.length ? `The more interesting signal was the drop-off pattern: ${latest.drops.slice(0, 4).map((item) => `${item.label.toLowerCase()} ${item.value}`).join(", ")}.` : "The useful part is not just the count; it is whether the system can explain what changed and why.",
    "",
    "That is where I think creator tooling is going. A content system should remember work, decisions, analytics, drafts, edits, screenshots, and review gates. Then agents can turn that memory into material a human can inspect instead of starting from a blank page every time.",
    "",
    "The boundary matters: aggregate numbers are fair game, private operational details are not. The goal is leverage without pretending the agents own the judgment.",
  ].join("\n");
  return {
    title: "Turning app memory into public product notes",
    hook: "The next content system should remember the work before it writes about it.",
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

export async function createSafeLinkedInScreenshotAssets(memoryPack: LinkedInContentMemoryPack): Promise<LinkedInScreenshotAsset[]> {
  const recommendations = memoryPack.screenshotRecommendations.filter((item) => allowedScreenshotRoutes.has(item.route)).slice(0, 2);
  const output: LinkedInScreenshotAsset[] = [];
  for (const recommendation of recommendations) {
    const captured = await captureRouteScreenshot(recommendation.route, recommendation.reason);
    if (captured) output.push(captured);
  }
  return output;
}

function buildAgentReviews(memoryPack: LinkedInContentMemoryPack, generated: Pick<LinkedInContentOutput, "title" | "body">): LinkedInAgentReview[] {
  const latest = memoryPack.analytics.latestSearchRun;
  return [
    { agent: "Documentarian", summary: memoryPack.recentDecisions.slice(0, 2).join(" "), recommendation: "Anchor the post in recent system decisions rather than generic AI commentary." },
    { agent: "Analytics Narrator", summary: latest ? `Latest funnel has ${latest.funnel.length} stages and ${latest.drops.length} visible drop-off reasons.` : "No latest search analytics are available.", recommendation: "Use aggregate funnel numbers only." },
    { agent: "Product Strategist", summary: memoryPack.storyAngles[0] ?? "The product angle is creator workflow memory.", recommendation: "Frame this as a content operating system learning from its own work." },
    { agent: "Editor", summary: `Draft title: ${generated.title}.`, recommendation: "Keep the post concrete, non-hype, and readable without internal app knowledge." },
    { agent: "Visual Producer", summary: memoryPack.screenshotRecommendations.map((item) => item.route).join(", "), recommendation: "Attach one redacted app screenshot only when privacy review passes." },
    { agent: "Privacy Reviewer", summary: memoryPack.publicPolicy, recommendation: "Block named entities, private outcomes, external URLs, and unsupported claims before publishing." },
  ];
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
