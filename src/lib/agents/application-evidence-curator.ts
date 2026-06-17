import type { CandidateEvidence, ExperienceBullet, GithubRepository, JobPosting, Project, WorkExperience } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import type { ApplicationEvidencePlan, ApplicationEvidenceProofPoint } from "@/lib/applications/material-quality";
import { retrieveCandidateEvidence } from "@/lib/evidence/retrieval";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";

export type ApplicationEvidenceCuratorInput = {
  jobPostingId: string;
  jobSearchProfileId?: string | null;
  userId?: string;
  candidateProfileId?: string | null;
  bullets?: ExperienceBullet[];
  projects?: Project[];
  workExperiences?: WorkExperience[];
  githubRepositories?: GithubRepository[];
  tailoredResumeMarkdown?: string | null;
};

export async function runApplicationEvidenceCuratorAgent(input: ApplicationEvidenceCuratorInput) {
  return runAgent<unknown, ApplicationEvidencePlan>({
    agentType: "APPLICATION_EVIDENCE_CURATOR",
    input: {
      jobPostingId: input.jobPostingId,
      jobSearchProfileId: input.jobSearchProfileId,
      userId: input.userId,
      candidateProfileId: input.candidateProfileId,
      bullets: input.bullets?.map((bullet) => ({ id: bullet.id, company: bullet.company, role: bullet.role })),
      projects: input.projects?.map((project) => ({ id: project.id, name: project.name })),
      workExperiences: input.workExperiences?.map((work) => ({ id: work.id, company: work.company, title: work.title })),
      githubRepositories: input.githubRepositories?.map((repo) => ({ id: repo.id, name: repo.name })),
      tailoredResumeProvided: Boolean(input.tailoredResumeMarkdown),
    },
    userId: input.userId,
    execute: async () => {
      const job = await prisma.jobPosting.findUnique({ where: { id: input.jobPostingId } });
      if (!job) throw new Error("Job posting not found.");
      const candidateProfileId = input.candidateProfileId ?? (await prisma.userProfile.findFirst({
        where: input.userId ? { userId: input.userId } : undefined,
        select: { id: true },
        orderBy: { createdAt: "asc" },
      }))?.id ?? null;
      const evidence = candidateProfileId
        ? await retrieveCandidateEvidence({
            candidateProfileId,
            jobId: job.id,
            searchProfileId: input.jobSearchProfileId ?? undefined,
            query: evidenceQuery(job),
            confidenceMinimum: "INFERRED",
            usableFor: "coverLetter",
            limit: 12,
          })
        : [];

      return buildApplicationEvidencePlan({
        job,
        candidateEvidence: evidence,
        bullets: input.bullets ?? [],
        projects: input.projects ?? [],
        workExperiences: input.workExperiences ?? [],
        githubRepositories: input.githubRepositories ?? [],
        tailoredResumeMarkdown: input.tailoredResumeMarkdown,
      });
    },
  });
}

export function buildApplicationEvidencePlan({
  job,
  candidateEvidence,
  bullets,
  projects,
  workExperiences,
  githubRepositories,
  tailoredResumeMarkdown,
}: {
  job: Pick<JobPosting, "title" | "company" | "description" | "requirements" | "niceToHaves">;
  candidateEvidence?: CandidateEvidence[];
  bullets?: ExperienceBullet[];
  projects?: Project[];
  workExperiences?: WorkExperience[];
  githubRepositories?: GithubRepository[];
  tailoredResumeMarkdown?: string | null;
}): ApplicationEvidencePlan {
  const jobText = evidenceQuery(job);
  const jobSignals = jobSignalTerms(jobText);
  const domainAllowsDefense = /\b(defense|mission|military|aerospace|autonomy|field operations|operator|ar|vr|augmented|virtual)\b/i.test(jobText);
  const scoredProofPoints = [
    ...(candidateEvidence ?? []).map((item): ApplicationEvidenceProofPoint => ({
      sourceType: "candidate_evidence",
      sourceId: item.id,
      title: item.title,
      summary: firstSentence(item.content),
      relevance: scoreEvidence(`${item.title} ${item.content} ${jsonArray(item.tags).join(" ")}`, jobSignals, domainAllowsDefense),
      keywords: matchedSignals(`${item.title} ${item.content} ${jsonArray(item.tags).join(" ")}`, jobSignals),
    })),
    ...(bullets ?? []).map((bullet): ApplicationEvidenceProofPoint => ({
      sourceType: "experience_bullet",
      sourceId: bullet.id,
      title: `${bullet.company} - ${bullet.role}`,
      summary: bullet.text,
      relevance: scoreEvidence(`${bullet.company} ${bullet.role} ${bullet.text} ${jsonArray(bullet.keywords).join(" ")}`, jobSignals, domainAllowsDefense),
      keywords: matchedSignals(`${bullet.company} ${bullet.role} ${bullet.text} ${jsonArray(bullet.keywords).join(" ")}`, jobSignals),
    })),
    ...(projects ?? []).map((project): ApplicationEvidenceProofPoint => ({
      sourceType: "project",
      sourceId: project.id,
      title: project.name,
      summary: project.description ?? jsonArray(project.highlights).join(" "),
      relevance: scoreEvidence(`${project.name} ${project.description ?? ""} ${jsonArray(project.technologies).join(" ")} ${jsonArray(project.highlights).join(" ")}`, jobSignals, domainAllowsDefense),
      keywords: matchedSignals(`${project.name} ${project.description ?? ""} ${jsonArray(project.technologies).join(" ")} ${jsonArray(project.highlights).join(" ")}`, jobSignals),
    })),
    ...(githubRepositories ?? []).map((repo): ApplicationEvidenceProofPoint => ({
      sourceType: "github_repository",
      sourceId: repo.id,
      title: repo.name,
      summary: repo.description ?? `${repo.language ?? "Repository"} project.`,
      relevance: scoreEvidence(`${repo.name} ${repo.description ?? ""} ${repo.language ?? ""} ${jsonArray(repo.topics).join(" ")}`, jobSignals, domainAllowsDefense),
      keywords: matchedSignals(`${repo.name} ${repo.description ?? ""} ${repo.language ?? ""} ${jsonArray(repo.topics).join(" ")}`, jobSignals),
    })),
    ...(tailoredResumeMarkdown ? [{
      sourceType: "tailored_resume" as const,
      sourceId: "tailored_resume",
      title: "Tailored resume",
      summary: firstSentence(tailoredResumeMarkdown.replace(/^#+\s*/gm, "")),
      relevance: scoreEvidence(tailoredResumeMarkdown, jobSignals, domainAllowsDefense),
      keywords: matchedSignals(tailoredResumeMarkdown, jobSignals),
    }] : []),
  ];
  const avoidedSignals = scoredProofPoints
    .filter((point) => !domainAllowsDefense && /\b(ar|vr|augmented reality|virtual reality|defense|military|combat|stryker)\b/i.test(`${point.title} ${point.summary}`))
    .map((point) => point.title);
  const proofPoints = scoredProofPoints
    .filter((point) => point.relevance > 0)
    .sort((left, right) => right.relevance - left.relevance)
    .slice(0, 8);
  const finalProofPoints = proofPoints.filter((point) => !avoidedSignals.includes(point.title)).slice(0, 5);
  const warnings = [
    ...(finalProofPoints.length < 3 ? ["Fewer than three strong job-specific proof points were found."] : []),
    ...(avoidedSignals.length ? [`Avoided unrelated AR/defense proof points for this role: ${avoidedSignals.slice(0, 3).join(", ")}.`] : []),
  ];

  return {
    status: finalProofPoints.length >= 2 ? "READY" : "INSUFFICIENT",
    jobSignals,
    proofPoints: finalProofPoints,
    evidenceRefs: finalProofPoints.map((point) => point.sourceId),
    avoidedSignals,
    warnings,
    rationale: finalProofPoints.length
      ? `Use ${finalProofPoints.length} proof point${finalProofPoints.length === 1 ? "" : "s"} that match ${jobSignals.slice(0, 6).join(", ")} for ${job.company}.`
      : `No strong cover-letter evidence was found for ${job.company}'s ${job.title} role.`,
    confidence: finalProofPoints.length >= 4 ? 0.86 : finalProofPoints.length >= 2 ? 0.72 : 0.42,
  };
}

function evidenceQuery(job: Pick<JobPosting, "title" | "company" | "description" | "requirements" | "niceToHaves">) {
  return [job.title, job.company, job.description, job.requirements, job.niceToHaves].filter(Boolean).join(" ");
}

function jobSignalTerms(text: string) {
  const normalized = text.toLowerCase();
  const candidates = [
    "react", "typescript", "javascript", "node", "graphql", "postgresql", "postgres", "full-stack", "full stack",
    "product", "ux", "performance", "editor", "collaboration", "async", "startup", "ai", "agent", "temporal",
    "websocket", "offline", "mobx", "stylex", "redis", "kubernetes", "design", "components", "customer-facing",
  ];
  return Array.from(new Set(candidates.filter((term) => normalized.includes(term)))).slice(0, 14);
}

function scoreEvidence(text: string, jobSignals: string[], domainAllowsDefense: boolean) {
  const normalized = text.toLowerCase();
  const signalScore = jobSignals.reduce((score, signal) => score + (normalized.includes(signal) ? 8 : 0), 0);
  const productBoost = /\b(product|ux|customer|interface|workflow|component|performance|full[ -]?stack|api|frontend)\b/i.test(text) ? 10 : 0;
  const unrelatedPenalty = !domainAllowsDefense && /\b(augmented reality|virtual reality|\bar\b|\bvr\b|defense|military|combat|stryker)\b/i.test(text) ? 30 : 0;
  return Math.max(0, signalScore + productBoost - unrelatedPenalty);
}

function matchedSignals(text: string, jobSignals: string[]) {
  const normalized = text.toLowerCase();
  return jobSignals.filter((signal) => normalized.includes(signal)).slice(0, 8);
}

function firstSentence(text: string) {
  return text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)[0]?.slice(0, 360) ?? "";
}
