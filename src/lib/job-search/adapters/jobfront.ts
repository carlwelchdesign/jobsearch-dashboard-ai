import type { JobSearchProfile, JobSource } from "@prisma/client";
import type { JobSourceAdapter, NormalizedJobPosting, RawJobPosting } from "@/lib/job-search/source-adapter";

const requestTimeoutMs = 15_000;

export const jobfrontAdapter: JobSourceAdapter = {
  name: "JobFront Board",
  async fetchJobs(profile: JobSearchProfile, source: JobSource) {
    const baseUrl = readString(source.config, "boardUrl", source.baseUrl ?? "");
    if (!baseUrl) return [];
    const organizationId = readString(source.config, "organizationId", "");
    const maxFetch = readNumber(source.config, "maxFetch", Math.max(profile.maxResultsPerRun * 8 || 160, 160));
    const html = await fetchJobFrontJobs(baseUrl, organizationId);
    const jobs = parseJobFrontJobs(html, new URL(baseUrl), source.name);
    return jobs.slice(0, Math.min(maxFetch, 600));
  },
  async normalize(raw: RawJobPosting): Promise<NormalizedJobPosting> {
    const haystack = `${raw.title} ${raw.location ?? ""} ${raw.description}`;
    return {
      sourceJobId: raw.sourceJobId,
      company: raw.company,
      title: raw.title,
      location: raw.location,
      remoteType: /remote/i.test(haystack) ? "remote" : /hybrid/i.test(haystack) ? "hybrid" : /on-?site/i.test(haystack) ? "onsite" : "unknown",
      salaryMin: salary(raw.description, 0),
      salaryMax: salary(raw.description, 1),
      salaryCurrency: /\$|USD/i.test(raw.description) ? "USD" : undefined,
      description: raw.description,
      requirements: [],
      niceToHaves: [],
      benefits: [],
      applicationUrl: raw.applicationUrl,
      atsProvider: "other",
      rawData: raw.rawData ?? raw,
    };
  },
};

async function fetchJobFrontJobs(baseUrl: string, organizationId: string) {
  const endpoint = new URL("/api/jobs", baseUrl);
  const body = new URLSearchParams({
    is_filtered: "0",
    pagination_organization_id: organizationId,
    pagination_job_id: "",
    pagination_created_at: "",
  });
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Accept: "text/html",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "JobSearchOS/1.0",
    },
    body,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) return "";
  return response.text();
}

export function parseJobFrontJobs(html: string, baseUrl: URL, boardName: string): RawJobPosting[] {
  const jobs: RawJobPosting[] = [];
  const linkPattern = /<a\s+[^>]*href="([^"]*\/organizations\/[^"]*\/jobs\/[^"]*)"[^>]*id="job_([^"]+)"[^>]*>([\s\S]*?)(?=<\/td>\s*<\/tr>|<tr style="margin-top:24px;height:24px;">|<script>|$)/g;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) !== null) {
    const href = decodeHtml(match[1] ?? "");
    const sourceJobId = decodeHtml(match[2] ?? "");
    const block = match[3] ?? "";
    const title = titleFromBlock(block);
    if (!title) continue;
    const description = textFromFirst(block, /<a\s+[^>]*font-family:\s*SF-UI-Display-Regular;[^>]*>([\s\S]*?)<\/a>/);
    const salaryText = textFromFirst(block, /<div[^>]*font-size:14px;line-height:20px[^>]*>([\s\S]*?)<\/div>/);
    const metaText = textFromLast(block, /<div[^>]*color:#4b587c[^>]*>([\s\S]*?)<\/div>/g);
    const company = companyFromHref(href) ?? boardName;
    jobs.push({
      sourceJobId: sourceJobId || `jobfront:${href}`,
      company,
      title,
      location: locationFromMeta(metaText),
      description: [description, salaryText, metaText].filter(Boolean).join("\n\n"),
      applicationUrl: new URL(href, baseUrl).toString(),
      rawData: { provider: "jobfront", boardName, href, sourceJobId },
    });
  }
  return dedupeByUrl(jobs);
}

function textFromFirst(value: string, pattern: RegExp) {
  const found = pattern.exec(value);
  return cleanup(found?.[1] ?? "");
}

function titleFromBlock(value: string) {
  const found = /<div[^>]*id="[^"]+"[^>]*>([\s\S]*?)<\/div>/.exec(value);
  return cleanup((found?.[1] ?? "").replace(/<span[\s\S]*?<\/span>/gi, " "));
}

function textFromLast(value: string, pattern: RegExp) {
  let latest = "";
  let found: RegExpExecArray | null;
  while ((found = pattern.exec(value)) !== null) latest = found[1] ?? "";
  return cleanup(latest);
}

function cleanup(value: string) {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string) {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;|&mdash;/g, "-");
}

function companyFromHref(href: string) {
  const found = /\/organizations\/([^/]+)/.exec(href);
  return found?.[1]?.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function locationFromMeta(value: string) {
  const parts = value.split(/\s-\s/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(" - ") : undefined;
}

function salary(value: string, index: 0 | 1) {
  const matches = Array.from(value.matchAll(/\$([0-9][0-9,]*)/g)).map((item) => Number(item[1]?.replace(/,/g, "")));
  return matches[index];
}

function readString(value: unknown, key: string, fallback: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "string" && found.trim() ? found.trim() : fallback;
}

function readNumber(value: unknown, key: string, fallback: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "number" && Number.isFinite(found) ? Math.max(1, Math.round(found)) : fallback;
}

function dedupeByUrl(jobs: RawJobPosting[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = job.applicationUrl ?? job.sourceJobId ?? `${job.company}:${job.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
