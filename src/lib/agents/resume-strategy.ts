import type { CandidateEvidence, JobPosting, JobSearchProfile } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import { retrieveCandidateEvidence } from "@/lib/evidence/retrieval";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";

export type ResumeStrategyInput = {
  jobPostingId: string;
  jobSearchProfileId: string;
  userId?: string;
};

export type ResumeStrategyOutput = {
  recommendedResumeProfile: string;
  positioningSummary: string;
  emphasisTags: string[];
  evidenceRefs: string[];
  priorityProjects: string[];
  omitSignals: string[];
  suggestedSections: string[];
  rationale: string;
  confidence: number;
};

export async function runResumeStrategyAgent(input: ResumeStrategyInput) {
  return runAgent<ResumeStrategyInput, ResumeStrategyOutput>({
    agentType: "RESUME_STRATEGY",
    input,
    userId: input.userId,
    execute: async () => {
      const [job, profile, candidateProfile, evaluation, resumeProfiles] = await Promise.all([
        prisma.jobPosting.findUnique({ where: { id: input.jobPostingId } }),
        prisma.jobSearchProfile.findUnique({ where: { id: input.jobSearchProfileId } }),
        prisma.userProfile.findFirst({ where: input.userId ? { userId: input.userId } : undefined, orderBy: { createdAt: "asc" } }),
        prisma.jobEvaluation.findUnique({
          where: {
            jobPostingId_jobSearchProfileId: {
              jobPostingId: input.jobPostingId,
              jobSearchProfileId: input.jobSearchProfileId,
            },
          },
        }),
        prisma.resumeProfile.findMany({
          where: {
            ...(input.userId ? { userId: input.userId } : {}),
            status: "ACTIVE",
          },
          orderBy: { name: "asc" },
        }),
      ]);

      if (!job) throw new Error("Job posting not found.");
      if (!profile) throw new Error("Search profile not found.");

      const evidence = candidateProfile
        ? await retrieveCandidateEvidence({
            jobId: job.id,
            searchProfileId: profile.id,
            query: strategyQuery(job, profile),
            candidateProfileId: candidateProfile.id,
            confidenceMinimum: "INFERRED",
            usableFor: "resume",
            limit: 12,
          })
        : [];

      return buildResumeStrategy({
        job,
        profile,
        evidence,
        evaluatedResumeProfile: evaluation?.recommendedResumeProfile ?? null,
        resumeProfiles: resumeProfiles.map((resumeProfile) => ({
          name: resumeProfile.name,
          positioningSummary: resumeProfile.positioningSummary,
          evidenceTags: jsonArray(resumeProfile.evidenceTags),
          priorityProjects: jsonArray(resumeProfile.priorityProjects),
          defaultSections: jsonArray(resumeProfile.defaultSections),
        })),
      });
    },
  });
}

export function buildResumeStrategy({
  job,
  profile,
  evidence,
  evaluatedResumeProfile,
  resumeProfiles,
}: {
  job: Pick<JobPosting, "title" | "company" | "description">;
  profile: Pick<JobSearchProfile, "name" | "titles" | "keywordsRequired" | "keywordsPreferred" | "industries">;
  evidence: Pick<CandidateEvidence, "id" | "title" | "content" | "tags" | "type">[];
  evaluatedResumeProfile?: string | null;
  resumeProfiles?: Array<{ name: string; positioningSummary: string; evidenceTags: string[]; priorityProjects: string[]; defaultSections: string[] }>;
}): ResumeStrategyOutput {
  const text = `${job.title} ${job.company} ${job.description} ${profile.name}`.toLowerCase();
  const evidenceRefs = evidence.map((item) => item.id);
  const evidenceTags = Array.from(new Set(evidence.flatMap((item) => jsonArray(item.tags)))).slice(0, 12);
  const emphasisTags = chooseEmphasisTags(text, evidenceTags, profile);
  const recommendedResumeProfile = chooseControlledResumeProfile(text, emphasisTags, evaluatedResumeProfile, resumeProfiles ?? []);
  const selectedProfile = resumeProfiles?.find((resumeProfile) => resumeProfile.name === recommendedResumeProfile);
  const priorityProjects = evidence
    .filter((item) => item.type === "PROJECT" || /project|repo|github/i.test(item.title))
    .map((item) => item.title)
    .slice(0, 4);
  const omitSignals = omittedSignals(text);
  const suggestedSections = [
    "Summary",
    "Skills",
    "Professional Experience",
    ...(priorityProjects.length ? ["Projects"] : []),
    "Education",
    "Certifications",
  ];

  return {
    recommendedResumeProfile,
    positioningSummary: selectedProfile?.positioningSummary ?? buildPositioningSummary(job, recommendedResumeProfile, emphasisTags),
    emphasisTags,
    evidenceRefs,
    priorityProjects: selectedProfile?.priorityProjects?.length ? selectedProfile.priorityProjects : priorityProjects,
    omitSignals,
    suggestedSections: selectedProfile?.defaultSections?.length ? selectedProfile.defaultSections : suggestedSections,
    rationale: `Use ${recommendedResumeProfile} positioning because the role and profile emphasize ${emphasisTags.slice(0, 5).join(", ") || "general senior product engineering"}.`,
    confidence: evidence.length >= 8 ? 0.86 : evidence.length >= 4 ? 0.74 : 0.56,
  };
}

export function chooseControlledResumeProfile(
  text: string,
  tags: string[],
  evaluatedResumeProfile: string | null | undefined,
  resumeProfiles: Array<{ name: string; evidenceTags: string[] }>,
) {
  if (evaluatedResumeProfile && resumeProfiles.some((profile) => profile.name === evaluatedResumeProfile)) return evaluatedResumeProfile;
  const fallback = evaluatedResumeProfile ?? chooseResumeProfile(text, tags);
  if (!resumeProfiles.length) return fallback;

  const haystack = `${text} ${tags.join(" ")}`.toLowerCase();
  const ranked = resumeProfiles
    .map((profile) => ({
      profile,
      score: profile.evidenceTags.reduce((score, tag) => score + (haystack.includes(tag.toLowerCase()) ? 2 : 0), profile.name.toLowerCase() === fallback.toLowerCase() ? 8 : 0),
    }))
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.score ? ranked[0].profile.name : fallback;
}

function strategyQuery(job: JobPosting, profile: JobSearchProfile) {
  return [
    job.title,
    job.company,
    job.description.slice(0, 1400),
    ...jsonArray(profile.titles),
    ...jsonArray(profile.keywordsRequired),
    ...jsonArray(profile.keywordsPreferred),
    ...jsonArray(profile.industries),
  ].join(" ");
}

function chooseEmphasisTags(text: string, evidenceTags: string[], profile: Pick<JobSearchProfile, "keywordsRequired" | "keywordsPreferred" | "industries">) {
  const profileTags = [...jsonArray(profile.keywordsRequired), ...jsonArray(profile.keywordsPreferred), ...jsonArray(profile.industries)];
  const defaults = ["react", "typescript", "frontend", "full-stack", "saas", "dashboard"];
  const allTags = Array.from(new Set([...evidenceTags, ...profileTags, ...defaults].map((tag) => tag.toLowerCase())));
  return allTags
    .sort((left, right) => tagScore(right, text) - tagScore(left, text))
    .filter((tag) => tagScore(tag, text) > 0 || defaults.includes(tag))
    .slice(0, 10);
}

function chooseResumeProfile(text: string, tags: string[]) {
  const haystack = `${text} ${tags.join(" ")}`;
  if (/\bsecurity|identity|auth|authentication|webauthn|passkey|compliance\b/.test(haystack)) return "Security SaaS / Identity";
  if (/\bai|llm|agent|openai|automation|copilot\b/.test(haystack)) return "AI Product Engineer";
  if (/\bdefense|mission|geospatial|simulation|operator|autonomy\b/.test(haystack)) return "Defense / Mission Software UI";
  if (/\bdesign system|storybook|component library|frontend platform\b/.test(haystack)) return "Design Systems / Platform UI";
  if (/\bfull stack|backend|node|api|postgres|saas\b/.test(haystack)) return "Full-Stack SaaS";
  return "Senior Frontend / Product Engineering";
}

function buildPositioningSummary(job: Pick<JobPosting, "title" | "company">, resumeProfile: string, tags: string[]) {
  const signalText = tags.slice(0, 5).join(", ");
  return `${resumeProfile} positioning for ${job.company}'s ${job.title} role, emphasizing ${signalText || "verified senior frontend and product engineering evidence"}.`;
}

function omittedSignals(text: string) {
  const omit: string[] = [];
  if (!/\bmobile|react native|ios|android\b/.test(text)) omit.push("mobile-only depth");
  if (!/\bmanager|management|director\b/.test(text)) omit.push("people-management positioning");
  if (!/\bml research|research scientist|model training\b/.test(text)) omit.push("ML research claims");
  return omit;
}

function tagScore(tag: string, text: string) {
  const normalized = tag.toLowerCase();
  if (!normalized) return 0;
  if (text.includes(normalized)) return 3;
  return normalized.split(/[\s/-]+/).filter((part) => part.length > 2 && text.includes(part)).length;
}
