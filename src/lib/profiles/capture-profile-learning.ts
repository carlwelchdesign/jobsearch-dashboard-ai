import { Prisma, type JobPosting, type JobSearchProfile } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CaptureProfileLearningResult = {
  created: boolean;
  profile: Pick<JobSearchProfile, "id" | "name"> | null;
  reason: string;
};

type CaptureProfileJob = Pick<JobPosting, "id" | "company" | "title" | "description" | "location">;

const CAPTURE_PROFILE_NAME = "AI-Native Enterprise Product Frontend";

const baseTitles = [
  "Frontend Engineer",
  "Senior Frontend Engineer",
  "AI Product Engineer",
  "Product Engineer",
  "Frontend Platform Engineer",
];

const baseIndustries = [
  "AI",
  "enterprise SaaS",
  "data platforms",
  "workflow software",
  "financial operations",
  "developer tools",
];

const basePreferredKeywords = [
  "React",
  "TypeScript",
  "AI-native UX",
  "AI agents",
  "enterprise workflows",
  "analytics",
  "data-dense UI",
  "design system",
  "component library",
  "frontend architecture",
  "human-in-the-loop",
  "workflow automation",
  "API contracts",
  "performance",
  "accessibility",
];

const excludedKeywords = [
  "pay to apply",
  "application fee",
  "commission only",
  "unpaid",
  "equity only",
];

const signalTerms = [
  "AI-native",
  "intelligence products",
  "analytics",
  "workflows",
  "AI agents",
  "marketplace",
  "enterprise data",
  "design system",
  "component library",
  "frontend architecture",
  "data platform",
  "automation",
  "human judgment",
  "real-time",
  "data-dense",
];

export async function createProfileFromZeroMatchCapture(job: CaptureProfileJob): Promise<CaptureProfileLearningResult> {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return { created: false, profile: null, reason: "No user exists." };

  const existing = await prisma.jobSearchProfile.findFirst({
    where: {
      userId: user.id,
      name: CAPTURE_PROFILE_NAME,
    },
    select: { id: true, name: true },
  });
  if (existing) return { created: false, profile: existing, reason: "Equivalent captured-intent profile already exists." };

  const extractedSignals = extractJobSignals(job);
  const preferredKeywords = unique([...basePreferredKeywords, ...extractedSignals]);
  const profile = await prisma.jobSearchProfile.create({
    data: {
      userId: user.id,
      name: CAPTURE_PROFILE_NAME,
      enabled: true,
      searchIntent: "industry_specific",
      titles: baseTitles as Prisma.InputJsonValue,
      excludedTitles: [] as Prisma.InputJsonValue,
      jobTypes: ["frontend", "ai_product", "product_engineering", "platform"] as Prisma.InputJsonValue,
      countries: ["United States"] as Prisma.InputJsonValue,
      regions: [] as Prisma.InputJsonValue,
      cities: [] as Prisma.InputJsonValue,
      remotePreference: "any",
      relocationPreference: "unknown",
      salaryCurrency: "USD",
      salaryMin: 160000,
      salaryMax: null,
      includeUnknownSalary: true,
      industries: baseIndustries as Prisma.InputJsonValue,
      preferredCompanies: [job.company].filter((company) => company && company !== "Unknown company") as Prisma.InputJsonValue,
      excludedCompanies: ["RemoteOK"] as Prisma.InputJsonValue,
      keywordsRequired: [] as Prisma.InputJsonValue,
      keywordsPreferred: preferredKeywords as Prisma.InputJsonValue,
      keywordsExcluded: excludedKeywords as Prisma.InputJsonValue,
      minimumMatchScore: 72,
      maxResultsPerRun: 50,
      scheduleEnabled: true,
      emailDigestEnabled: true,
      pushNotificationsEnabled: false,
      minimumPushScore: 85,
    },
    select: { id: true, name: true },
  });

  return {
    created: true,
    profile,
    reason: `Created from zero-match Chrome capture for ${job.company} - ${job.title}.`,
  };
}

export function extractJobSignals(job: CaptureProfileJob): string[] {
  const haystack = `${job.title} ${job.company} ${job.location ?? ""} ${job.description ?? ""}`.toLowerCase();
  return signalTerms.filter((term) => haystack.includes(term.toLowerCase()));
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
