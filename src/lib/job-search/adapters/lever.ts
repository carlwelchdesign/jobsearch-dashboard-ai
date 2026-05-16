import type { JobSearchProfile, JobSource } from "@prisma/client";
import type { JobSourceAdapter, NormalizedJobPosting, RawJobPosting } from "@/lib/job-search/source-adapter";

type LeverPosting = {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  categories?: {
    location?: string;
    commitment?: string;
    team?: string;
  };
  descriptionPlain?: string;
  lists?: Array<{ text?: string; content?: string }>;
};

const companyFetchTimeoutMs = 8_000;

export const leverAdapter: JobSourceAdapter = {
  name: "Lever",
  async fetchJobs(_: JobSearchProfile, source: JobSource) {
    const companies = readStringArray(source.config, "companySlugs");
    const maxFetch = readNumber(source.config, "maxFetch", 300);
    if (companies.length === 0) return [];

    const results: RawJobPosting[] = [];
    for (const company of companies) {
      const postings = await fetchLeverPostings(company);
      if (!postings) continue;
      for (const posting of postings) {
        results.push({
          sourceJobId: posting.id,
          company,
          title: posting.text ?? "Untitled role",
          location: posting.categories?.location,
          description: [posting.descriptionPlain, ...(posting.lists ?? []).map((list) => `${list.text ?? ""}\n${stripHtml(list.content ?? "")}`)]
            .filter(Boolean)
            .join("\n\n"),
          applicationUrl: posting.applyUrl ?? posting.hostedUrl,
          rawData: { ...posting, company },
        });
      }
    }
    return results.slice(0, maxFetch);
  },
  async normalize(raw: RawJobPosting): Promise<NormalizedJobPosting> {
    const posting = raw.rawData as LeverPosting | undefined;
    const location = raw.location ?? posting?.categories?.location;
    return {
      sourceJobId: raw.sourceJobId,
      company: raw.company,
      title: raw.title,
      location,
      remoteType: /remote/i.test(location ?? raw.description) ? "remote" : /hybrid/i.test(location ?? raw.description) ? "hybrid" : "unknown",
      description: raw.description,
      requirements: [],
      niceToHaves: [],
      benefits: [],
      applicationUrl: raw.applicationUrl,
      atsProvider: "lever",
      rawData: raw.rawData ?? raw,
    };
  },
};

async function fetchLeverPostings(company: string) {
  try {
    const response = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`, {
      headers: { Accept: "application/json", "User-Agent": "JobSearchOS/1.0" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(companyFetchTimeoutMs),
    });
    if (!response.ok) return null;
    return (await response.json()) as LeverPosting[];
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
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
