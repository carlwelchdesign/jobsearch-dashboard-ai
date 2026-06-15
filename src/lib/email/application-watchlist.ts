import { JobMatchStatus, type Application, type JobPosting, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type EmailApplicationWatch = {
  applicationId: string;
  company: string;
  title: string;
  applicationUrl: string | null;
  appliedAt: Date | null;
  updatedAt: Date;
  gmailQueries: string[];
};

type WatchApplication = Pick<Application, "id" | "status" | "appliedAt" | "updatedAt"> & {
  jobPosting: Pick<JobPosting, "company" | "title" | "applicationUrl">;
};

export async function buildEmailWatchlistFromApplications(user: Pick<User, "id">, options: { limit?: number } = {}) {
  const applications = await prisma.application.findMany({
    where: {
      userId: user.id,
      status: { in: watchableStatuses },
    },
    include: {
      jobPosting: {
        select: {
          company: true,
          title: true,
          applicationUrl: true,
        },
      },
    },
    orderBy: [
      { appliedAt: "desc" },
      { updatedAt: "desc" },
    ],
    take: options.limit ?? 50,
  });

  return applications.map((application) => buildWatch(application));
}

function buildWatch(application: WatchApplication): EmailApplicationWatch {
  const company = application.jobPosting.company.trim();
  const title = application.jobPosting.title.trim();
  const domain = domainFromUrl(application.jobPosting.applicationUrl);
  const titleTokens = meaningfulTokens(title).slice(0, 4).join(" ");
  const companyQuery = quote(company);
  const responseTerms = "(interview OR recruiter OR availability OR assessment OR unfortunately OR \"next steps\" OR \"moving forward\")";
  const exclusions = "-(\"job alert\" OR newsletter OR promotion OR sale OR discount OR \"jobs for you\" OR \"apply now\")";

  const gmailQueries = uniqueStrings([
    `${companyQuery} newer_than:${daysSince(application.appliedAt ?? application.updatedAt)}d ${exclusions}`,
    titleTokens ? `${companyQuery} ${quote(titleTokens)} newer_than:${daysSince(application.appliedAt ?? application.updatedAt)}d ${exclusions}` : "",
    domain ? `from:${domain} newer_than:${daysSince(application.appliedAt ?? application.updatedAt)}d ${exclusions}` : "",
    `${companyQuery} ${responseTerms} newer_than:${daysSince(application.appliedAt ?? application.updatedAt)}d ${exclusions}`,
  ].filter(Boolean));

  return {
    applicationId: application.id,
    company,
    title,
    applicationUrl: application.jobPosting.applicationUrl,
    appliedAt: application.appliedAt,
    updatedAt: application.updatedAt,
    gmailQueries,
  };
}

function domainFromUrl(value: string | null) {
  if (!value) return null;
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

function meaningfulTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !titleStopWords.has(token));
}

function daysSince(date: Date) {
  const days = Math.ceil((Date.now() - date.getTime()) / 86_400_000);
  return Math.min(120, Math.max(7, days || 7));
}

function quote(value: string) {
  return `"${value.replace(/"/g, "")}"`;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

const watchableStatuses: JobMatchStatus[] = [
  JobMatchStatus.applied,
  JobMatchStatus.follow_up_due,
  JobMatchStatus.screening,
  JobMatchStatus.interviewing,
  JobMatchStatus.offer,
];

const titleStopWords = new Set([
  "senior",
  "staff",
  "principal",
  "junior",
  "software",
  "engineer",
  "developer",
  "manager",
  "remote",
]);
