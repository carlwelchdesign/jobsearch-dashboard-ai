import { Prisma, type JobMatchStatus } from "@prisma/client";
import { assessApplicationUrlQuality, atsProviderFromApplicationUrl, type ApplicationUrlQuality, type AtsProviderName } from "@/lib/applications/application-url-quality";
import { transitionApplicationState } from "@/lib/applications/state-transitions";
import { extractBuiltInJobDetail, extractHimalayasApplyUrl } from "@/lib/job-search/adapters/search-query";
import { prisma } from "@/lib/prisma";

export type ApplicationUrlRepairMode = "dry-run" | "apply";

export type ApplicationUrlRepairItem = {
  jobId: string;
  company: string;
  title: string;
  previousUrl: string;
  quality: ApplicationUrlQuality;
  action: "resolved" | "cleared" | "skipped" | "failed";
  resolvedUrl?: string;
  applicationsMoved: number;
  error?: string;
};

export type ApplicationUrlRepairResult = {
  mode: ApplicationUrlRepairMode;
  scanned: number;
  candidates: number;
  resolved: number;
  cleared: number;
  skipped: number;
  failed: number;
  applicationsMoved: number;
  items: ApplicationUrlRepairItem[];
};

type RepairInput = {
  mode?: ApplicationUrlRepairMode;
  limit?: number;
};

const reviewStatuses: JobMatchStatus[] = ["approved", "ready_to_apply"];
const fetchTimeoutMs = 10_000;

export async function repairApplicationUrls(input: RepairInput = {}): Promise<ApplicationUrlRepairResult> {
  const mode = input.mode ?? "dry-run";
  const jobs = await prisma.jobPosting.findMany({
    where: {
      applicationUrl: { not: null },
      OR: [
        { source: { type: "search_query" } },
        { applications: { some: { status: { in: reviewStatuses } } } },
      ],
    },
    include: {
      source: true,
      applications: {
        where: { status: { in: reviewStatuses } },
        select: { id: true, status: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: input.limit ?? 500,
  });

  const items: ApplicationUrlRepairItem[] = [];
  for (const job of jobs) {
    const previousUrl = job.applicationUrl;
    if (!previousUrl) continue;

    const quality = assessApplicationUrlQuality(previousUrl);
    if (quality.launchable) continue;

    try {
      const resolvedUrl = await resolveKnownApplicationUrl({
        applicationUrl: previousUrl,
        rawData: job.rawData,
      });
      if (resolvedUrl) {
        if (mode === "apply") {
          await prisma.jobPosting.update({
            where: { id: job.id },
            data: {
              applicationUrl: resolvedUrl,
              atsProvider: atsProviderFromApplicationUrl(resolvedUrl),
              rawData: repairRawData(job.rawData, {
                action: "resolved",
                previousUrl,
                resolvedUrl,
                quality,
              }),
            },
          });
        }
        items.push({
          jobId: job.id,
          company: job.company,
          title: job.title,
          previousUrl,
          quality,
          action: "resolved",
          resolvedUrl,
          applicationsMoved: 0,
        });
        continue;
      }

      let applicationsMoved = 0;
      if (mode === "apply") {
        await prisma.jobPosting.update({
          where: { id: job.id },
          data: {
            applicationUrl: null,
            atsProvider: "unknown",
            rawData: repairRawData(job.rawData, {
              action: "cleared",
              previousUrl,
              quality,
            }),
          },
        });

        for (const application of job.applications.filter((application) => application.status === "ready_to_apply")) {
          await transitionApplicationState({
            applicationId: application.id,
            toStatus: "approved",
            source: "application_url_repair",
            actor: { type: "repair" },
            reason: "Direct application URL is unresolved; moved out of Apply Sprint until corrected.",
            metadata: {
              previousApplicationUrl: previousUrl,
              applicationUrlQuality: quality,
            },
            sideEffects: {
              reconcile: false,
              suppressSubmitted: false,
            },
          });
          applicationsMoved += 1;
        }
      } else {
        applicationsMoved = job.applications.filter((application) => application.status === "ready_to_apply").length;
      }

      items.push({
        jobId: job.id,
        company: job.company,
        title: job.title,
        previousUrl,
        quality,
        action: "cleared",
        applicationsMoved,
      });
    } catch (error) {
      items.push({
        jobId: job.id,
        company: job.company,
        title: job.title,
        previousUrl,
        quality,
        action: "failed",
        applicationsMoved: 0,
        error: error instanceof Error ? error.message : "Unknown application URL repair failure.",
      });
    }
  }

  return {
    mode,
    scanned: jobs.length,
    candidates: items.length,
    resolved: items.filter((item) => item.action === "resolved").length,
    cleared: items.filter((item) => item.action === "cleared").length,
    skipped: items.filter((item) => item.action === "skipped").length,
    failed: items.filter((item) => item.action === "failed").length,
    applicationsMoved: items.reduce((total, item) => total + item.applicationsMoved, 0),
    items,
  };
}

async function resolveKnownApplicationUrl(input: { applicationUrl: string; rawData: unknown }) {
  const host = hostFromUrl(input.applicationUrl);
  let candidate: string | undefined;

  if (host === "builtin.com") {
    const html = await fetchHtml(input.applicationUrl);
    candidate = html ? extractBuiltInJobDetail(html, input.applicationUrl).applicationUrl : undefined;
  } else if (host === "himalayas.app") {
    const html = await fetchHtml(input.applicationUrl);
    candidate = html ? extractHimalayasApplyUrl(html, input.applicationUrl) : undefined;
  } else if (host === "workingnomads.com") {
    candidate = extractDirectUrlFromRawWorkingNomads(input.rawData, input.applicationUrl);
    if (!candidate) {
      const html = await fetchHtml(input.applicationUrl);
      candidate = html ? extractDirectApplicationUrlFromHtml(html, input.applicationUrl, host) : undefined;
    }
  }

  return isRepairResolvedApplicationUrl(candidate) ? assessApplicationUrlQuality(candidate).resolvedUrl ?? candidate : undefined;
}

function extractDirectUrlFromRawWorkingNomads(rawData: unknown, baseUrl: string) {
  const item = isRecord(rawData) && isRecord(rawData.item) ? rawData.item : null;
  const description = typeof item?.description === "string" ? item.description : "";
  return extractDirectApplicationUrlFromHtml(description, baseUrl, "workingnomads.com");
}

function extractDirectApplicationUrlFromHtml(html: string, baseUrl: string, excludedHost: string) {
  const anchors = parseAnchors(html, baseUrl);
  for (const anchor of anchors) {
    if (!/\b(apply|apply now|interested|continue|start application|view application|here)\b/i.test(anchor.text)) continue;
    if (hostFromUrl(anchor.url) === excludedHost) continue;
    if (isRepairResolvedApplicationUrl(anchor.url)) return anchor.url;
  }

  for (const match of html.matchAll(/https?:\/\/[^"' <)\\]+/gi)) {
    const candidate = absoluteUrl(decodeHtmlEntities(match[0] ?? ""), baseUrl);
    if (!candidate || hostFromUrl(candidate) === excludedHost) continue;
    if (hasApplyContext(html, match.index ?? 0) && isRepairResolvedApplicationUrl(candidate)) return candidate;
  }
  return undefined;
}

function isRepairResolvedApplicationUrl(value: string | undefined) {
  const quality = assessApplicationUrlQuality(value);
  if (!quality.launchable || !value) return false;
  const atsProvider = atsProviderFromApplicationUrl(value);
  if (isKnownAtsProvider(atsProvider)) return true;
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();
    const search = url.search.toLowerCase();
    const hasJobQuery = /\b(gh_jid|job_id|jobid|jobseq|req_id|requisitionid)\b/i.test(search);
    if (/\/(?:apply|application)(?:\/|[-_])\S+/i.test(path)) return true;
    if (/\b(apply|application|form)\b/i.test(path) && hasJobQuery) return true;
    if (/\/(?:jobs?|careers?|positions?|open-roles?|job-detail|detail)(?:\/|[-_])\S+/i.test(path)) return true;
    return hasJobQuery
      && /\b(detail|job|career|position|opening)\b/i.test(path);
  } catch {
    return false;
  }
}

function isKnownAtsProvider(provider: AtsProviderName) {
  return provider !== "other" && provider !== "unknown";
}

function hasApplyContext(html: string, index: number) {
  const context = html.slice(Math.max(0, index - 120), index + 120);
  return /\b(apply|application|career|job|position|opening)\b/i.test(context);
}

function parseAnchors(html: string, baseUrl: string) {
  const anchors: Array<{ text: string; url: string }> = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html))) {
    const attributes = match[1] ?? "";
    const href = /\bhref=["']([^"']+)["']/i.exec(attributes)?.[1];
    const url = href ? absoluteUrl(decodeHtmlEntities(href), baseUrl) : undefined;
    if (!url) continue;
    anchors.push({ text: cleanText(match[2] ?? ""), url });
  }

  return anchors;
}

async function fetchHtml(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "JobSearchOS/1.0",
      },
      signal: AbortSignal.timeout(fetchTimeoutMs),
    });
    if (!response.ok) return undefined;
    return response.text();
  } catch {
    return undefined;
  }
}

function repairRawData(
  value: unknown,
  repair: {
    action: "resolved" | "cleared";
    previousUrl: string;
    resolvedUrl?: string;
    quality: ApplicationUrlQuality;
  },
) {
  const existing = isRecord(value) ? value : {};
  const repairedAt = new Date().toISOString();
  return {
    ...existing,
    originalApplicationUrl: existing.originalApplicationUrl ?? repair.previousUrl,
    sourceApplicationUrl: existing.sourceApplicationUrl ?? {
      source: "application_url_repair",
      url: repair.previousUrl,
      reason: repair.quality.reason,
    },
    ...(repair.resolvedUrl ? {
      resolvedApplicationUrl: {
        source: "application_url_repair",
        originalUrl: repair.previousUrl,
        applicationUrl: repair.resolvedUrl,
        resolvedAt: repairedAt,
      },
    } : {}),
    applicationUrlRepair: {
      source: "application_url_repair",
      action: repair.action,
      previousUrl: repair.previousUrl,
      resolvedUrl: repair.resolvedUrl ?? null,
      applicationUrlQuality: repair.quality,
      repairedAt,
    },
  } as Prisma.InputJsonValue;
}

function absoluteUrl(value: string | undefined, baseUrl: string) {
  if (!value) return undefined;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function cleanText(value: string) {
  return decodeHtmlEntities(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCharCode(Number.parseInt(decimal, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
