import type { AgentRun, Prisma } from "@prisma/client";
import { z } from "zod";
import { runAgent } from "@/lib/agents/run-agent";
import { parseStructuredOutput } from "@/lib/ai/openai";
import { sourceCatalog } from "@/lib/job-search/source-catalog";
import { prisma } from "@/lib/prisma";

export type LinkedInContentInput = {
  userId?: string;
  contentPillar?: LinkedInContentPillar;
};

export type LinkedInContentPillar = "app_progress" | "search_learning" | "architecture" | "workflow_design";

export type LinkedInScreenshotAsset = {
  label: string;
  path: string;
  mimeType: "image/svg+xml";
  description: string;
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
  contentPillar: LinkedInContentPillar;
  sourceFacts: string[];
  screenshotAssets: LinkedInScreenshotAsset[];
  privacyReview: LinkedInPrivacyReview;
  mode: "llm" | "deterministic";
  draftId?: string;
};

type LinkedInContentContext = {
  pillar: LinkedInContentPillar;
  generatedAt: string;
  sourceFacts: string[];
  searchRuns: Array<{ jobsFetched: number; jobsSaved: number; status: string; createdAt: string }>;
  agentRuns: Array<{ agentType: string; status: string; createdAt: string; summary: string }>;
  sourceCoverage: {
    activeSources: number;
    querySources: number;
    manualSources: number;
    priorityOneSources: number;
  };
  docsSignals: string[];
};

const generatedLinkedInPostSchema = z.object({
  title: z.string().min(1).max(120),
  hook: z.string().min(1).max(220),
  body: z.string().min(80).max(3000),
  hashtags: z.array(z.string().min(1).max(40)).max(8),
});

const defaultHashtags = ["#BuildInPublic", "#AgenticAI", "#JobSearch", "#ProductEngineering"];

export async function runLinkedInContentAgent(input: LinkedInContentInput = {}) {
  const user = input.userId
    ? await prisma.user.findUnique({ where: { id: input.userId } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user exists. Run seed first.");

  const context = await loadLinkedInContentContext(input.contentPillar ?? "app_progress");
  return runAgent<LinkedInContentInput, LinkedInContentOutput>({
    agentType: "LINKEDIN_CONTENT",
    input: { ...input, contentPillar: context.pillar },
    userId: user.id,
    execute: async (run) => {
      const generated = await generateLinkedInContent(context);
      const screenshotAssets = await createSafeLinkedInScreenshotAssets(context, generated);
      const privacyReview = reviewLinkedInPostPrivacy({
        body: generated.body,
        hook: generated.hook,
        sourceFacts: generated.sourceFacts,
        screenshotAssets,
      });
      const output: LinkedInContentOutput = {
        ...generated,
        screenshotAssets,
        privacyReview,
      };
      const draft = await persistLinkedInPostDraft(user.id, run, output);
      return { ...output, draftId: draft.id };
    },
  });
}

export async function generateLinkedInContent(context: LinkedInContentContext): Promise<Omit<LinkedInContentOutput, "screenshotAssets" | "privacyReview" | "draftId">> {
  const fallback = buildLinkedInContentFallback(context);
  try {
    const generated = await parseStructuredOutput({
      schema: generatedLinkedInPostSchema,
      schemaName: "generate_linkedin_content_post",
      system:
        "Write a LinkedIn post draft for a senior product engineer building a job-search operating system. " +
        "Use an engaging senior builder voice: candid, practical, technically credible, and useful to other builders. " +
        "Do not imply the post was published. Do not claim LinkedIn API job-search access. Do not mention private names, emails, salaries, companies, job URLs, or application details. " +
        "Avoid hype, cliches, emojis, em dashes, and unverifiable claims. Keep the post useful even to someone not using the app.",
      input: {
        pillar: context.pillar,
        generatedAt: context.generatedAt,
        sourceFacts: context.sourceFacts,
        recentSearchRuns: context.searchRuns,
        recentAgents: context.agentRuns,
        sourceCoverage: context.sourceCoverage,
        docsSignals: context.docsSignals,
        requiredOutput: {
          title: "Short internal title for the draft.",
          hook: "Strong first line.",
          body: "LinkedIn post body, 180-450 words, grounded only in sourceFacts.",
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
      contentPillar: context.pillar,
      sourceFacts: context.sourceFacts,
      mode: "llm",
    };
  } catch {
    return fallback;
  }
}

export function buildLinkedInContentFallback(context: LinkedInContentContext): Omit<LinkedInContentOutput, "screenshotAssets" | "privacyReview" | "draftId"> {
  const coverage = context.sourceCoverage;
  const latestSearch = context.searchRuns[0];
  const savedLine = latestSearch
    ? `The latest search run processed ${latestSearch.jobsFetched} raw results and saved ${latestSearch.jobsSaved} pipeline-ready matches after dedupe, scoring, and review gates.`
    : "The current work is focused on making the pipeline easier to understand before adding more automation.";
  const body = [
    "I have been building Job Search OS as a practical experiment in agentic software: not an auto-apply bot, but a workflow that makes job discovery, scoring, materials, and review easier to reason about.",
    "",
    savedLine,
    `The source layer now tracks ${coverage.activeSources} active sources, including direct ATS adapters and open-web query coverage, while keeping high-risk or account-gated surfaces manual.`,
    "",
    "The lesson that keeps showing up: useful agents need clear boundaries. The system should explain why a job was filtered, preserve review gates where judgment matters, and generate artifacts a person can inspect before anything external happens.",
    "",
    "That is the shape I want from AI tooling in serious workflows: more leverage, better diagnostics, and fewer hidden decisions.",
  ].join("\n");
  return {
    title: "Building a safer job-search operating system",
    hook: "The most useful job-search agent is not the one that clicks the fastest.",
    body,
    hashtags: defaultHashtags,
    contentPillar: context.pillar,
    sourceFacts: context.sourceFacts,
    mode: "deterministic",
  };
}

export function reviewLinkedInPostPrivacy(input: {
  body: string;
  hook: string;
  sourceFacts: string[];
  screenshotAssets: LinkedInScreenshotAsset[];
}): LinkedInPrivacyReview {
  const text = [input.hook, input.body, ...input.sourceFacts, ...input.screenshotAssets.map((asset) => `${asset.label} ${asset.description}`)].join("\n");
  const blockedPatterns: Array<[RegExp, string]> = [
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, "email address"],
    [/https?:\/\/(?!localhost|127\.0\.0\.1)[^\s)]+/i, "external URL"],
    [/\$\s?\d[\d,]*(?:k|K)?\b/, "salary or compensation"],
    [/\b(applied|interviewing|rejected|offer|screening)\s+at\s+[A-Z][A-Za-z0-9&.\- ]+/i, "application outcome with company"],
    [/\blinkedin\.com\/jobs\/view\/\d+/i, "LinkedIn job URL"],
  ];
  const blockedTerms = blockedPatterns.flatMap(([pattern, label]) => pattern.test(text) ? [label] : []);
  const warnings = [
    ...blockedTerms.map((term) => `Potential private ${term} detected.`),
    ...(input.screenshotAssets.length === 0 ? ["No safe screenshot asset was generated."] : []),
  ];
  return {
    status: warnings.length ? "NEEDS_REVIEW" : "PASS",
    warnings,
    blockedTerms,
    reviewedAt: new Date().toISOString(),
  };
}

export async function loadLinkedInContentContext(pillar: LinkedInContentPillar): Promise<LinkedInContentContext> {
  const [searchRuns, agentRuns] = await Promise.all([
    prisma.jobSearchRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { jobsFetched: true, jobsSaved: true, status: true, createdAt: true },
    }),
    prisma.agentRun.findMany({
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { agentType: true, status: true, createdAt: true, outputJson: true },
    }),
  ]);
  const activeSources = sourceCatalog.filter((item) => item.status === "active");
  const querySources = sourceCatalog.filter((item) => item.connector === "search_query");
  const manualSources = sourceCatalog.filter((item) => item.status === "manual");
  const sourceFacts = [
    `Job Search OS has ${activeSources.length} active source entries and ${querySources.length} open-web query-covered source entries.`,
    "LinkedIn is treated as a discovery signal, not a scrape target; OIDC imports profile basics only.",
    "Apply and content workflows keep external actions behind manual review.",
    "Search analytics explain fetched, deduped, matched, saved, review-only, and agency-eligible stages.",
  ];
  return {
    pillar,
    generatedAt: new Date().toISOString(),
    sourceFacts,
    searchRuns: searchRuns.map((run) => ({
      jobsFetched: run.jobsFetched,
      jobsSaved: run.jobsSaved,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
    })),
    agentRuns: agentRuns.map((run) => ({
      agentType: run.agentType,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      summary: summarizeAgentOutput(run.outputJson),
    })),
    sourceCoverage: {
      activeSources: activeSources.length,
      querySources: querySources.length,
      manualSources: manualSources.length,
      priorityOneSources: sourceCatalog.filter((item) => item.priority === 1).length,
    },
    docsSignals: [
      "Draft-only LinkedIn content is a manual-review artifact.",
      "Share on LinkedIn API posting is intentionally deferred.",
      "Screenshots should use aggregate or sanitized app views.",
    ],
  };
}

export async function createSafeLinkedInScreenshotAssets(
  context: LinkedInContentContext,
  generated: Pick<LinkedInContentOutput, "title" | "hook" | "contentPillar">,
): Promise<LinkedInScreenshotAsset[]> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const dir = path.join(process.cwd(), "public", "generated", "linkedin-content");
  await fs.mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${generated.contentPillar}.svg`;
  const filePath = path.join(dir, filename);
  const publicPath = `/generated/linkedin-content/${filename}`;
  const svg = safeScreenshotSvg(context, generated);
  await fs.writeFile(filePath, svg, "utf8");
  return [{
    label: "Safe progress card",
    path: publicPath,
    mimeType: "image/svg+xml",
    description: "Redacted aggregate Job Search OS progress card with source coverage and latest search counts.",
  }];
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
      screenshotAssets: output.screenshotAssets as unknown as Prisma.InputJsonValue,
      privacyReview: output.privacyReview as unknown as Prisma.InputJsonValue,
      status: "DRAFT",
    },
  });
}

function safeScreenshotSvg(context: LinkedInContentContext, generated: Pick<LinkedInContentOutput, "title" | "hook">) {
  const latest = context.searchRuns[0];
  const fetched = latest?.jobsFetched ?? 0;
  const saved = latest?.jobsSaved ?? 0;
  const coverage = context.sourceCoverage;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="Job Search OS safe progress card">
  <rect width="1200" height="675" fill="#fffdf8"/>
  <rect x="60" y="60" width="1080" height="555" rx="18" fill="#ffffff" stroke="#d8d1c4" stroke-width="2"/>
  <text x="96" y="128" fill="#0f766e" font-family="Arial, sans-serif" font-size="28" font-weight="700">Job Search OS</text>
  <text x="96" y="178" fill="#111827" font-family="Arial, sans-serif" font-size="44" font-weight="800">${escapeXml(generated.title)}</text>
  <text x="96" y="226" fill="#4b5563" font-family="Arial, sans-serif" font-size="24">${escapeXml(generated.hook.slice(0, 95))}</text>
  ${metricBlock(96, 300, "Raw results", fetched)}
  ${metricBlock(356, 300, "Saved matches", saved)}
  ${metricBlock(616, 300, "Active sources", coverage.activeSources)}
  ${metricBlock(876, 300, "Query sources", coverage.querySources)}
  <rect x="96" y="500" width="1008" height="1" fill="#e5e7eb"/>
  <text x="96" y="548" fill="#374151" font-family="Arial, sans-serif" font-size="22">Redacted share preview: aggregate metrics only, no names, companies, salaries, job URLs, or applications.</text>
</svg>`;
}

function metricBlock(x: number, y: number, label: string, value: number) {
  return `<g>
    <rect x="${x}" y="${y}" width="210" height="132" rx="14" fill="#f8fafc" stroke="#e5e7eb"/>
    <text x="${x + 24}" y="${y + 50}" fill="#6b7280" font-family="Arial, sans-serif" font-size="20">${escapeXml(label)}</text>
    <text x="${x + 24}" y="${y + 98}" fill="#111827" font-family="Arial, sans-serif" font-size="44" font-weight="800">${value}</text>
  </g>`;
}

function summarizeAgentOutput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Completed agent run.";
  const record = value as Record<string, unknown>;
  return String(record.summary ?? record.rationale ?? record.reasoningSummary ?? "Completed agent run.").slice(0, 300);
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

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
