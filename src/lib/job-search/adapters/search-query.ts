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
        const expanded = await expandSearchResult(result, query, profile);
        results.push(...expanded);
        if (results.length >= maxFetch) return dedupeByUrl(results).slice(0, maxFetch);
      }
    }

    return dedupeByUrl(results).slice(0, maxFetch);
  },
  async normalize(raw: RawJobPosting): Promise<NormalizedJobPosting> {
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
      applicationUrl: raw.applicationUrl,
      atsProvider: atsProviderFromUrl(raw.applicationUrl),
      rawData: raw.rawData ?? raw,
    };
  },
};

async function expandSearchResult(result: BraveSearchResult, query: string, profile: JobSearchProfile) {
  if (!result.url) return [];
  if (isBuiltInListingUrl(result.url)) {
    const expanded = await fetchListingPageJobs(result, query, profile, parseBuiltInListingJobs, "builtin");
    return expanded.jobs.length ? expanded.jobs : [listingReviewFromSearchResult(result, query, expanded.reason, expanded.blocked)];
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
) {
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

function jobFromExpandedListing(input: {
  jobUrl: string;
  title: string;
  company: string;
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
    location: locationFromQuery(input.query),
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

function isKnownListingUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, "");
    if (hostname === "remoterocketship.com" && url.pathname.startsWith("/jobs/")) return true;
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
    if (paramMatches >= 2) return true;
    if (/\/(jobs|careers|open-roles|positions)\/(search|remote|engineering|software|frontend|front-end|developer|dev-engineering)/i.test(path)) return true;
    if (/\/(search|job-search|jobs\/search)\b/i.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

function isBlockedListingHtml(html: string) {
  return /Attention Required!\s*\|\s*Cloudflare|Sorry, you have been blocked|cf-error-details|enable cookies/i.test(html);
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
