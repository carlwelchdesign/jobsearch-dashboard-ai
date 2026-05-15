import type { GithubRepository, JobPosting, Project } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";

export type PortfolioMatchInput = {
  applicationId: string;
  userId?: string;
};

export type PortfolioMatchOutput = {
  applicationId: string;
  company: string;
  role: string;
  projectLinks: Array<{
    name: string;
    url: string | null;
    source: "profile_project" | "github_repo";
    fitScore: number;
    talkingPoint: string;
    tags: string[];
  }>;
  warnings: string[];
  confidence: number;
  reasoningSummary: string;
};

type PortfolioItem = {
  name: string;
  description: string;
  url: string | null;
  source: "profile_project" | "github_repo";
  tags: string[];
};

export async function runPortfolioMatchAgent(input: PortfolioMatchInput) {
  return runAgent<PortfolioMatchInput, PortfolioMatchOutput>({
    agentType: "PORTFOLIO_MATCH",
    input,
    userId: input.userId,
    execute: async () => {
      const application = await prisma.application.findUnique({
        where: { id: input.applicationId },
        include: {
          jobPosting: true,
          user: {
            include: {
              profile: {
                include: {
                  githubRepositories: {
                    orderBy: [{ pushedAt: "desc" }, { stars: "desc" }],
                    take: 50,
                  },
                  projects: {
                    orderBy: { updatedAt: "desc" },
                    take: 40,
                  },
                },
              },
            },
          },
        },
      });
      if (!application) throw new Error("Application not found.");

      return buildPortfolioMatch({
        applicationId: application.id,
        job: application.jobPosting,
        projects: application.user.profile?.projects ?? [],
        repositories: application.user.profile?.githubRepositories ?? [],
      });
    },
  });
}

export function buildPortfolioMatch({
  applicationId,
  job,
  projects,
  repositories,
}: {
  applicationId: string;
  job: Pick<JobPosting, "company" | "title" | "description">;
  projects: Array<Pick<Project, "name" | "description" | "url" | "repoUrl" | "technologies" | "highlights">>;
  repositories: Array<Pick<GithubRepository, "name" | "description" | "htmlUrl" | "language" | "topics" | "isFork" | "isArchived">>;
}): PortfolioMatchOutput {
  const items = [
    ...projects.map(projectToPortfolioItem),
    ...repositories.filter((repo) => !repo.isFork && !repo.isArchived).map(repoToPortfolioItem),
  ];
  const ranked = dedupePortfolioItems(items)
    .map((item) => ({ item, fitScore: scorePortfolioItem(item, job) }))
    .filter((item) => item.fitScore > 0)
    .sort((left, right) => right.fitScore - left.fitScore)
    .slice(0, 5);
  const projectLinks = ranked.map(({ item, fitScore }) => ({
    name: item.name,
    url: item.url,
    source: item.source,
    fitScore,
    talkingPoint: talkingPointForItem(item, job),
    tags: item.tags.slice(0, 6),
  }));

  return {
    applicationId,
    company: job.company,
    role: job.title,
    projectLinks,
    warnings: projectLinks.length ? [] : ["No portfolio projects or GitHub repositories matched this job strongly enough."],
    confidence: projectLinks.length >= 3 ? 0.82 : projectLinks.length ? 0.66 : 0.44,
    reasoningSummary: "Matched saved projects and non-archived GitHub repositories against the job title and description. Links are review-only and no claims are invented.",
  };
}

function projectToPortfolioItem(project: Pick<Project, "name" | "description" | "url" | "repoUrl" | "technologies" | "highlights">): PortfolioItem {
  const tags = [...jsonArray(project.technologies), ...jsonArray(project.highlights)].flatMap(tokenize);
  return {
    name: project.name,
    description: [project.description, ...jsonArray(project.highlights)].filter(Boolean).join(" "),
    url: project.url ?? project.repoUrl,
    source: "profile_project",
    tags: Array.from(new Set(tags)),
  };
}

function repoToPortfolioItem(repo: Pick<GithubRepository, "name" | "description" | "htmlUrl" | "language" | "topics">): PortfolioItem {
  const tags = [repo.language ?? "", ...jsonArray(repo.topics)].flatMap(tokenize);
  return {
    name: repo.name,
    description: [repo.description, repo.language, jsonArray(repo.topics).join(" ")].filter(Boolean).join(" "),
    url: repo.htmlUrl,
    source: "github_repo",
    tags: Array.from(new Set(tags)),
  };
}

function scorePortfolioItem(item: PortfolioItem, job: Pick<JobPosting, "title" | "description">) {
  const jobTerms = tokenize(`${job.title} ${job.description}`);
  const itemTerms = new Set(tokenize(`${item.name} ${item.description} ${item.tags.join(" ")}`));
  const shared = jobTerms.filter((term) => itemTerms.has(term));
  let score = shared.length * 8;
  if (/\breact|typescript|nextjs|frontend|dashboard|auth|identity|webauthn|ai|openai|visualization|simulation\b/.test(item.tags.join(" "))) score += 10;
  if (item.url) score += 5;
  return Math.min(100, score);
}

function talkingPointForItem(item: PortfolioItem, job: Pick<JobPosting, "company" | "title">) {
  const description = item.description.length > 180 ? `${item.description.slice(0, 177)}...` : item.description;
  return `${description || item.name} Use this only if it helps explain relevant work for ${job.company}'s ${job.title} role.`;
}

function dedupePortfolioItems(items: PortfolioItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.name.toLowerCase().replace(/[-_\s]+/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/next\.js/g, "nextjs")
    .replace(/node\.js/g, "nodejs")
    .split(/[^a-z0-9+#.]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 2 && !stopWords.has(term));
}

const stopWords = new Set(["the", "and", "for", "with", "that", "this", "from", "role", "job", "engineer", "software", "senior"]);
