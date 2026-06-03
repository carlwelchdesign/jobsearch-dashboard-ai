import type { JobSearchProfile, JobSource } from "@prisma/client";
import type { JobSourceAdapter, NormalizedJobPosting, RawJobPosting } from "@/lib/job-search/source-adapter";

const requestTimeoutMs = 15_000;

type EightfoldPosition = {
  id?: number | string;
  name?: string;
  posting_name?: string;
  location?: string;
  locations?: string[];
  department?: string;
  business_unit?: string;
  ats_job_id?: string;
  display_job_id?: string;
  job_description?: string;
  canonicalPositionUrl?: string;
  work_location_option?: string;
  location_flexibility?: string | null;
  t_create?: number;
  t_update?: number;
};

type EightfoldData = {
  companyName?: string;
  branding?: {
    companyName?: string;
  };
  positions?: EightfoldPosition[];
  count?: number;
};

export const eightfoldAdapter: JobSourceAdapter = {
  name: "Eightfold Careers",
  async fetchJobs(profile: JobSearchProfile, source: JobSource) {
    const careersUrl = readString(source.config, "careersUrl", source.baseUrl ?? "");
    if (!careersUrl) return [];

    const maxFetch = readNumber(source.config, "maxFetch", Math.max(profile.maxResultsPerRun * 8 || 160, 160));
    const baseUrl = new URL(careersUrl);
    const domain = readString(source.config, "domain", "");
    const queryTerms = readStringArray(source.config, "queryTerms", []);
    const jobs = domain
      ? await fetchEightfoldApiJobs(baseUrl, domain, source.name, queryTerms, maxFetch)
      : parseEightfoldJobs(await fetchEightfoldCareers(careersUrl), source.name, baseUrl);
    return jobs.slice(0, Math.min(maxFetch, 600));
  },
  async normalize(raw: RawJobPosting): Promise<NormalizedJobPosting> {
    const haystack = `${raw.title} ${raw.location ?? ""} ${raw.description}`;
    return {
      sourceJobId: raw.sourceJobId,
      company: raw.company,
      title: raw.title,
      location: raw.location,
      remoteType: /remote/i.test(haystack) ? "remote" : /hybrid/i.test(haystack) ? "hybrid" : /on-?site|onsite/i.test(haystack) ? "onsite" : "unknown",
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

async function fetchEightfoldCareers(careersUrl: string) {
  const response = await fetch(careersUrl, {
    headers: {
      Accept: "text/html",
      "User-Agent": "JobSearchOS/1.0",
    },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) return "";
  return response.text();
}

export function parseEightfoldJobs(html: string, fallbackCompany: string, baseUrl: URL): RawJobPosting[] {
  const data = parseSmartApplyData(html);
  return parseEightfoldData(data, fallbackCompany, baseUrl);
}

export function parseEightfoldData(data: EightfoldData | null, fallbackCompany: string, baseUrl: URL): RawJobPosting[] {
  const company = cleanup(data?.branding?.companyName ?? data?.companyName ?? fallbackCompany);
  const positions = Array.isArray(data?.positions) ? data.positions : [];
  const jobs = positions
    .filter((position) => !isPrivatePosition(position))
    .map((position) => positionToJob(position, company, baseUrl))
    .filter((job): job is RawJobPosting => Boolean(job));
  return dedupeByUrl(jobs);
}

async function fetchEightfoldApiJobs(baseUrl: URL, domain: string, fallbackCompany: string, queryTerms: string[], maxFetch: number) {
  const allJobs: RawJobPosting[] = [];
  const queries = queryTerms.length ? queryTerms : [""];
  for (const query of queries) {
    let start = 0;
    while (allJobs.length < maxFetch) {
      const data = await fetchEightfoldApiPage(baseUrl, domain, query, start);
      const pageJobs = parseEightfoldData(data, fallbackCompany, baseUrl);
      allJobs.push(...pageJobs);
      const pageSize = data?.positions?.length ?? 0;
      const count = typeof data?.count === "number" ? data.count : pageSize;
      if (pageSize === 0 || start + pageSize >= count) break;
      start += pageSize;
    }
  }
  return dedupeByUrl(allJobs);
}

async function fetchEightfoldApiPage(baseUrl: URL, domain: string, query: string, start: number): Promise<EightfoldData | null> {
  const endpoint = new URL("/api/apply/v2/jobs", baseUrl);
  endpoint.searchParams.set("domain", domain);
  if (query) endpoint.searchParams.set("query", query);
  if (start > 0) endpoint.searchParams.set("start", String(start));

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": "JobSearchOS/1.0",
    },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) return null;
  return response.json() as Promise<EightfoldData>;
}

function parseSmartApplyData(html: string): EightfoldData | null {
  const found = /<code\s+[^>]*id=["']smartApplyData["'][^>]*>([\s\S]*?)<\/code>/i.exec(html);
  if (!found?.[1]) return null;

  try {
    return JSON.parse(decodeHtml(found[1])) as EightfoldData;
  } catch {
    return null;
  }
}

function positionToJob(position: EightfoldPosition, company: string, baseUrl: URL): RawJobPosting | null {
  const title = cleanup(position.posting_name ?? position.name ?? "");
  if (!title) return null;

  const locations = Array.isArray(position.locations) ? position.locations.map(cleanup).filter(Boolean) : [];
  const location = cleanup(position.location ?? locations.join("; "));
  const applicationUrl = position.canonicalPositionUrl ? new URL(position.canonicalPositionUrl, baseUrl).toString() : undefined;
  const sourceJobId = cleanup(position.ats_job_id ?? position.display_job_id ?? String(position.id ?? ""));
  const description = [
    cleanup(position.job_description ?? ""),
    position.department ? `Department: ${cleanup(position.department)}` : "",
    position.business_unit ? `Business unit: ${cleanup(position.business_unit)}` : "",
    location ? `Location: ${location}` : "",
    position.work_location_option ? `Work type: ${cleanup(position.work_location_option)}` : "",
  ].filter(Boolean).join("\n\n");

  return {
    sourceJobId: sourceJobId ? `eightfold:${sourceJobId}` : applicationUrl,
    company,
    title,
    location,
    description: description || title,
    applicationUrl,
    rawData: {
      provider: "eightfold",
      sourceJobId,
      department: position.department,
      businessUnit: position.business_unit,
      createdAtEpoch: position.t_create,
      updatedAtEpoch: position.t_update,
    },
  };
}

function isPrivatePosition(position: EightfoldPosition & { isPrivate?: boolean }) {
  return position.isPrivate === true;
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
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function salary(value: string, index: 0 | 1) {
  const matches = Array.from(value.matchAll(/\$([0-9][0-9,]*(?:\.\d+)?)/g)).map((item) => Number(item[1]?.replace(/,/g, "")));
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

function readStringArray(value: unknown, key: string, fallback: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const found = (value as Record<string, unknown>)[key];
  if (!Array.isArray(found)) return fallback;
  return found.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function dedupeByUrl(jobs: RawJobPosting[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = job.applicationUrl ?? job.sourceJobId ?? `${job.company}:${job.title}:${job.location ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
