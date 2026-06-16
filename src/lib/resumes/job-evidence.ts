import { parseResumeExperienceContext, type ResumeExperienceContext, type ResumeTechItem, type ResumeVersionSuggestion } from "@/lib/resumes/resume-context";

export type JobEvidenceBullet = {
  id: string;
  workExperienceId: string | null;
  company: string;
  role: string;
  category: string;
  text: string;
  keywords: string[];
  sourceText: string | null;
  truthLevel: string;
  sourceResumeUploadId?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

export type JobEvidenceWorkExperience = {
  id: string;
  company: string;
  title: string;
  location?: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  summary?: string | null;
  skills: string[];
  achievements?: string[];
  sourceResumeUploadId?: string | null;
  resumeContext: ResumeExperienceContext | unknown;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

export type BulletMatchReview = {
  bulletId: string;
  suggestedWorkExperienceId: string;
  confidence: "exact_company_role";
};

export type JobEvidenceReadiness = {
  status: "ready" | "needs_review";
  missingBullets: boolean;
  missingTech: boolean;
  missingContext: boolean;
  pendingBulletReview: number;
  pendingVersionReview: number;
  duplicateSources: number;
};

export type JobEvidenceGroup = {
  id: string;
  company: string;
  title: string;
  displayDates: string;
  canonicalWorkExperience: JobEvidenceWorkExperience;
  workExperiences: JobEvidenceWorkExperience[];
  bullets: JobEvidenceBullet[];
  autoMatchedBullets: JobEvidenceBullet[];
  readiness: JobEvidenceReadiness;
  mergedContext: ResumeExperienceContext;
  confirmedTech: ResumeTechItem[];
  versionSuggestions: ResumeVersionSuggestion[];
  sourceLabels: string[];
};

export function buildJobEvidenceGroups(workExperiences: JobEvidenceWorkExperience[], bullets: JobEvidenceBullet[]) {
  const sortedWork = sortWorkExperiences(workExperiences);
  const groupsByKey = new Map<string, JobEvidenceGroup>();
  const workToGroup = new Map<string, JobEvidenceGroup>();

  for (const work of sortedWork) {
    const key = roleKey(work.company, work.title);
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.workExperiences.push(work);
      existing.sourceLabels = sourceLabels(existing.workExperiences);
      workToGroup.set(work.id, existing);
      continue;
    }

    const context = parseResumeExperienceContext(work.resumeContext);
    const group: JobEvidenceGroup = {
      id: key,
      company: work.company,
      title: work.title,
      displayDates: displayGroupDates([work]),
      canonicalWorkExperience: work,
      workExperiences: [work],
      bullets: [],
      autoMatchedBullets: [],
      readiness: emptyReadiness(),
      mergedContext: context,
      confirmedTech: context.confirmedTech,
      versionSuggestions: context.versionSuggestions,
      sourceLabels: sourceLabels([work]),
    };
    groupsByKey.set(key, group);
    workToGroup.set(work.id, group);
  }

  const unmatchedBullets: JobEvidenceBullet[] = [];

  for (const bullet of bullets) {
    const linkedGroup = bullet.workExperienceId ? workToGroup.get(bullet.workExperienceId) : undefined;
    const matchedGroup = linkedGroup ?? groupsByKey.get(roleKey(bullet.company, bullet.role));
    if (!matchedGroup) {
      unmatchedBullets.push(bullet);
      continue;
    }
    matchedGroup.bullets.push(bullet);
    if (!linkedGroup) matchedGroup.autoMatchedBullets.push(bullet);
  }

  const groups = Array.from(groupsByKey.values()).map((group) => {
    const mergedContext = mergeContexts(group.workExperiences.map((work) => parseResumeExperienceContext(work.resumeContext)));
    const displayDates = displayGroupDates(group.workExperiences);
    const readiness = calculateReadiness(group, mergedContext);
    return {
      ...group,
      displayDates,
      mergedContext,
      confirmedTech: mergedContext.confirmedTech,
      versionSuggestions: mergedContext.versionSuggestions,
      readiness,
    };
  });

  return {
    groups,
    unmatchedBullets,
    bulletMatchReviews: groups.flatMap((group) => group.autoMatchedBullets.map((bullet): BulletMatchReview => ({
      bulletId: bullet.id,
      suggestedWorkExperienceId: group.canonicalWorkExperience.id,
      confidence: "exact_company_role",
    }))),
  };
}

export function roleKey(company: string, role: string) {
  return `${normalizeKey(company)}::${normalizeKey(role)}`;
}

export function displayDateRange(work: Pick<JobEvidenceWorkExperience, "startDate" | "endDate" | "isCurrent">) {
  return [work.startDate, work.endDate || (work.isCurrent ? "Present" : null)].filter(Boolean).join(" - ") || "Dates not set";
}

function calculateReadiness(group: JobEvidenceGroup, context: ResumeExperienceContext): JobEvidenceReadiness {
  const pendingBulletReview = group.bullets.filter((bullet) => bullet.truthLevel === "needs_review").length;
  const pendingVersionReview = context.versionSuggestions.filter((suggestion) => suggestion.status === "NEEDS_REVIEW").length;
  const missingBullets = group.bullets.filter((bullet) => bullet.truthLevel === "verified").length === 0;
  const missingTech = context.confirmedTech.length === 0 && !context.versionSuggestions.some((suggestion) => suggestion.status === "APPROVED");
  const missingContext = !context.applicationTitle && !context.applicationSummary && !context.users && !context.scaleImpact;
  const duplicateSources = Math.max(0, group.workExperiences.length - 1);

  return {
    status: missingBullets || missingTech || missingContext || pendingBulletReview || pendingVersionReview || duplicateSources ? "needs_review" : "ready",
    missingBullets,
    missingTech,
    missingContext,
    pendingBulletReview,
    pendingVersionReview,
    duplicateSources,
  };
}

function emptyReadiness(): JobEvidenceReadiness {
  return {
    status: "needs_review",
    missingBullets: true,
    missingTech: true,
    missingContext: true,
    pendingBulletReview: 0,
    pendingVersionReview: 0,
    duplicateSources: 0,
  };
}

function mergeContexts(contexts: ResumeExperienceContext[]) {
  const confirmedTech = dedupeBy(contexts.flatMap((context) => context.confirmedTech), (tech) => `${tech.name.toLowerCase()}|${tech.version?.toLowerCase() ?? ""}`);
  const versionSuggestions = dedupeBy(contexts.flatMap((context) => context.versionSuggestions), (suggestion) => `${suggestion.name.toLowerCase()}|${suggestion.suggestedVersion.toLowerCase()}`);
  const firstValue = (selector: (context: ResumeExperienceContext) => string | undefined) => contexts.map(selector).find(Boolean);

  return {
    applicationTitle: firstValue((context) => context.applicationTitle),
    applicationSummary: firstValue((context) => context.applicationSummary),
    users: firstValue((context) => context.users),
    scaleImpact: firstValue((context) => context.scaleImpact),
    confirmedTech,
    versionSuggestions,
    updatedAt: firstValue((context) => context.updatedAt),
  };
}

function displayGroupDates(workExperiences: JobEvidenceWorkExperience[]) {
  const ranges = Array.from(new Set(workExperiences.map(displayDateRange)));
  return ranges.length > 1 ? `${ranges[0]} + ${ranges.length - 1} source${ranges.length === 2 ? "" : "s"}` : ranges[0] ?? "Dates not set";
}

function sourceLabels(workExperiences: JobEvidenceWorkExperience[]) {
  return workExperiences.map((work) => work.sourceResumeUploadId ? `Resume upload ${work.sourceResumeUploadId}` : "Profile update");
}

function sortWorkExperiences(workExperiences: JobEvidenceWorkExperience[]) {
  return [...workExperiences].sort((left, right) => {
    const dateDiff = workSortValue(right) - workSortValue(left);
    if (dateDiff !== 0) return dateDiff;
    return timestamp(right.updatedAt) - timestamp(left.updatedAt);
  });
}

function workSortValue(work: JobEvidenceWorkExperience) {
  return Math.max(parseResumeDate(work.endDate, work.isCurrent), parseResumeDate(work.startDate, false));
}

function parseResumeDate(value: string | null | undefined, isCurrent: boolean) {
  if (isCurrent || /present|current|now/i.test(value ?? "")) return 999999;
  if (!value) return 0;
  const match = value.match(/(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+)?(\d{4})/i);
  if (!match) return 0;
  const months: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  return Number(match[2]) * 100 + (match[1] ? months[match[1].toLowerCase().slice(0, 3)] ?? 1 : 1);
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function timestamp(value: string | Date | null | undefined) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function dedupeBy<T>(items: T[], keyFor: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFor(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
