import type { JobSearchProfile, JobSource } from "@prisma/client";
import { searchQueryTemplates } from "@/lib/job-search/source-catalog";
import type { JobSourceAdapter, NormalizedJobPosting, RawJobPosting } from "@/lib/job-search/source-adapter";

type BraveSearchResult = {
  title?: string;
  url?: string;
  description?: string;
  profile?: { name?: string };
  meta_url?: { hostname?: string };
};

type BraveSearchResponse = {
  web?: {
    results?: BraveSearchResult[];
  };
};

type WorkingNomadsJob = {
  url?: string;
  title?: string;
  description?: string;
  company_name?: string;
  category_name?: string;
  tags?: string;
  location?: string;
  pub_date?: string;
};

type ListingExpansionResult = {
  jobs: RawJobPosting[];
  reason: string;
  blocked: boolean;
};

type RemotiveLead = {
  title: string;
  company?: string;
  location?: string;
  summary?: string;
  remotiveUrl: string;
};

const searchTimeoutMs = 10_000;

export const searchQueryAdapter: JobSourceAdapter = {
  name: "Search Query Backlog",
  async fetchJobs(profile: JobSearchProfile, source: JobSource) {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) return [];

    const queries = readStringArray(source.config, "queries", searchQueryTemplates);
    const maxResultsPerQuery = readNumber(source.config, "maxResultsPerQuery", 8);
    const maxFetch = readNumber(source.config, "maxFetch", Number(process.env.SEARCH_QUERY_MAX_RESULTS ?? 80));
    const results: RawJobPosting[] = [];

    for (const query of queries) {
      const payload = await fetchBraveResults(query, apiKey, maxResultsPerQuery);
      for (const result of payload) {
        if (!result.url || !result.title) continue;
        const expanded = await expandSearchResult(result, query, profile, apiKey);
        results.push(...expanded);
        if (results.length >= maxFetch) return dedupeByUrl(results).slice(0, maxFetch);
      }
    }

    return dedupeByUrl(results).slice(0, maxFetch);
  },
  async normalize(raw: RawJobPosting): Promise<NormalizedJobPosting> {
    const applicationUrl = sanitizeApplicationUrl(await resolveApplicationUrl(raw.applicationUrl));
    const haystack = `${raw.title} ${raw.location ?? ""} ${raw.description}`;
    return {
      sourceJobId: raw.sourceJobId,
      company: raw.company,
      title: raw.title,
      location: raw.location,
      remoteType: /remote/i.test(haystack) ? "remote" : /hybrid/i.test(haystack) ? "hybrid" : /on-?site/i.test(haystack) ? "onsite" : "unknown",
      description: raw.description,
      requirements: [],
      niceToHaves: [],
      benefits: [],
      applicationUrl,
      atsProvider: atsProviderFromUrl(applicationUrl),
      rawData: {
        ...(isRecord(raw.rawData) ? raw.rawData : { raw }),
        ...(applicationUrl !== raw.applicationUrl ? {
          resolvedApplicationUrl: {
            source: "job_detail_page",
            originalUrl: raw.applicationUrl,
            applicationUrl,
          },
        } : {}),
      },
    };
  },
};

async function expandSearchResult(result: BraveSearchResult, query: string, profile: JobSearchProfile, apiKey: string) {
  if (!result.url) return [];
  if (isRemotiveResult(result.url)) {
    const expanded = await fetchRemotiveAlternateJobs(result, query, profile, apiKey);
    return expanded.jobs.length ? expanded.jobs : [listingReviewFromSearchResult(result, query, expanded.reason, expanded.blocked)];
  }
  if (isBuiltInListingUrl(result.url)) {
    const expanded = await fetchListingPageJobs(result, query, profile, parseBuiltInListingJobs, "builtin");
    return expanded.jobs.length ? expanded.jobs : [listingReviewFromSearchResult(result, query, expanded.reason, expanded.blocked)];
  }
  if (isDiceListingResult(result.url)) {
    const expanded = await fetchProviderListingJobs(result, query, profile, parseDiceListingJobs, "dice");
    return expanded.jobs.length ? expanded.jobs : [listingReviewFromSearchResult(result, query, expanded.reason, expanded.blocked)];
  }
  if (isIndeedListingResult(result.url)) {
    return [listingReviewFromSearchResult(result, query, "Indeed listing pages are not fetched server-side because they return bot-protection challenges.", true)];
  }
  if (isWorkingNomadsListingResult(result.url)) {
    const expanded = await fetchWorkingNomadsListingJobs(result, query, profile);
    return expanded.jobs.length ? expanded.jobs : [listingReviewFromSearchResult(result, query, expanded.reason, expanded.blocked)];
  }
  if (isHimalayasJobUrl(result.url)) {
    const expanded = await fetchHimalayasJobResult(result, query, profile);
    return expanded.job ? [expanded.job] : [listingReviewFromSearchResult(result, query, expanded.reason, expanded.blocked)];
  }
  if (isLikelySearchListingResult(result)) {
    const expanded = await fetchListingPageJobs(result, query, profile, parseGenericListingJobs, "generic-listing");
    return expanded.jobs.length ? expanded.jobs : [listingReviewFromSearchResult(result, query, expanded.reason, expanded.blocked)];
  }
  return [jobFromSearchResult(result, query, profile)];
}

function jobFromSearchResult(result: BraveSearchResult, query: string, profile: JobSearchProfile): RawJobPosting {
  const url = result.url ?? "";
  return {
    sourceJobId: `search:${stableId(url)}`,
    company: result.profile?.name ?? companyFromUrl(url),
    title: cleanTitle(result.title ?? "Search result"),
    location: locationFromQuery(query),
    description: [result.description, `Matched query: ${query}`, profile.name ? `Profile: ${profile.name}` : ""].filter(Boolean).join("\n\n"),
    applicationUrl: url,
    rawData: { provider: "brave", query, result },
  };
}

async function fetchRemotiveAlternateJobs(result: BraveSearchResult, query: string, profile: JobSearchProfile, apiKey: string): Promise<ListingExpansionResult> {
  const lead = remotiveLeadFromSearchResult(result, query);
  if (!lead) return { jobs: [], reason: "Remotive listing is paywall-gated and did not expose enough public lead metadata for alternate discovery.", blocked: true };

  for (const alternateQuery of remotiveAlternateQueries(lead)) {
    const alternateResults = await fetchBraveResults(alternateQuery, apiKey, 8);
    const friendly = alternateResults.find((alternate) => isFriendlyRemotiveAlternate(alternate, lead));
    if (!friendly?.url) continue;
    return {
      jobs: [remotiveAlternateJob(friendly, alternateQuery, profile, lead, result)],
      reason: "Resolved Remotive lead to a friendly alternate application URL.",
      blocked: false,
    };
  }

  return {
    jobs: [],
    reason: "Remotive listing is paywall-gated and no friendly alternate URL was found.",
    blocked: true,
  };
}

function remotiveLeadFromSearchResult(result: BraveSearchResult, query: string): RemotiveLead | null {
  if (!result.url) return null;
  const titleParts = cleanTitle(result.title ?? "")
    .replace(/\s+\|\s*Remotive\.com$/i, "")
    .split(/\s+[•|-]\s+/)
    .map((part) => cleanText(part))
    .filter(Boolean);
  const title = titleParts[0] || cleanTitle(result.title ?? "");
  const company = titleParts.length > 1 && !/\[company name\]/i.test(titleParts[1] ?? "") ? titleParts[1] : undefined;
  const summary = cleanText(result.description ?? "");
  const location = firstMatch(summary, /\b(Worldwide|USA|United States|Europe|Canada|Remote)\b/i);
  if (!title || /^remote jobs\b/i.test(title)) return null;
  return {
    title,
    company,
    location,
    summary,
    remotiveUrl: result.url,
  };
}

function remotiveAlternateQueries(lead: RemotiveLead) {
  const title = quoteSearchTerm(lead.title);
  const company = lead.company ? quoteSearchTerm(lead.company) : "";
  const base = company ? `${company} ${title}` : title;
  return [
    `${base} jobs`,
    `site:jobs.ashbyhq.com ${base}`,
    `site:boards.greenhouse.io ${base}`,
    `site:job-boards.greenhouse.io ${base}`,
    `site:jobs.lever.co ${base}`,
    `site:workdayjobs.com ${base}`,
    `${base} careers apply`,
  ];
}

function quoteSearchTerm(value: string) {
  const cleaned = cleanText(value).replace(/"/g, "");
  return cleaned.includes(" ") ? `"${cleaned}"` : cleaned;
}

function isFriendlyRemotiveAlternate(result: BraveSearchResult, lead: RemotiveLead) {
  if (!result.url || isRemotiveResult(result.url) || isKnownListingUrl(result.url) || isLikelySocialOrShareUrl(result.url)) return false;
  if (isUnsafeApplicationListingUrl(result.url)) return false;
  if (!friendlyAlternateUrl(result.url)) return false;
  const haystack = cleanText(`${result.title ?? ""} ${result.description ?? ""}`).toLowerCase();
  const titleTokens = tokenSet(lead.title);
  const companyTokens = tokenSet(lead.company ?? "");
  const titleMatch = titleTokens.length === 0 || titleTokens.some((token) => haystack.includes(token));
  const companyMatch = companyTokens.length === 0 || companyTokens.some((token) => haystack.includes(token));
  return titleMatch && companyMatch;
}

function friendlyAlternateUrl(value: string) {
  const provider = atsProviderFromUrl(value);
  if (provider !== "other") return true;
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, "");
    if (/(linkedin\.com|indeed\.com|dice\.com|builtin\.com|himalayas\.app|workingnomads\.com|remotive\.com|facebook\.com|x\.com|twitter\.com)/i.test(hostname)) return false;
    return /\/(careers?|jobs?|job|openings?|positions?|apply)\b/i.test(url.pathname);
  } catch {
    return false;
  }
}

function tokenSet(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !["senior", "staff", "remote", "engineer", "developer", "software"].includes(token));
}

function remotiveAlternateJob(result: BraveSearchResult, alternateQuery: string, profile: JobSearchProfile, lead: RemotiveLead, remotiveResult: BraveSearchResult): RawJobPosting {
  const job = jobFromSearchResult({
    ...result,
    title: result.title ?? lead.title,
    description: result.description ?? lead.summary,
    profile: result.profile ?? (lead.company ? { name: lead.company } : undefined),
  }, alternateQuery, profile);
  return {
    ...job,
    company: lead.company ?? job.company,
    title: cleanTitle(result.title ?? lead.title),
    location: lead.location ?? job.location,
    description: [
      cleanText(result.description ?? lead.summary ?? ""),
      `Discovered via Remotive lead: ${lead.remotiveUrl}`,
      `Remotive source must be attributed when used.`,
      `Matched alternate query: ${alternateQuery}`,
      profile.name ? `Profile: ${profile.name}` : "",
    ].filter(Boolean).join("\n\n"),
    rawData: {
      provider: "brave",
      expansionProvider: "remotive-alternate",
      expandedFrom: lead.remotiveUrl,
      query: alternateQuery,
      result,
      remotiveLead: lead,
      remotiveResult,
    },
  };
}

async function fetchHimalayasJobResult(result: BraveSearchResult, query: string, profile: JobSearchProfile) {
  if (!result.url) return { job: null, reason: "Missing Himalayas job URL.", blocked: false };
  try {
    const response = await fetch(result.url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "JobSearchOS/1.0",
      },
      signal: AbortSignal.timeout(searchTimeoutMs),
    });
    if (!response.ok) {
      return { job: null, reason: `Himalayas job page returned HTTP ${response.status}.`, blocked: response.status === 401 || response.status === 403 };
    }
    const html = await response.text();
    if (isBlockedListingHtml(html)) {
      return { job: null, reason: "Himalayas job page returned a bot-protection/block page.", blocked: true };
    }
    const applicationUrl = extractHimalayasApplyUrl(html, result.url);
    if (!applicationUrl) {
      return { job: null, reason: "Himalayas job page did not expose a direct application URL.", blocked: false };
    }

    return {
      job: {
        ...jobFromSearchResult(result, query, profile),
        applicationUrl,
        rawData: {
          provider: "brave",
          expansionProvider: "himalayas",
          expandedFrom: result.url,
          query,
          result,
        },
      },
      reason: "Resolved Himalayas job page to direct application URL.",
      blocked: false,
    };
  } catch {
    return { job: null, reason: "Himalayas job page could not be fetched.", blocked: true };
  }
}

function listingReviewFromSearchResult(result: BraveSearchResult, query: string, reason: string, blocked = false): RawJobPosting {
  const url = result.url ?? "";
  return {
    sourceJobId: `search:listing-review:${stableId(url)}`,
    company: result.profile?.name ?? companyFromUrl(url),
    title: cleanTitle(result.title ?? "Search listing page"),
    location: locationFromQuery(query),
    description: [
      result.description,
      `Search listing page review: ${reason}`,
      `Matched query: ${query}`,
    ].filter(Boolean).join("\n\n"),
    applicationUrl: url,
    listingReview: {
      url,
      reason,
      sourceTitle: result.title,
      sourceDescription: result.description,
      provider: "brave",
      query,
      blocked,
    },
    rawData: { provider: "brave", query, result, listingReview: true, reason, blocked },
  };
}

async function fetchListingPageJobs(
  result: BraveSearchResult,
  query: string,
  profile: JobSearchProfile,
  parser: (html: string, result: BraveSearchResult, query: string, profile: JobSearchProfile) => RawJobPosting[],
  expansionProvider: string,
): Promise<ListingExpansionResult> {
  if (!result.url) return { jobs: [], reason: "Missing listing page URL.", blocked: false };
  try {
    const response = await fetch(result.url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "JobSearchOS/1.0",
      },
      signal: AbortSignal.timeout(searchTimeoutMs),
    });
    if (!response.ok) {
      return { jobs: [], reason: `${expansionProvider} listing page returned HTTP ${response.status}.`, blocked: response.status === 401 || response.status === 403 };
    }
    const html = await response.text();
    if (isBlockedListingHtml(html)) {
      return { jobs: [], reason: `${expansionProvider} listing page returned a bot-protection/block page.`, blocked: true };
    }
    const jobs = parser(html, result, query, profile);
    return { jobs, reason: jobs.length ? "Expanded listing page into individual jobs." : `${expansionProvider} listing page had no parseable individual job links.`, blocked: false };
  } catch {
    return { jobs: [], reason: `${expansionProvider} listing page could not be fetched.`, blocked: true };
  }
}

async function fetchProviderListingJobs(
  result: BraveSearchResult,
  query: string,
  profile: JobSearchProfile,
  parser: (html: string, result: BraveSearchResult, query: string, profile: JobSearchProfile) => RawJobPosting[],
  expansionProvider: string,
): Promise<ListingExpansionResult> {
  return fetchListingPageJobs(result, query, profile, parser, expansionProvider);
}

async function fetchWorkingNomadsListingJobs(result: BraveSearchResult, query: string, profile: JobSearchProfile): Promise<ListingExpansionResult> {
  if (!result.url) return { jobs: [], reason: "Missing Working Nomads listing URL.", blocked: false };
  try {
    const listingUrl = new URL(result.url);
    const response = await fetch(new URL("/api/exposed_jobs/", listingUrl).toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "JobSearchOS/1.0",
      },
      signal: AbortSignal.timeout(searchTimeoutMs),
    });
    if (!response.ok) {
      return { jobs: [], reason: `Working Nomads API returned HTTP ${response.status}.`, blocked: response.status === 401 || response.status === 403 };
    }
    const payload = await response.json().catch(() => null) as unknown;
    if (!Array.isArray(payload)) {
      return { jobs: [], reason: "Working Nomads API returned an unexpected payload.", blocked: false };
    }
    const jobs = payload
      .filter(isWorkingNomadsJob)
      .filter((job) => matchesWorkingNomadsListing(job, listingUrl, query))
      .map((job) => workingNomadsJobToRawPosting(job, result, query, profile, listingUrl.toString()))
      .slice(0, 50);
    return {
      jobs: dedupeByUrl(jobs),
      reason: jobs.length ? "Expanded Working Nomads listing through public jobs API." : "Working Nomads API had no matching jobs for this listing.",
      blocked: false,
    };
  } catch {
    return { jobs: [], reason: "Working Nomads listing could not be expanded through the public jobs API.", blocked: true };
  }
}

export function parseBuiltInListingJobs(html: string, result: BraveSearchResult, query: string, profile: JobSearchProfile) {
  if (!result.url) return [];
  const listingUrl = result.url;
  const companiesByUrl = parseBuiltInCompaniesByUrl(html, listingUrl);
  const jobs: RawJobPosting[] = [];

  for (const item of parseJsonLdItemListElements(html)) {
    const jobUrl = absoluteUrl(item.url, listingUrl);
    if (!jobUrl || !isBuiltInJobUrl(jobUrl)) continue;
    const title = cleanTitle(item.name ?? "");
    if (!title) continue;
    const company = companiesByUrl.get(urlPathKey(jobUrl)) ?? result.profile?.name ?? "Built In";
    const description = cleanText(item.description ?? result.description ?? "");
    jobs.push({
      sourceJobId: `search:builtin:${stableId(jobUrl)}`,
      company,
      title,
      location: locationFromQuery(query),
      description: [
        description,
        `Expanded from: ${listingUrl}`,
        `Matched query: ${query}`,
        profile.name ? `Profile: ${profile.name}` : "",
      ].filter(Boolean).join("\n\n"),
      applicationUrl: jobUrl,
      rawData: {
        provider: "brave",
        expansionProvider: "builtin",
        expandedFrom: listingUrl,
        query,
        result,
        item,
      },
    });
  }

  return dedupeByUrl(jobs);
}

export function parseGenericListingJobs(html: string, result: BraveSearchResult, query: string, profile: JobSearchProfile) {
  if (!result.url) return [];
  const listingUrl = result.url;
  const jobs: RawJobPosting[] = [];

  for (const item of parseJsonLdItemListElements(html)) {
    const jobUrl = absoluteUrl(item.url, listingUrl);
    if (!jobUrl || isSameUrlWithoutSearch(jobUrl, listingUrl) || isLikelyListingUrl(jobUrl)) continue;
    const title = cleanTitle(item.name ?? "");
    if (!isPlausibleJobTitle(title)) continue;
    jobs.push(jobFromExpandedListing({
      jobUrl,
      title,
      company: result.profile?.name ?? companyFromUrl(jobUrl),
      description: item.description ?? result.description ?? "",
      listingUrl,
      query,
      profile,
      result,
      expansionProvider: "generic-listing",
      item,
    }));
  }

  for (const item of parseJobAnchors(html, listingUrl)) {
    if (jobs.some((job) => job.applicationUrl === item.url)) continue;
    if (isSameUrlWithoutSearch(item.url, listingUrl) || isLikelyListingUrl(item.url)) continue;
    if (!isPlausibleJobTitle(item.title)) continue;
    jobs.push(jobFromExpandedListing({
      jobUrl: item.url,
      title: item.title,
      company: result.profile?.name ?? companyFromUrl(item.url),
      description: result.description ?? "",
      listingUrl,
      query,
      profile,
      result,
      expansionProvider: "generic-listing",
      item,
    }));
  }

  return dedupeByUrl(jobs).slice(0, 50);
}

export function parseDiceListingJobs(html: string, result: BraveSearchResult, query: string, profile: JobSearchProfile) {
  if (!result.url) return [];
  const listingUrl = result.url;
  const jobs: RawJobPosting[] = [];

  for (const item of parseDiceEmbeddedJobs(html, listingUrl)) {
    if (jobs.some((job) => job.applicationUrl === item.detailsPageUrl)) continue;
    jobs.push(jobFromExpandedListing({
      jobUrl: item.detailsPageUrl,
      title: item.title ?? result.title ?? "Dice job",
      company: item.companyName ?? result.profile?.name ?? "Dice",
      location: item.location,
      description: diceEmbeddedJobDescription(item, result.description),
      listingUrl,
      query,
      profile,
      result,
      expansionProvider: "dice",
      item,
    }));
  }

  for (const item of parseJsonLdItemListElements(html)) {
    const jobUrl = absoluteUrl(item.url, listingUrl);
    if (!jobUrl || !isDiceJobDetailUrl(jobUrl)) continue;
    jobs.push(jobFromExpandedListing({
      jobUrl,
      title: cleanTitle(item.name ?? result.title ?? "Dice job"),
      company: result.profile?.name ?? "Dice",
      description: item.description ?? result.description ?? "",
      listingUrl,
      query,
      profile,
      result,
      expansionProvider: "dice",
      item,
    }));
  }

  for (const item of parseJobAnchors(html, listingUrl)) {
    if (!isDiceJobDetailUrl(item.url)) continue;
    if (jobs.some((job) => job.applicationUrl === item.url)) continue;
    jobs.push(jobFromExpandedListing({
      jobUrl: item.url,
      title: isPlausibleJobTitle(item.title) ? item.title : cleanTitle(result.title ?? "Dice job"),
      company: result.profile?.name ?? "Dice",
      description: result.description ?? "",
      listingUrl,
      query,
      profile,
      result,
      expansionProvider: "dice",
      item,
    }));
  }

  for (const jobUrl of extractDiceJobDetailUrls(html, listingUrl)) {
    if (jobs.some((job) => job.applicationUrl === jobUrl)) continue;
    jobs.push(jobFromExpandedListing({
      jobUrl,
      title: cleanTitle(result.title ?? "Dice job"),
      company: result.profile?.name ?? "Dice",
      description: result.description ?? "",
      listingUrl,
      query,
      profile,
      result,
      expansionProvider: "dice",
      item: { url: jobUrl },
    }));
  }

  return dedupeByUrl(jobs).slice(0, 50);
}

function workingNomadsJobToRawPosting(
  job: WorkingNomadsJob,
  result: BraveSearchResult,
  query: string,
  profile: JobSearchProfile,
  listingUrl: string,
): RawJobPosting {
  const detailUrl = absoluteUrl(job.url, listingUrl) ?? listingUrl;
  const applicationUrl = extractWorkingNomadsApplyUrl(job.description ?? "", detailUrl) ?? detailUrl;
  return {
    sourceJobId: `search:workingnomads:${stableId(detailUrl)}`,
    company: cleanText(job.company_name ?? result.profile?.name ?? "Working Nomads"),
    title: cleanTitle(job.title ?? result.title ?? "Working Nomads job"),
    location: cleanText(job.location ?? locationFromQuery(query) ?? "Remote"),
    description: [
      cleanText(job.description ?? result.description ?? ""),
      job.category_name ? `Category: ${job.category_name}` : "",
      job.tags ? `Tags: ${job.tags}` : "",
      `Expanded from: ${listingUrl}`,
      `Matched query: ${query}`,
      profile.name ? `Profile: ${profile.name}` : "",
    ].filter(Boolean).join("\n\n"),
    applicationUrl,
    rawData: {
      provider: "brave",
      expansionProvider: "workingnomads",
      expandedFrom: listingUrl,
      detailUrl,
      query,
      result,
      item: job,
    },
  };
}

function jobFromExpandedListing(input: {
  jobUrl: string;
  title: string;
  company: string;
  location?: string;
  description: string;
  listingUrl: string;
  query: string;
  profile: JobSearchProfile;
  result: BraveSearchResult;
  expansionProvider: string;
  item: unknown;
}): RawJobPosting {
  return {
    sourceJobId: `search:${input.expansionProvider}:${stableId(input.jobUrl)}`,
    company: input.company,
    title: cleanTitle(input.title),
    location: input.location ?? locationFromQuery(input.query),
    description: [
      cleanText(input.description),
      `Expanded from: ${input.listingUrl}`,
      `Matched query: ${input.query}`,
      input.profile.name ? `Profile: ${input.profile.name}` : "",
    ].filter(Boolean).join("\n\n"),
    applicationUrl: input.jobUrl,
    rawData: {
      provider: "brave",
      expansionProvider: input.expansionProvider,
      expandedFrom: input.listingUrl,
      query: input.query,
      result: input.result,
      item: input.item,
    },
  };
}

async function fetchBraveResults(query: string, apiKey: string, count: number) {
  try {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.min(20, Math.max(1, count))));
    url.searchParams.set("search_lang", "en");
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "JobSearchOS/1.0",
        "X-Subscription-Token": apiKey,
      },
      signal: AbortSignal.timeout(searchTimeoutMs),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as BraveSearchResponse;
    return payload.web?.results ?? [];
  } catch {
    return [];
  }
}

function readStringArray(value: unknown, key: string, fallback: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const found = (value as Record<string, unknown>)[key];
  return Array.isArray(found) ? found.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : fallback;
}

function readNumber(value: unknown, key: string, fallback: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "number" && Number.isFinite(found) ? Math.max(1, Math.round(found)) : fallback;
}

type BuiltInItemListElement = {
  name?: string;
  url?: string;
  description?: string;
};

function parseJsonLdItemListElements(html: string): BuiltInItemListElement[] {
  const elements: BuiltInItemListElement[] = [];
  const scriptPattern = /<script\b[^>]*type=["'][^"']*ld(?:\+|&#x2B;|&#43;)json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptPattern.exec(html))) {
    const json = parseJson(decodeHtmlEntities(match[1] ?? ""));
    if (!json) continue;
    const nodes = Array.isArray(json) ? json : [json];
    for (const node of nodes.flatMap(jsonGraphNodes)) {
      if (!isRecord(node)) continue;
      const itemList = node.itemListElement;
      if (!Array.isArray(itemList)) continue;
      for (const item of itemList) {
        const parsed = itemListElementToJob(item);
        if (parsed) elements.push(parsed);
      }
    }
  }

  return elements;
}

function jsonGraphNodes(value: unknown): unknown[] {
  if (!isRecord(value)) return [];
  return Array.isArray(value["@graph"]) ? value["@graph"] : [value];
}

function itemListElementToJob(value: unknown): BuiltInItemListElement | null {
  if (!isRecord(value)) return null;
  const nested = isRecord(value.item) ? value.item : value;
  const name = stringValue(nested.name ?? value.name);
  const url = stringValue(nested.url ?? value.url);
  const description = stringValue(nested.description ?? value.description);
  if (!name || !url) return null;
  return { name: cleanText(name), url, description: description ? cleanText(description) : undefined };
}

function parseBuiltInCompaniesByUrl(html: string, baseUrl: string) {
  const companiesByUrl = new Map<string, string>();
  const cardPattern = /<div\b[^>]*id=["']job-card-[^"']+["'][\s\S]*?(?=<div\b[^>]*id=["']job-card-|<div\b[^>]*class=["'][^"']*d-flex justify-content-center|<\/main>|$)/gi;
  let cardMatch: RegExpExecArray | null;

  while ((cardMatch = cardPattern.exec(html))) {
    const cardHtml = cardMatch[0] ?? "";
    const company = cleanText(firstMatch(cardHtml, /data-id=["']company-title["'][\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) ?? "");
    const titleAnchorAttributes = firstMatch(cardHtml, /<a\s+([^>]*data-id=["']job-card-title["'][^>]*)>/i);
    const href = titleAnchorAttributes ? firstMatch(titleAnchorAttributes, /\b(?:href|data-alias)=["']([^"']+)["']/i) : undefined;
    const jobUrl = href ? absoluteUrl(decodeHtmlEntities(href), baseUrl) : undefined;
    if (company && jobUrl) companiesByUrl.set(urlPathKey(jobUrl), company);
  }

  return companiesByUrl;
}

function parseJobAnchors(html: string, baseUrl: string) {
  const jobs: Array<{ title: string; url: string }> = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html))) {
    const attributes = match[1] ?? "";
    const href = firstMatch(attributes, /\bhref=["']([^"']+)["']/i);
    const url = href ? absoluteUrl(decodeHtmlEntities(href), baseUrl) : undefined;
    if (!url) continue;
    const title = cleanText(match[2] ?? "");
    if (!title || title.length > 180) continue;
    jobs.push({ title, url });
  }

  return jobs;
}

function isLikelySearchListingResult(result: BraveSearchResult) {
  if (!result.url) return false;
  if (isKnownListingUrl(result.url)) return true;
  if (!isLikelyListingUrl(result.url)) return false;

  const haystack = `${result.title ?? ""} ${result.description ?? ""}`.toLowerCase();
  const hasRoleSignal = /\b(frontend|front-end|software|engineer|developer|react|typescript|product engineer|staff|senior)\b/.test(haystack);
  const hasListingSignal = /\b(jobs|job search|open roles|open positions|total jobs|hiring|remote jobs|search results)\b/.test(haystack);
  return hasRoleSignal && hasListingSignal;
}

function isDiceListingResult(value: string) {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "") === "dice.com" && isDiceListingUrl(url);
  } catch {
    return false;
  }
}

function isIndeedListingResult(value: string) {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "") === "indeed.com" && isIndeedListingUrl(url);
  } catch {
    return false;
  }
}

function isWorkingNomadsListingResult(value: string) {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "") === "workingnomads.com" && isWorkingNomadsListingUrl(url);
  } catch {
    return false;
  }
}

function isRemotiveResult(value: string) {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "") === "remotive.com" && url.pathname.startsWith("/remote-jobs");
  } catch {
    return false;
  }
}

function isKnownListingUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, "");
    if (hostname === "remoterocketship.com" && url.pathname.startsWith("/jobs/")) return true;
    if (hostname === "remotive.com" && url.pathname.startsWith("/remote-jobs")) return true;
    if (hostname === "indeed.com" && isIndeedListingUrl(url)) return true;
    if (hostname === "dice.com" && isDiceListingUrl(url)) return true;
    if (hostname === "workingnomads.com" && isWorkingNomadsListingUrl(url)) return true;
    return false;
  } catch {
    return false;
  }
}

function isLikelyListingUrl(value: string) {
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();
    const listingParams = ["page", "sort", "jobtitle", "seniority", "q", "query", "search", "location", "remote", "department", "category"];
    const paramMatches = Array.from(url.searchParams.keys()).filter((key) => listingParams.includes(key.toLowerCase())).length;
    if (url.hostname.replace(/^www\./, "") === "indeed.com" && isIndeedListingUrl(url)) return true;
    if (url.hostname.replace(/^www\./, "") === "dice.com" && isDiceListingUrl(url)) return true;
    if (url.hostname.replace(/^www\./, "") === "workingnomads.com" && isWorkingNomadsListingUrl(url)) return true;
    if (paramMatches >= 2) return true;
    if (/\/(jobs|careers|open-roles|positions)\/(search|remote|engineering|software|frontend|front-end|developer|dev-engineering)/i.test(path)) return true;
    if (/\/(search|job-search|jobs\/search)\b/i.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

function isIndeedListingUrl(url: URL) {
  const path = url.pathname.toLowerCase();
  if (path === "/jobs" || path === "/m/jobs") return true;
  if (/^\/q-.+-jobs\.html$/i.test(path)) return true;
  if (url.searchParams.has("q") || url.searchParams.has("l") || url.searchParams.has("vjk")) return true;
  return false;
}

function isDiceListingUrl(url: URL) {
  const path = url.pathname.toLowerCase();
  if (path === "/jobs" || path === "/jobs/") return true;
  if (/^\/jobs\/q-.+/i.test(path)) return true;
  if (/^\/jobs\/l-.+/i.test(path)) return true;
  if (url.searchParams.has("q") || url.searchParams.has("location") || url.searchParams.has("page")) return true;
  return false;
}

function isWorkingNomadsListingUrl(url: URL) {
  const path = url.pathname.toLowerCase();
  if (path === "/jobs" || path === "/jobs/") return true;
  if (/^\/remote-.+-jobs\/?$/i.test(path)) return true;
  if (/^\/remote-jobs-by-/i.test(path)) return true;
  return false;
}

function isDiceJobDetailUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "") === "dice.com" && /^\/job-detail\/[a-f0-9-]{24,}$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function extractDiceJobDetailUrls(html: string, baseUrl: string) {
  const urls = new Set<string>();
  const absolutePattern = /https:\/\/www\.dice\.com\/job-detail\/[a-f0-9-]{24,}/gi;
  const relativePattern = /\/job-detail\/[a-f0-9-]{24,}/gi;
  for (const match of html.matchAll(absolutePattern)) {
    const resolved = absoluteUrl(match[0], baseUrl);
    if (resolved && isDiceJobDetailUrl(resolved)) urls.add(resolved);
  }
  for (const match of html.matchAll(relativePattern)) {
    const resolved = absoluteUrl(match[0], baseUrl);
    if (resolved && isDiceJobDetailUrl(resolved)) urls.add(resolved);
  }
  return [...urls];
}

type DiceEmbeddedJob = {
  guid?: string;
  detailsPageUrl: string;
  title?: string;
  companyName?: string;
  summary?: string;
  location?: string;
  employmentType?: string;
  postedDate?: string;
  modifiedDate?: string;
  easyApply?: boolean;
  workplaceTypes?: string[];
};

function parseDiceEmbeddedJobs(html: string, baseUrl: string) {
  const decoded = decodeHtmlEntities(html);
  const jobs = new Map<string, DiceEmbeddedJob>();

  for (const segment of diceEmbeddedJobSegments(decoded)) {
    const guid = extractDiceField(segment, "guid");
    const detailsPageUrl = absoluteUrl(extractDiceField(segment, "detailsPageUrl"), baseUrl)
      ?? (guid ? `https://www.dice.com/job-detail/${guid}` : undefined);
    if (!detailsPageUrl || !isDiceJobDetailUrl(detailsPageUrl)) continue;
    if (jobs.has(detailsPageUrl)) continue;
    jobs.set(detailsPageUrl, {
      guid,
      detailsPageUrl,
      title: extractDiceField(segment, "title"),
      companyName: extractDiceField(segment, "companyName"),
      summary: extractDiceField(segment, "summary"),
      location: extractDiceField(segment, "displayName"),
      employmentType: extractDiceField(segment, "employmentType"),
      postedDate: extractDiceField(segment, "postedDate"),
      modifiedDate: extractDiceField(segment, "modifiedDate"),
      easyApply: extractDiceBooleanField(segment, "easyApply"),
      workplaceTypes: extractDiceStringArrayField(segment, "workplaceTypes"),
    });
  }

  return [...jobs.values()];
}

function diceEmbeddedJobSegments(decodedHtml: string) {
  const segments: string[] = [];
  const detailUrlPattern = /(?:\\")?detailsPageUrl(?:\\")?\s*:\s*(?:\\")?/g;
  let match: RegExpExecArray | null;

  while ((match = detailUrlPattern.exec(decodedHtml))) {
    const matchIndex = match.index;
    const escapedStart = decodedHtml.lastIndexOf("{\\\"id\\\"", matchIndex);
    const plainStart = decodedHtml.lastIndexOf("{\"id\"", matchIndex);
    const start = Math.max(escapedStart, plainStart);
    if (start < 0) continue;

    const escapedNext = decodedHtml.indexOf("{\\\"id\\\"", matchIndex + 1);
    const plainNext = decodedHtml.indexOf("{\"id\"", matchIndex + 1);
    const nextStarts = [escapedNext, plainNext].filter((index) => index > matchIndex);
    const end = nextStarts.length ? Math.min(...nextStarts) : Math.min(decodedHtml.length, matchIndex + 8_000);
    segments.push(decodedHtml.slice(start, end));
  }

  return segments;
}

function extractDiceField(segment: string, field: string) {
  return extractDiceEscapedField(segment, field) ?? extractDicePlainField(segment, field);
}

function extractDiceEscapedField(segment: string, field: string) {
  const match = new RegExp(`\\\\\\"${field}\\\\\\"\\s*:\\s*\\\\\\"((?:\\\\\\\\.|[^\\\\"])*)\\\\\\"`).exec(segment);
  return match?.[1] ? decodeJsonStringFragment(match[1]) : undefined;
}

function extractDicePlainField(segment: string, field: string) {
  const match = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`).exec(segment);
  return match?.[1] ? decodeJsonStringFragment(match[1]) : undefined;
}

function extractDiceBooleanField(segment: string, field: string) {
  const escaped = new RegExp(`\\\\\\"${field}\\\\\\"\\s*:\\s*(true|false)`).exec(segment);
  const plain = new RegExp(`"${field}"\\s*:\\s*(true|false)`).exec(segment);
  const value = escaped?.[1] ?? plain?.[1];
  return value ? value === "true" : undefined;
}

function extractDiceStringArrayField(segment: string, field: string) {
  const escaped = new RegExp(`\\\\\\"${field}\\\\\\"\\s*:\\s*\\[((?:\\\\\\"[^\\\\"]*\\\\\\"\\s*,?\\s*)*)\\]`).exec(segment);
  if (escaped?.[1]) {
    return [...escaped[1].matchAll(/\\\"((?:\\\\.|[^\\"])*)\\\"/g)].map((match) => decodeJsonStringFragment(match[1] ?? "")).filter(Boolean);
  }
  const plain = new RegExp(`"${field}"\\s*:\\s*\\[((?:"(?:\\\\.|[^"\\\\])*"\\s*,?\\s*)*)\\]`).exec(segment);
  if (!plain?.[1]) return undefined;
  return [...plain[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].map((match) => decodeJsonStringFragment(match[1] ?? "")).filter(Boolean);
}

function decodeJsonStringFragment(value: string) {
  try {
    return cleanText(JSON.parse(`"${value}"`));
  } catch {
    return cleanText(value
      .replace(/\\u([0-9a-f]{4})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
      .replace(/\\"/g, "\"")
      .replace(/\\\//g, "/"));
  }
}

function diceEmbeddedJobDescription(job: DiceEmbeddedJob, fallback?: string) {
  return [
    job.summary ?? fallback ?? "",
    job.employmentType ? `Employment type: ${job.employmentType}` : "",
    job.workplaceTypes?.length ? `Workplace: ${job.workplaceTypes.join(", ")}` : "",
    job.easyApply === undefined ? "" : `Dice easy apply: ${job.easyApply ? "yes" : "no"}`,
    job.postedDate ? `Posted: ${job.postedDate}` : "",
    job.modifiedDate ? `Updated: ${job.modifiedDate}` : "",
  ].filter(Boolean).join("\n\n");
}

function isWorkingNomadsJob(value: unknown): value is WorkingNomadsJob {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as WorkingNomadsJob).url === "string");
}

function matchesWorkingNomadsListing(job: WorkingNomadsJob, listingUrl: URL, query: string) {
  const terms = workingNomadsListingTerms(listingUrl, query);
  if (terms.length === 0) return true;
  const haystack = cleanText([
    job.title,
    job.description,
    job.company_name,
    job.category_name,
    job.tags,
    job.location,
  ].filter(Boolean).join(" ")).toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function workingNomadsListingTerms(listingUrl: URL, query: string) {
  const pathTerms = listingUrl.pathname
    .toLowerCase()
    .replace(/^\/remote-/, "")
    .replace(/-jobs\/?$/, "")
    .split("-")
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !["remote", "jobs", "job", "anywhere"].includes(term));
  const queryTerms = query
    .toLowerCase()
    .match(/[a-z0-9+#.]{3,}/g)
    ?.filter((term) => !["site", "workingnomads", "com", "remote", "jobs", "job"].includes(term.replace(/[+#.]/g, ""))) ?? [];
  return [...new Set([...pathTerms, ...queryTerms.map((term) => term.replace(/[+#.]/g, ""))])];
}

function isBlockedListingHtml(html: string) {
  return /Attention Required!\s*\|\s*Cloudflare|Sorry, you have been blocked|cf-error-details|enable cookies|Just a moment|cf_chl|challenges\.cloudflare\.com/i.test(html);
}

function isSameUrlWithoutSearch(left: string, right: string) {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    leftUrl.search = "";
    leftUrl.hash = "";
    rightUrl.search = "";
    rightUrl.hash = "";
    return leftUrl.toString().replace(/\/$/, "") === rightUrl.toString().replace(/\/$/, "");
  } catch {
    return left === right;
  }
}

function isPlausibleJobTitle(value: string) {
  const title = cleanTitle(value);
  if (title.length < 8 || title.length > 180) return false;
  if (/\b(jobs|job search|all jobs|view all|next|previous|sign in|log in|subscribe|filter|sort|page \d+)\b/i.test(title)) return false;
  return /\b(engineer|developer|designer|architect|manager|lead|staff|principal|frontend|front-end|fullstack|software|product)\b/i.test(title);
}

function parseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function firstMatch(value: string, pattern: RegExp) {
  return pattern.exec(value)?.[1];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableId(value: string) {
  return Buffer.from(value).toString("base64url").slice(0, 80);
}

function cleanTitle(value: string) {
  return cleanText(value);
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

function companyFromUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "");
    return hostname.split(".")[0]?.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) || hostname;
  } catch {
    return "Search result";
  }
}

function locationFromQuery(query: string) {
  if (/remote/i.test(query)) return "Remote";
  if (/united states| usa | us/i.test(query)) return "United States";
  return undefined;
}

function isBuiltInListingUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "") === "builtin.com" && url.pathname.startsWith("/jobs");
  } catch {
    return false;
  }
}

function isBuiltInJobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "") === "builtin.com" && url.pathname.startsWith("/job/");
  } catch {
    return false;
  }
}

function isHimalayasJobUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, "");
    return hostname === "himalayas.app" && /^\/companies\/[^/]+\/jobs\/[^/]+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

async function resolveApplicationUrl(value?: string) {
  if (!value) return value;
  if (isBuiltInJobUrl(value)) {
    const resolved = await resolveBuiltInJobApplicationUrl(value);
    return canonicalApplicationUrl(resolved ?? value);
  }
  if (isHimalayasJobUrl(value)) {
    const resolved = await resolveHimalayasJobApplicationUrl(value);
    return resolved ? canonicalApplicationUrl(resolved) : undefined;
  }
  return canonicalApplicationUrl(value);
}

async function resolveBuiltInJobApplicationUrl(jobUrl: string) {
  try {
    const response = await fetch(jobUrl, {
      headers: {
        Accept: "text/html",
        "User-Agent": "JobSearchOS/1.0",
      },
      signal: AbortSignal.timeout(searchTimeoutMs),
    });
    if (!response.ok) return undefined;
    const html = await response.text();
    if (isBlockedListingHtml(html)) return undefined;
    return extractBuiltInHowToApplyUrl(html, jobUrl);
  } catch {
    return undefined;
  }
}

export function extractBuiltInHowToApplyUrl(html: string, baseUrl: string) {
  const initJson = firstMatch(html, /Builtin\.jobPostInit\((\{[\s\S]*?\})\);/);
  const initPayload = initJson ? parseJson(decodeHtmlEntities(initJson)) : null;
  if (isRecord(initPayload) && isRecord(initPayload.job)) {
    const howToApply = stringValue(initPayload.job.howToApply);
    const resolved = absoluteUrl(howToApply, baseUrl);
    if (resolved) return resolved;
  }

  const externalApplyAnchor = firstMatch(html, /<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*(?:Apply|Apply Now|View Job|Continue)/i);
  const resolvedAnchor = absoluteUrl(externalApplyAnchor ? decodeHtmlEntities(externalApplyAnchor) : undefined, baseUrl);
  if (resolvedAnchor && !isBuiltInJobUrl(resolvedAnchor)) return resolvedAnchor;

  const atsUrl = firstMatch(html, /https:\/\/(?:jobs\.ashbyhq\.com|jobs\.lever\.co|boards\.greenhouse\.io|job-boards\.greenhouse\.io)\/[^"' <)]+/i);
  return absoluteUrl(atsUrl, baseUrl);
}

async function resolveHimalayasJobApplicationUrl(jobUrl: string) {
  try {
    const response = await fetch(jobUrl, {
      headers: {
        Accept: "text/html",
        "User-Agent": "JobSearchOS/1.0",
      },
      signal: AbortSignal.timeout(searchTimeoutMs),
    });
    if (!response.ok) return undefined;
    const html = await response.text();
    if (isBlockedListingHtml(html)) return undefined;
    return extractHimalayasApplyUrl(html, jobUrl);
  } catch {
    return undefined;
  }
}

export function extractHimalayasApplyUrl(html: string, baseUrl: string) {
  const directAtsUrl = firstMatch(
    html,
    /https:\/\/(?:jobs\.ashbyhq\.com|jobs\.lever\.co|boards\.greenhouse\.io|job-boards\.greenhouse\.io|apply\.workable\.com|jobs\.smartrecruiters\.com)\/[^"' <)\\]+/i,
  );
  const resolvedAtsUrl = absoluteUrl(directAtsUrl, baseUrl);
  if (resolvedAtsUrl && !isHimalayasJobUrl(resolvedAtsUrl)) return resolvedAtsUrl;

  for (const anchor of parseAnchors(html, baseUrl)) {
    if (!/\b(apply|apply now|continue|view application|start application)\b/i.test(anchor.text)) continue;
    if (isHimalayasUrl(anchor.url) || isLikelySocialOrShareUrl(anchor.url)) continue;
    return anchor.url;
  }

  return undefined;
}

function parseAnchors(html: string, baseUrl: string) {
  const anchors: Array<{ text: string; url: string }> = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html))) {
    const attributes = match[1] ?? "";
    const href = firstMatch(attributes, /\bhref=["']([^"']+)["']/i);
    const url = href ? absoluteUrl(decodeHtmlEntities(href), baseUrl) : undefined;
    if (!url) continue;
    anchors.push({ text: cleanText(match[2] ?? ""), url });
  }

  return anchors;
}

function isHimalayasUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "") === "himalayas.app";
  } catch {
    return false;
  }
}

function extractWorkingNomadsApplyUrl(html: string, baseUrl: string) {
  for (const anchor of parseAnchors(html, baseUrl)) {
    if (isWorkingNomadsUrl(anchor.url) || isLikelySocialOrShareUrl(anchor.url)) continue;
    if (/\b(apply|interested|here|job|available)\b/i.test(anchor.text) || /\/(apply|jobs?|careers?|available)\b/i.test(anchor.url)) {
      return anchor.url;
    }
  }
  const directUrl = firstMatch(html, /https?:\/\/(?!www\.workingnomads\.com)[^"' <)]+/i);
  return absoluteUrl(directUrl, baseUrl);
}

function isWorkingNomadsUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "") === "workingnomads.com";
  } catch {
    return false;
  }
}

function isLikelySocialOrShareUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "");
    return /^(linkedin\.com|twitter\.com|x\.com|facebook\.com|mailto:)/i.test(hostname) || value.startsWith("mailto:");
  } catch {
    return false;
  }
}

function canonicalApplicationUrl(value?: string) {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (url.hostname.replace(/^www\./, "") === "jobs.ashbyhq.com") {
      url.search = "";
      url.hash = "";
      const path = url.pathname.replace(/\/+$/, "");
      if (!path.endsWith("/application") && path.split("/").filter(Boolean).length >= 2) {
        url.pathname = `${path}/application`;
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}

function sanitizeApplicationUrl(value?: string) {
  if (!value) return value;
  return isUnsafeApplicationListingUrl(value) ? undefined : value;
}

function isUnsafeApplicationListingUrl(value: string) {
  if (isBuiltInListingUrl(value) || isLikelyListingUrl(value)) return true;
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, "");
    if (hostname === "dice.com") return isDiceListingUrl(url) && !isDiceJobDetailUrl(value);
    if (hostname === "indeed.com") return isIndeedListingUrl(url);
    if (hostname === "himalayas.app") return !isHimalayasJobUrl(value);
    if (hostname === "workingnomads.com") return isWorkingNomadsListingUrl(url);
    if (hostname === "remotive.com") return url.pathname.startsWith("/remote-jobs");
    return false;
  } catch {
    return false;
  }
}

function absoluteUrl(value: string | undefined, baseUrl: string) {
  if (!value) return undefined;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function urlPathKey(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname}`;
  } catch {
    return value;
  }
}

function atsProviderFromUrl(value?: string): NormalizedJobPosting["atsProvider"] {
  if (!value) return "other";
  if (/greenhouse/i.test(value)) return "greenhouse";
  if (/lever/i.test(value)) return "lever";
  if (/ashby/i.test(value)) return "ashby";
  if (/workday/i.test(value)) return "workday";
  if (/smartrecruiters/i.test(value)) return "smartrecruiters";
  if (/workable/i.test(value)) return "workable";
  return "other";
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
