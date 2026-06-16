import type { Prisma } from "@prisma/client";
import { createJobContentHash } from "@/lib/job-search/dedupe";
import { mergeSearchQuerySourceConfig } from "@/lib/job-search/source-catalog";
import { prisma } from "@/lib/prisma";

export type LinkedInLeadInput = {
  pageUrl?: string | null;
  applicationUrl?: string | null;
  company?: string | null;
  title?: string | null;
  location?: string | null;
  description?: string | null;
  selectedText?: string | null;
  pageTitle?: string | null;
  metadata?: Record<string, unknown>;
};

export function linkedInJobUrl(input: Pick<LinkedInLeadInput, "pageUrl" | "applicationUrl">) {
  return [input.applicationUrl, input.pageUrl].find((value) => isLinkedInJobUrl(value)) ?? null;
}

export function isLinkedInJobUrl(value?: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return /(^|\.)linkedin\.com$/i.test(url.hostname) && /^\/jobs\/view\//i.test(url.pathname);
  } catch {
    return false;
  }
}

export function linkedInLeadHasEnoughDetail(input: LinkedInLeadInput) {
  const detailText = `${input.description ?? ""}\n${input.selectedText ?? ""}`.trim();
  return Boolean(input.company?.trim() && input.title?.trim() && detailText.length >= 40);
}

export function buildLinkedInOriginalPostingQueries(input: Pick<LinkedInLeadInput, "company" | "title" | "location">) {
  const company = cleanSearchTerm(input.company);
  const title = cleanSearchTerm(input.title);
  if (!company || !title) return [];
  const location = cleanSearchTerm(input.location);
  const base = `${quote(title)} ${quote(company)}`;
  const located = location ? `${base} ${quote(location)}` : base;
  return Array.from(new Set([
    `${base} careers apply -site:linkedin.com`,
    `${base} jobs apply -site:linkedin.com`,
    `${located} "greenhouse" OR "lever" OR "ashby" -site:linkedin.com`,
    `${located} "workday" OR "smartrecruiters" OR "workable" -site:linkedin.com`,
  ]));
}

export function linkedInLeadMetadata(input: LinkedInLeadInput) {
  const url = linkedInJobUrl(input);
  if (!url) return null;
  const originalApplicationUrl = originalApplyUrl(input.applicationUrl);
  return {
    leadSource: "linkedin" as const,
    linkedInJobUrl: url,
    originalApplicationUrl,
    originalPostingQueries: buildLinkedInOriginalPostingQueries(input),
    needsManualText: !linkedInLeadHasEnoughDetail(input),
    captureGuidance: linkedInLeadHasEnoughDetail(input)
      ? "LinkedIn lead captured with enough detail to score locally and search for the original posting."
      : "Paste the job title, company, and selected LinkedIn job text, or open the original employer/ATS apply link.",
  };
}

export async function captureLinkedInReviewLead(input: LinkedInLeadInput & { rawData?: Prisma.InputJsonValue }) {
  const leadUrl = linkedInJobUrl(input);
  if (!leadUrl) throw new Error("LinkedIn review lead requires a LinkedIn job URL.");
  const metadata = linkedInLeadMetadata(input);
  const applicationUrl = originalApplyUrl(input.applicationUrl);
  const source = await prisma.jobSource.upsert({
    where: { type_name: { type: "manual", name: "LinkedIn Lead" } },
    update: { enabled: true },
    create: { name: "LinkedIn Lead", type: "manual", enabled: true },
  });

  const normalized = {
    company: input.company?.trim() || "LinkedIn lead",
    title: input.title?.trim() || inferTitleFromPageTitle(input.pageTitle) || "LinkedIn job lead needs details",
    location: input.location?.trim() || null,
    description: [
      "Review-only LinkedIn lead. The app does not scrape LinkedIn jobs.",
      "Paste selected job text from LinkedIn or provide the original employer/ATS apply link so the pipeline can score it.",
      input.pageTitle ? `Captured page title: ${input.pageTitle}` : "",
      leadUrl,
    ].filter(Boolean).join("\n\n"),
    applicationUrl,
  };
  const contentHash = createJobContentHash(normalized);
  const existingConditions: Prisma.JobPostingWhereInput[] = applicationUrl
    ? [{ applicationUrl }, { contentHash }]
    : [{ contentHash }];
  const existing = await prisma.jobPosting.findFirst({
    where: { OR: existingConditions },
  });
  const rawData = {
    ...(metadata ?? {}),
    ...(input.rawData && typeof input.rawData === "object" && !Array.isArray(input.rawData) ? input.rawData : {}),
    leadSource: "linkedin",
    linkedInJobUrl: leadUrl,
    originalApplicationUrl: applicationUrl,
    pageUrl: input.pageUrl ?? null,
  };

  const job = existing
    ? await prisma.jobPosting.update({
        where: { id: existing.id },
        data: {
          ...normalized,
          sourceId: source.id,
          lastSeenAt: new Date(),
          rawData,
        },
      })
    : await prisma.jobPosting.create({
        data: {
          ...normalized,
          sourceId: source.id,
          remoteType: "unknown",
          atsProvider: "unknown",
          rawData,
          contentHash,
        },
      });

  return { job, created: !existing, metadata };
}

export async function appendLinkedInLeadQueriesToSearchBacklog(queries: string[]) {
  const cleaned = queries.filter((query) => {
    const trimmed = query.trim();
    return trimmed.length > 0 && !targetsLinkedInSite(trimmed);
  });
  if (!cleaned.length) return null;

  const source = await prisma.jobSource.findUnique({
    where: { type_name: { type: "search_query", name: "Search Query Backlog" } },
  });
  const config = mergeSearchQuerySourceConfig(source?.config);
  const merged = {
    ...config,
    queries: Array.from(new Set([...config.queries, ...cleaned])),
    linkedinLeadQueries: Array.from(new Set([
      ...(Array.isArray((config as Record<string, unknown>).linkedinLeadQueries)
        ? (config as Record<string, unknown>).linkedinLeadQueries as string[]
        : []),
      ...cleaned,
    ])),
  };

  return prisma.jobSource.upsert({
    where: { type_name: { type: "search_query", name: "Search Query Backlog" } },
    update: { enabled: true, config: merged },
    create: {
      name: "Search Query Backlog",
      type: "search_query",
      enabled: true,
      config: merged,
    },
  });
}

function cleanSearchTerm(value?: string | null) {
  return value?.replace(/["“”]/g, "").replace(/\s+/g, " ").trim() ?? "";
}

function quote(value: string) {
  return `"${value}"`;
}

function targetsLinkedInSite(query: string) {
  return /(^|\s)(?!-)(?:site:|site=)linkedin\.com\b/i.test(query);
}

function inferTitleFromPageTitle(pageTitle?: string | null) {
  if (!pageTitle) return null;
  const [firstPart] = pageTitle.split("|").map((part) => part.trim()).filter(Boolean);
  return firstPart ?? null;
}

function originalApplyUrl(value?: string | null) {
  if (!value || isLinkedInJobUrl(value)) return null;
  try {
    const url = new URL(value);
    if (/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
    return value;
  } catch {
    return null;
  }
}
