import { prisma } from "@/lib/prisma";

export type JoleneResultLink = {
  label: string;
  href: string;
  kind: "page" | "download" | "api";
};

export type JoleneRetrievalItem = {
  kind: "cover_letter" | "application" | "job" | "packet";
  id: string;
  label: string;
  company: string;
  title: string;
  status?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  links: JoleneResultLink[];
};

export type JoleneRetrievalResult = {
  handled: boolean;
  reply?: string;
  actionJson?: {
    action: "find_cover_letter" | "find_application_materials" | "find_application" | "find_job";
    query: string;
    resultCount: number;
    resultLinks?: JoleneResultLink[];
    results?: Array<Omit<JoleneRetrievalItem, "createdAt" | "updatedAt"> & { createdAt?: string | null; updatedAt?: string | null }>;
  };
};

type RetrievalIntent = "cover_letter" | "materials" | "application" | "job";
type RetrievalAction = "find_cover_letter" | "find_application_materials" | "find_application" | "find_job";

export async function executeJoleneRetrieval(message: string, options: { userId?: string | null } = {}): Promise<JoleneRetrievalResult> {
  const intent = parseRetrievalIntent(message);
  if (!intent) return { handled: false };

  const query = extractEntityQuery(message, intent);
  if (!query) {
    return {
      handled: true,
      reply: `Tell me the company or role you want me to find, and I can search the app data for the matching ${intentLabel(intent)}.`,
      actionJson: { action: actionForIntent(intent), query: "", resultCount: 0 },
    };
  }

  if (intent === "cover_letter" || intent === "materials") {
    return findGeneratedMaterials(query, intent, options.userId);
  }
  if (intent === "application") return findApplications(query, options.userId);
  return findJobs(query);
}

async function findGeneratedMaterials(query: string, intent: "cover_letter" | "materials", userId?: string | null): Promise<JoleneRetrievalResult> {
  const [coverLetters, applications] = await Promise.all([
    prisma.generatedCoverLetter.findMany({
      where: userId ? { userId } : undefined,
      include: {
        jobPosting: { select: { id: true, title: true, company: true } },
        applications: { select: { id: true, status: true }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.application.findMany({
      where: userId ? { userId } : undefined,
      include: {
        jobPosting: { select: { id: true, title: true, company: true } },
        applicationPackets: {
          select: { id: true, status: true, generatedCoverLetterId: true, coverLetterContent: true, updatedAt: true },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);

  const letterItems = coverLetters.map((letter) => ({
    score: scoreMatch(query, letter.jobPosting.company, letter.jobPosting.title),
    item: {
      kind: "cover_letter" as const,
      id: letter.id,
      label: `Cover letter for ${letter.jobPosting.company} - ${letter.jobPosting.title}`,
      company: letter.jobPosting.company,
      title: letter.jobPosting.title,
      status: letter.applications[0]?.status ?? null,
      createdAt: letter.createdAt,
      updatedAt: letter.updatedAt,
      links: [
        { label: "Text", href: `/api/cover-letters/${letter.id}/plain-text`, kind: "download" as const },
        { label: "PDF", href: `/api/cover-letters/${letter.id}/pdf`, kind: "download" as const },
        { label: "Generated materials", href: "/resumes/generated", kind: "page" as const },
        { label: "Job", href: `/jobs/${letter.jobPosting.id}`, kind: "page" as const },
        ...(letter.applications[0] ? [{ label: "Application", href: `/applications/${letter.applications[0].id}`, kind: "page" as const }] : []),
      ],
    },
  }));

  const packetItems = applications
    .filter((application) => {
      const packet = application.applicationPackets[0];
      return Boolean(packet?.coverLetterContent || packet?.generatedCoverLetterId);
    })
    .map((application) => ({
      score: scoreMatch(query, application.jobPosting.company, application.jobPosting.title) - 1,
      item: {
        kind: "packet" as const,
        id: application.applicationPackets[0].id,
        label: `Application packet for ${application.jobPosting.company} - ${application.jobPosting.title}`,
        company: application.jobPosting.company,
        title: application.jobPosting.title,
        status: application.status,
        createdAt: null,
        updatedAt: application.applicationPackets[0].updatedAt,
        links: [
          { label: "Application", href: `/applications/${application.id}`, kind: "page" as const },
          { label: "Job", href: `/jobs/${application.jobPosting.id}`, kind: "page" as const },
          { label: "Generated materials", href: "/resumes/generated", kind: "page" as const },
        ],
      },
    }));

  const matches = [...letterItems, ...packetItems]
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.item.updatedAt ?? 0) - Number(a.item.updatedAt ?? 0))
    .slice(0, 5)
    .map((entry) => entry.item);

  if (matches.length) {
    const primary = matches[0];
    const multiple = matches.length > 1;
    return {
      handled: true,
      reply: multiple
        ? `I found ${matches.length} matching material records. The strongest match is ${primary.label}. Use the links below, or ask with the exact role title if you want me to narrow it further.`
        : `I found it: ${primary.label}. Use the links below to open the text/PDF export, generated materials page, job, or application.`,
      actionJson: {
        action: actionForIntent(intent),
        query,
        resultCount: matches.length,
        resultLinks: primary.links,
        results: serializeItems(matches),
      },
    };
  }

  const related = await findRelatedJobOrApplication(query, userId);
  if (related.length) {
    return {
      handled: true,
      reply: `I did not find a generated cover letter for "${query}", but I found related app records. Open one of these and generate or sync the missing material.`,
      actionJson: {
        action: actionForIntent(intent),
        query,
        resultCount: 0,
        resultLinks: related.flatMap((item) => item.links).slice(0, 4),
        results: serializeItems(related),
      },
    };
  }

  return {
    handled: true,
    reply: `I could not find a generated cover letter or application packet for "${query}" in the app data.`,
    actionJson: { action: actionForIntent(intent), query, resultCount: 0, resultLinks: [{ label: "Generated materials", href: "/resumes/generated", kind: "page" }] },
  };
}

async function findApplications(query: string, userId?: string | null): Promise<JoleneRetrievalResult> {
  const applications = await prisma.application.findMany({
    where: userId ? { userId } : undefined,
    include: { jobPosting: { select: { id: true, title: true, company: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const matches = applications
    .map((application) => ({
      score: scoreMatch(query, application.jobPosting.company, application.jobPosting.title),
      item: applicationItem(application),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => entry.item);

  return retrievalReply("find_application", query, matches, "application");
}

async function findJobs(query: string): Promise<JoleneRetrievalResult> {
  const jobs = await prisma.jobPosting.findMany({
    select: { id: true, title: true, company: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  const matches = jobs
    .map((job) => ({
      score: scoreMatch(query, job.company, job.title),
      item: {
        kind: "job" as const,
        id: job.id,
        label: `${job.company} - ${job.title}`,
        company: job.company,
        title: job.title,
        updatedAt: job.updatedAt,
        links: [{ label: "Job", href: `/jobs/${job.id}`, kind: "page" as const }],
      },
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => entry.item);

  return retrievalReply("find_job", query, matches, "job");
}

async function findRelatedJobOrApplication(query: string, userId?: string | null) {
  const [applications, jobs] = await Promise.all([
    prisma.application.findMany({
      where: userId ? { userId } : undefined,
      include: { jobPosting: { select: { id: true, title: true, company: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.jobPosting.findMany({
      select: { id: true, title: true, company: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  return [
    ...applications.map((application) => ({ score: scoreMatch(query, application.jobPosting.company, application.jobPosting.title), item: applicationItem(application) })),
    ...jobs.map((job) => ({
      score: scoreMatch(query, job.company, job.title),
      item: {
        kind: "job" as const,
        id: job.id,
        label: `${job.company} - ${job.title}`,
        company: job.company,
        title: job.title,
        updatedAt: job.updatedAt,
        links: [{ label: "Job", href: `/jobs/${job.id}`, kind: "page" as const }],
      },
    })),
  ]
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.item);
}

function retrievalReply(action: RetrievalAction, query: string, matches: JoleneRetrievalItem[], label: string): JoleneRetrievalResult {
  if (!matches.length) {
    return {
      handled: true,
      reply: `I could not find a matching ${label} for "${query}" in the app data.`,
      actionJson: { action, query, resultCount: 0 },
    };
  }

  const primary = matches[0];
  return {
    handled: true,
    reply: matches.length > 1
      ? `I found ${matches.length} matching ${label} records. The strongest match is ${primary.label}.`
      : `I found this ${label}: ${primary.label}.`,
    actionJson: { action, query, resultCount: matches.length, resultLinks: primary.links, results: serializeItems(matches) },
  };
}

function applicationItem(application: {
  id: string;
  status: string;
  updatedAt: Date;
  jobPosting: { id: string; title: string; company: string };
}): JoleneRetrievalItem {
  return {
    kind: "application",
    id: application.id,
    label: `${application.jobPosting.company} - ${application.jobPosting.title}`,
    company: application.jobPosting.company,
    title: application.jobPosting.title,
    status: application.status,
    updatedAt: application.updatedAt,
    links: [
      { label: "Application", href: `/applications/${application.id}`, kind: "page" },
      { label: "Job", href: `/jobs/${application.jobPosting.id}`, kind: "page" },
    ],
  };
}

function serializeItems(items: JoleneRetrievalItem[]) {
  return items.map((item) => ({
    ...item,
    createdAt: item.createdAt ? item.createdAt.toISOString() : null,
    updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null,
  }));
}

function parseRetrievalIntent(message: string): RetrievalIntent | null {
  const normalized = normalize(message);
  if (/\b(run|start|kick off|launch|begin)\b/.test(normalized) && /\b(job )?(search|discovery)\b/.test(normalized)) return null;
  if (/\b(check|detect|scan|clean up|dedupe|deduplicate)\b/.test(normalized) && /\b(duplicate|duplicates|dedupe|deduplication)\b/.test(normalized)) return null;
  const lookup = /\b(where|find|show|open|locate|pull up|get|search)\b/.test(normalized);
  if (!lookup) return null;
  if (/\bcover letter|coverletter\b/.test(normalized)) return "cover_letter";
  if (/\bmaterials?|packet|generated materials?|resume and cover letter\b/.test(normalized)) return "materials";
  if (/\bapplications?|apply record|tracker\b/.test(normalized)) return "application";
  if (/\bjobs?|roles?|posting\b/.test(normalized)) return "job";
  return null;
}

function extractEntityQuery(message: string, intent: RetrievalIntent) {
  const normalizedSpacing = message.replace(/\s+/g, " ").trim();
  const afterRelation = normalizedSpacing.match(/\b(?:for|from|at|with|about)\s+(.+)$/i)?.[1] ?? normalizedSpacing;
  return afterRelation
    .replace(/\b(where|find|show|open|locate|pull up|get|search|my|the|a|an|is|are|do|did|we|have|for|from|at|with|about)\b/gi, " ")
    .replace(/\b(cover letter|coverletter|application materials|generated materials|materials|packet|application|applications|job|jobs|role|roles|posting|tracker)\b/gi, " ")
    .replace(/[?!.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function scoreMatch(query: string, company: string, title: string) {
  const haystack = normalize(`${company} ${title}`);
  const companyText = normalize(company);
  const titleText = normalize(title);
  const queryText = normalize(query);
  const tokens = queryText.split(" ").filter((token) => token.length > 1 && !STOPWORDS.has(token));
  if (!queryText || !tokens.length) return 0;

  let score = 0;
  if (companyText === queryText) score += 12;
  if (titleText === queryText) score += 10;
  if (companyText.includes(queryText)) score += 8;
  if (titleText.includes(queryText)) score += 6;
  if (haystack.includes(queryText)) score += 5;
  for (const token of tokens) {
    if (companyText.split(" ").includes(token)) score += 4;
    else if (titleText.split(" ").includes(token)) score += 3;
    else if (haystack.includes(token)) score += 1;
  }
  return score;
}

function actionForIntent(intent: RetrievalIntent): RetrievalAction {
  if (intent === "cover_letter") return "find_cover_letter";
  if (intent === "materials") return "find_application_materials";
  if (intent === "application") return "find_application";
  return "find_job";
}

function intentLabel(intent: RetrievalIntent) {
  if (intent === "cover_letter") return "cover letter";
  if (intent === "materials") return "application materials";
  if (intent === "application") return "application";
  return "job";
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s/+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(["the", "and", "or", "for", "from", "with", "about", "my", "our", "their", "this", "that", "letter", "cover"]);
