import type { JobSearchProfile, JobSource } from "@prisma/client";
import type { JobSourceAdapter, NormalizedJobPosting, RawJobPosting } from "@/lib/job-search/source-adapter";

type RemoteOkJob = {
  id?: string | number;
  company?: string;
  position?: string;
  location?: string;
  description?: string;
  url?: string;
  apply_url?: string;
  tags?: string[];
  salary_min?: number;
  salary_max?: number;
};

export const remoteOkAdapter: JobSourceAdapter = {
  name: "RemoteOK",
  async fetchJobs(profile: JobSearchProfile, source: JobSource) {
    const limit = Math.max(profile.maxResultsPerRun * 8 || 160, readNumber(source.config, "maxFetch", 240));
    const response = await fetch("https://remoteok.com/api", {
      headers: {
        "User-Agent": "JobSearchOS/1.0 (+local personal job search dashboard)",
        Accept: "application/json",
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) throw new Error(`RemoteOK returned ${response.status}`);

    const payload = (await response.json()) as RemoteOkJob[];
    return payload
      .filter((item) => item && item.company && item.position)
      .map((item): RawJobPosting => ({
        sourceJobId: item.id ? String(item.id) : undefined,
        company: item.company ?? "Unknown company",
        title: item.position ?? "Untitled role",
        location: item.location ?? "Remote",
        description: stripHtml(item.description ?? ""),
        applicationUrl: item.apply_url ?? item.url,
        rawData: item,
      }))
      .slice(0, Math.min(limit, 600));
  },
  async normalize(raw: RawJobPosting): Promise<NormalizedJobPosting> {
    const rawData = raw.rawData as RemoteOkJob | undefined;
    return {
      sourceJobId: raw.sourceJobId,
      company: raw.company,
      title: raw.title,
      location: raw.location ?? "Remote",
      remoteType: "remote",
      salaryMin: rawData?.salary_min,
      salaryMax: rawData?.salary_max,
      salaryCurrency: rawData?.salary_min || rawData?.salary_max ? "USD" : undefined,
      description: raw.description,
      requirements: rawData?.tags ?? [],
      niceToHaves: [],
      benefits: [],
      applicationUrl: raw.applicationUrl,
      atsProvider: "other",
      rawData: raw.rawData ?? raw,
    };
  },
};

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function readNumber(value: unknown, key: string, fallback: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "number" ? found : fallback;
}
