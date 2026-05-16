import type { JobSearchProfile, JobSource } from "@prisma/client";
import type { JobSourceAdapter, NormalizedJobPosting, RawJobPosting } from "@/lib/job-search/source-adapter";

type GreenhouseJob = {
  id?: number;
  title?: string;
  absolute_url?: string;
  content?: string;
  location?: { name?: string };
  metadata?: Array<{ name?: string; value?: string }>;
};

const companyFetchTimeoutMs = 8_000;

export const greenhouseAdapter: JobSourceAdapter = {
  name: "Greenhouse",
  async fetchJobs(_: JobSearchProfile, source: JobSource) {
    const companies = readStringArray(source.config, "companySlugs").slice(0, readNumber(source.config, "maxCompanies", 30));
    const maxFetch = readNumber(source.config, "maxFetch", 350);
    const results: RawJobPosting[] = [];

    for (const company of companies) {
      const payload = await fetchGreenhouseJobs(company);
      if (!payload) continue;
      for (const job of payload.jobs ?? []) {
        results.push({
          sourceJobId: job.id ? String(job.id) : undefined,
          company,
          title: job.title ?? "Untitled role",
          location: job.location?.name,
          description: stripHtml(job.content ?? ""),
          applicationUrl: job.absolute_url,
          rawData: { ...job, company },
        });
      }
    }

    return results.slice(0, maxFetch);
  },
  async normalize(raw: RawJobPosting): Promise<NormalizedJobPosting> {
    return {
      sourceJobId: raw.sourceJobId,
      company: displayCompany(raw.company),
      title: raw.title,
      location: raw.location,
      remoteType: /remote/i.test(`${raw.location ?? ""} ${raw.description}`) ? "remote" : /hybrid/i.test(`${raw.location ?? ""} ${raw.description}`) ? "hybrid" : "unknown",
      description: raw.description,
      requirements: [],
      niceToHaves: [],
      benefits: [],
      applicationUrl: raw.applicationUrl,
      atsProvider: "greenhouse",
      rawData: raw.rawData ?? raw,
    };
  },
};

async function fetchGreenhouseJobs(company: string) {
  try {
    const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company)}/jobs?content=true`, {
      headers: { Accept: "application/json", "User-Agent": "JobSearchOS/1.0" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(companyFetchTimeoutMs),
    });
    if (!response.ok) return null;
    return (await response.json()) as { jobs?: GreenhouseJob[] };
  } catch {
    return null;
  }
}

function readStringArray(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const found = (value as Record<string, unknown>)[key];
  return Array.isArray(found) ? found.filter((item): item is string => typeof item === "string") : [];
}

function readNumber(value: unknown, key: string, fallback: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "number" ? found : fallback;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function displayCompany(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
