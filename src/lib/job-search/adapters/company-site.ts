import type { JobSearchProfile, JobSource } from "@prisma/client";
import { companySources, type CompanySource } from "@/lib/job-search/company-sources";
import type { JobSourceAdapter, NormalizedJobPosting, RawJobPosting } from "@/lib/job-search/source-adapter";

type AtsProvider = "greenhouse" | "lever" | "ashby";

type GreenhouseJob = { id?: number; title?: string; absolute_url?: string; content?: string; location?: { name?: string } };
type LeverPosting = {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  categories?: { location?: string; team?: string };
  descriptionPlain?: string;
  lists?: Array<{ text?: string; content?: string }>;
};
type AshbyJob = {
  id?: string;
  title?: string;
  location?: string | { name?: string };
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
};

const providerFetchTimeoutMs = 10_000;

export const companySiteAdapter: JobSourceAdapter = {
  name: "Company Career Pages",
  async fetchJobs(profile: JobSearchProfile, source: JobSource) {
    const configCompanies = readCompanies(source.config);
    const priorityMax = readNumber(source.config, "priorityMax", 2);
    const maxCompanies = readNumber(source.config, "maxCompanies", 80);
    const maxFetch = readNumber(source.config, "maxFetch", 800);
    const maxJobsPerCompany = readNumber(source.config, "maxJobsPerCompany", 12);
    const companies = (configCompanies.length ? configCompanies : companySources)
      .filter((company) => company.priority <= priorityMax)
      .slice(0, maxCompanies);
    const results: RawJobPosting[] = [];

    for (const company of companies) {
      const companyJobs = await fetchCompanyJobs(company, profile);
      results.push(...companyJobs.slice(0, maxJobsPerCompany));
      if (results.length >= maxFetch) break;
    }

    return dedupeByProviderAndId(results).slice(0, maxFetch);
  },
  async normalize(raw: RawJobPosting): Promise<NormalizedJobPosting> {
    const rawData = raw.rawData as { provider?: AtsProvider; categories?: string[]; searchTerms?: string[] } | undefined;
    const locationText = `${raw.location ?? ""} ${raw.description}`;
    return {
      sourceJobId: raw.sourceJobId,
      company: raw.company,
      title: raw.title,
      location: raw.location,
      remoteType: /remote/i.test(locationText) ? "remote" : /hybrid/i.test(locationText) ? "hybrid" : /on-?site/i.test(locationText) ? "onsite" : "unknown",
      description: raw.description,
      requirements: rawData?.searchTerms ?? [],
      niceToHaves: rawData?.categories ?? [],
      benefits: [],
      applicationUrl: raw.applicationUrl,
      atsProvider: rawData?.provider ?? "unknown",
      rawData: raw.rawData ?? raw,
    };
  },
};

async function fetchCompanyJobs(company: CompanySource, profile: JobSearchProfile) {
  const providers: AtsProvider[] = ["greenhouse", "lever", "ashby"];
  const results: RawJobPosting[] = [];

  for (const provider of providers) {
    const slugs = company.atsSlugs?.[provider] ?? [];
    for (const slug of slugs) {
      const jobs = await fetchProviderJobs(provider, slug, company);
      results.push(...jobs.filter((job) => likelyProfileFit(job, company, profile)));
      if (results.length > 0) return results;
    }
  }

  return results;
}

async function fetchProviderJobs(provider: AtsProvider, slug: string, company: CompanySource) {
  try {
    if (provider === "greenhouse") return await fetchGreenhouse(slug, company);
    if (provider === "lever") return await fetchLever(slug, company);
    return await fetchAshby(slug, company);
  } catch {
    return [];
  }
}

async function fetchGreenhouse(slug: string, company: CompanySource): Promise<RawJobPosting[]> {
  const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`, {
    headers: { Accept: "application/json", "User-Agent": "JobSearchOS/1.0" },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(providerFetchTimeoutMs),
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as { jobs?: GreenhouseJob[] };
  return (payload.jobs ?? []).map((job) => ({
    sourceJobId: job.id ? `greenhouse:${slug}:${job.id}` : undefined,
    company: company.name,
    title: job.title ?? "Untitled role",
    location: job.location?.name,
    description: stripHtml(job.content ?? ""),
    applicationUrl: job.absolute_url,
    rawData: companyRawData(company, "greenhouse", slug, job),
  }));
}

async function fetchLever(slug: string, company: CompanySource): Promise<RawJobPosting[]> {
  const response = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`, {
    headers: { Accept: "application/json", "User-Agent": "JobSearchOS/1.0" },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(providerFetchTimeoutMs),
  });
  if (!response.ok) return [];
  const postings = (await response.json()) as LeverPosting[];
  return postings.map((posting) => ({
    sourceJobId: posting.id ? `lever:${slug}:${posting.id}` : undefined,
    company: company.name,
    title: posting.text ?? "Untitled role",
    location: posting.categories?.location,
    description: [posting.descriptionPlain, ...(posting.lists ?? []).map((list) => `${list.text ?? ""}\n${stripHtml(list.content ?? "")}`)]
      .filter(Boolean)
      .join("\n\n"),
    applicationUrl: posting.applyUrl ?? posting.hostedUrl,
    rawData: companyRawData(company, "lever", slug, posting),
  }));
}

async function fetchAshby(slug: string, company: CompanySource): Promise<RawJobPosting[]> {
  const response = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`, {
    headers: { Accept: "application/json", "User-Agent": "JobSearchOS/1.0" },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(providerFetchTimeoutMs),
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as { jobs?: AshbyJob[] };
  return (payload.jobs ?? []).map((job) => ({
    sourceJobId: job.id ? `ashby:${slug}:${job.id}` : undefined,
    company: company.name,
    title: job.title ?? "Untitled role",
    location: typeof job.location === "string" ? job.location : job.location?.name,
    description: stripHtml(job.descriptionPlain ?? job.descriptionHtml ?? ""),
    applicationUrl: job.applyUrl ?? job.jobUrl,
    rawData: companyRawData(company, "ashby", slug, job),
  }));
}

function likelyProfileFit(job: RawJobPosting, company: CompanySource, profile: JobSearchProfile) {
  const title = job.title.toLowerCase();
  const haystack = `${job.title} ${job.location ?? ""} ${job.description}`.toLowerCase();
  const searchTerms = [...company.searchTerms, ...readJsonStrings(profile.titles), ...readJsonStrings(profile.keywordsPreferred)];
  const titlePositive = searchTerms.some((term) => includesLoose(title, term));
  const softwareTitle = /\b(frontend|front-end|full.?stack|product engineer|ui engineer|web engineer|react|typescript|next\.?js|design systems?|frontend platform|internal tools|admin console|enterprise ui|visualization engineer|ai product)\b/i.test(title);
  const technicalBody = /\b(react|typescript|next\.?js|javascript|frontend|front-end|full.?stack|node\.?js|dashboard|data visualization|admin console|design system|storybook|webauthn|passkeys|identity|authentication)\b/i.test(haystack);
  const technicalTitle = /\b(engineer|developer|platform|tools?|ui|web|product|software|systems?)\b/i.test(title);
  const negative = /\b(intern|junior|new grad|early career|staff|principal|principle|lead|manager|director|architect|ios only|android only|backend|data engineer|firmware|embedded|wordpress|php|quantitative researcher|ml research scientist|developer advocate|developer relations|devrel|curriculum|instructor|support engineer|customer support|transformation manager|forward deployed|solutions engineer|solutions architect|solution architect|production coordinator|quality inspector|accounts payable|mechanical engineer|aerodynamics engineer|electrical engineer|electrical test engineer|emi\/emc|flight sciences engineer|flight test engineer|field operations engineer|endpoint systems engineer|business operations engineer|deputy chief engineer|developer success engineer|customer success|facilities|recruiter|sales|account executive)\b/i.test(title);
  return !negative && (titlePositive || softwareTitle || (technicalTitle && technicalBody));
}

function companyRawData(company: CompanySource, provider: AtsProvider, slug: string, job: unknown) {
  return {
    provider,
    slug,
    companySource: true,
    categories: company.categories,
    priority: company.priority,
    searchTerms: company.searchTerms,
    careersQuery: company.careersQuery,
    job,
  };
}

function readCompanies(value: unknown): CompanySource[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const found = (value as Record<string, unknown>).companies;
  if (!Array.isArray(found)) return [];
  return found.filter(isCompanySource);
}

function isCompanySource(value: unknown): value is CompanySource {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as CompanySource).name === "string" &&
      Array.isArray((value as CompanySource).categories) &&
      ((value as CompanySource).priority === 1 || (value as CompanySource).priority === 2 || (value as CompanySource).priority === 3) &&
      Array.isArray((value as CompanySource).searchTerms) &&
      typeof (value as CompanySource).careersQuery === "string",
  );
}

function readJsonStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function includesLoose(haystack: string, needle: string) {
  const normalized = needle.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
  return normalized.length > 2 && haystack.includes(normalized);
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function readNumber(value: unknown, key: string, fallback: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "number" ? found : fallback;
}

function dedupeByProviderAndId(jobs: RawJobPosting[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = job.sourceJobId ?? job.applicationUrl ?? `${job.company}-${job.title}-${job.location ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
