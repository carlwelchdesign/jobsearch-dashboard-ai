import type { JobSearchProfile, JobSource } from "@prisma/client";
import type { JobSourceAdapter, NormalizedJobPosting, RawJobPosting } from "@/lib/job-search/source-adapter";

type AshbyJob = {
  id?: string;
  title?: string;
  department?: string;
  location?: string | { name?: string };
  employmentType?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
};

const companyFetchTimeoutMs = 8_000;

export const ashbyAdapter: JobSourceAdapter = {
  name: "Ashby",
  async fetchJobs(_: JobSearchProfile, source: JobSource) {
    const companies = readStringArray(source.config, "companySlugs").slice(0, readNumber(source.config, "maxCompanies", 30));
    const maxFetch = readNumber(source.config, "maxFetch", 300);
    const results: RawJobPosting[] = [];

    for (const company of companies) {
      const payload = await fetchAshbyJobs(company);
      if (!payload) continue;
      for (const job of payload.jobs ?? []) {
        results.push({
          sourceJobId: job.id,
          company,
          title: job.title ?? "Untitled role",
          location: typeof job.location === "string" ? job.location : job.location?.name,
          description: stripHtml(job.descriptionPlain ?? job.descriptionHtml ?? ""),
          applicationUrl: job.applyUrl ?? job.jobUrl,
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
      atsProvider: "ashby",
      rawData: raw.rawData ?? raw,
    };
  },
};

async function fetchAshbyJobs(company: string) {
  try {
    const response = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company)}?includeCompensation=true`, {
      headers: { Accept: "application/json", "User-Agent": "JobSearchOS/1.0" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(companyFetchTimeoutMs),
    });
    if (!response.ok) return null;
    return (await response.json()) as { jobs?: AshbyJob[] };
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
