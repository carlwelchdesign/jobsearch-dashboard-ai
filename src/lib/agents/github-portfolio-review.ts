import type { GithubRepository, UserProfile } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";

export type GithubPortfolioReviewInput = {
  userId?: string;
};

export type GithubPortfolioReviewOutput = {
  profileId: string | null;
  githubUrl: string | null;
  repositoryCount: number;
  reviewedRepositoryCount: number;
  overallReadinessScore: number;
  repositoryReviews: Array<{
    repositoryId: string;
    name: string;
    url: string;
    readinessScore: number;
    targetTracks: string[];
    strengths: string[];
    gaps: string[];
    recommendedEdits: string[];
    evidenceRefs: string[];
  }>;
  priorityActions: string[];
  warnings: string[];
  confidence: number;
  reasoningSummary: string;
};

type ReviewProfile = Pick<UserProfile, "id" | "githubUrl"> & {
  githubRepositories: Array<Pick<GithubRepository, "id" | "name" | "fullName" | "htmlUrl" | "description" | "homepage" | "readmeText" | "wikiText" | "language" | "topics" | "stars" | "forks" | "isFork" | "isArchived" | "pushedAt">>;
};

type Track = {
  name: string;
  terms: string[];
  highSignalTerms: string[];
};

const tracks: Track[] = [
  { name: "Security / Identity", terms: ["security", "identity", "auth", "authentication", "webauthn", "passkey", "passkeys"], highSignalTerms: ["webauthn", "passkey", "authentication", "identity"] },
  { name: "AI Product", terms: ["ai", "openai", "llm", "agent", "structured", "prompt", "rag"], highSignalTerms: ["openai", "llm", "structured", "rag"] },
  { name: "Defense / Visualization", terms: ["simulation", "visualization", "3d", "three", "map", "geospatial", "mission"], highSignalTerms: ["simulation", "visualization", "geospatial", "three"] },
  { name: "Design Systems / Frontend Platform", terms: ["storybook", "component", "design-system", "design systems", "ui", "frontend", "react", "typescript"], highSignalTerms: ["storybook", "component", "design-system"] },
  { name: "Full-Stack SaaS", terms: ["next", "nextjs", "react", "typescript", "node", "postgres", "prisma", "stripe", "saas"], highSignalTerms: ["next", "typescript", "prisma", "stripe", "saas"] },
];

export async function runGithubPortfolioReviewAgent(input: GithubPortfolioReviewInput = {}) {
  return runAgent<GithubPortfolioReviewInput, GithubPortfolioReviewOutput>({
    agentType: "GITHUB_PORTFOLIO_REVIEW",
    input,
    userId: input.userId,
    execute: async () => {
      const user = await prisma.user.findFirst({
        where: input.userId ? { id: input.userId } : undefined,
        include: {
          profile: {
            include: {
              githubRepositories: {
                orderBy: [{ pushedAt: "desc" }, { stars: "desc" }],
                take: 80,
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      return buildGithubPortfolioReview(user?.profile ?? null);
    },
  });
}

export function buildGithubPortfolioReview(profile: ReviewProfile | null): GithubPortfolioReviewOutput {
  const repositories = profile?.githubRepositories ?? [];
  const reviewable = repositories.filter((repo) => !repo.isArchived && !repo.isFork);
  const repositoryReviews = reviewable
    .map(reviewRepository)
    .filter((review) => review.targetTracks.length || review.readinessScore >= 45)
    .sort((left, right) => right.readinessScore - left.readinessScore)
    .slice(0, 12);
  const overallReadinessScore = repositoryReviews.length
    ? Math.round(repositoryReviews.reduce((total, review) => total + review.readinessScore, 0) / repositoryReviews.length)
    : 0;
  const priorityActions = buildPriorityActions(repositoryReviews, reviewable.length);
  const warnings = buildWarnings(profile, repositories, reviewable, repositoryReviews);

  return {
    profileId: profile?.id ?? null,
    githubUrl: profile?.githubUrl ?? null,
    repositoryCount: repositories.length,
    reviewedRepositoryCount: repositoryReviews.length,
    overallReadinessScore,
    repositoryReviews,
    priorityActions,
    warnings,
    confidence: repositoryReviews.length >= 5 ? 0.78 : repositoryReviews.length ? 0.62 : 0.42,
    reasoningSummary: "Reviewed synced GitHub About metadata, README content, wiki content, topics, demo links, recency, and target-track alignment. Recommendations are based only on saved repository data and do not invent project claims.",
  };
}

function reviewRepository(repo: ReviewProfile["githubRepositories"][number]): GithubPortfolioReviewOutput["repositoryReviews"][number] {
  const topics = jsonArray(repo.topics);
  const readmeSignals = summarizeDocumentationSignals(repo.readmeText);
  const wikiSignals = summarizeDocumentationSignals(repo.wikiText);
  const text = normalize(`${repo.name} ${repo.description ?? ""} ${repo.homepage ?? ""} ${repo.language ?? ""} ${topics.join(" ")} ${readmeSignals} ${wikiSignals}`);
  const matchedTracks = tracks
    .map((track) => ({ track, matches: track.terms.filter((term) => text.includes(normalize(term))) }))
    .filter((item) => item.matches.length)
    .sort((left, right) => right.matches.length - left.matches.length);
  const targetTracks = matchedTracks.slice(0, 3).map((item) => item.track.name);
  const strengths = buildStrengths(repo, topics, matchedTracks);
  const gaps = buildGaps(repo, topics, targetTracks);
  const recommendedEdits = buildRecommendedEdits(repo, topics, targetTracks, gaps);
  const readinessScore = scoreRepository(repo, topics, matchedTracks, gaps);

  return {
    repositoryId: repo.id,
    name: repo.name,
    url: repo.htmlUrl,
    readinessScore,
    targetTracks,
    strengths,
    gaps,
    recommendedEdits,
    evidenceRefs: [repo.id],
  };
}

function buildStrengths(repo: ReviewProfile["githubRepositories"][number], topics: string[], matchedTracks: Array<{ track: Track; matches: string[] }>) {
  const strengths: string[] = [];
  if (repo.description) strengths.push("Has a public description.");
  if (repo.homepage) strengths.push("Has a demo or project homepage link.");
  if (hasMeaningfulDocumentation(repo.readmeText)) strengths.push("README provides inspectable project context.");
  if (hasMeaningfulDocumentation(repo.wikiText)) strengths.push("Wiki provides deeper product or architecture context.");
  if (topics.length >= 4) strengths.push("Uses GitHub topics to expose searchable signals.");
  if (repo.pushedAt && daysSince(repo.pushedAt) <= 180) strengths.push("Shows recent activity.");
  for (const match of matchedTracks.slice(0, 2)) {
    strengths.push(`Maps to ${match.track.name} through ${match.matches.slice(0, 4).join(", ")}.`);
  }
  return unique(strengths).slice(0, 7);
}

function buildGaps(repo: ReviewProfile["githubRepositories"][number], topics: string[], targetTracks: string[]) {
  const gaps: string[] = [];
  if (!repo.description || repo.description.length < 50) gaps.push("Description is too thin for recruiter scanning.");
  if (!repo.homepage && !hasDemoOrScreenshotDocumentation(repo)) gaps.push("No demo, live app, screenshot, or walkthrough signal is synced.");
  if (!hasMeaningfulDocumentation(repo.readmeText)) gaps.push("README content is missing or too thin for deeper skill recognition.");
  if (!hasMeaningfulDocumentation(repo.wikiText)) gaps.push("Wiki content is not synced or does not expose deeper project context.");
  if (topics.length < 4) gaps.push("Few GitHub topics are available for skill matching.");
  if (!repo.pushedAt) gaps.push("No recent push date is available.");
  if (repo.pushedAt && daysSince(repo.pushedAt) > 365) gaps.push("Repository looks stale from the synced push date.");
  if (!targetTracks.length) gaps.push("Target positioning is unclear from name, description, language, and topics.");
  return gaps;
}

function buildRecommendedEdits(repo: ReviewProfile["githubRepositories"][number], topics: string[], targetTracks: string[], gaps: string[]) {
  const edits: string[] = [];
  if (gaps.some((gap) => gap.includes("Description"))) edits.push("Rewrite the repo description around the user problem, core stack, and what a reviewer can inspect.");
  if (gaps.some((gap) => gap.includes("demo"))) edits.push("Add a homepage/demo link, screenshots, or a README walkthrough if the app cannot be hosted.");
  if (gaps.some((gap) => gap.includes("README"))) edits.push("Expand the README with architecture, workflow screenshots, setup, and product outcomes.");
  if (gaps.some((gap) => gap.includes("Wiki"))) edits.push("Add or sync wiki pages that explain architecture, workflows, and implementation decisions.");
  if (topics.length < 4) edits.push(`Add focused topics such as ${recommendedTopics(targetTracks).join(", ")}.`);
  if (gaps.some((gap) => gap.includes("stale"))) edits.push("Add a recent README update that explains current status and what is production-ready versus experimental.");
  if (targetTracks.includes("Security / Identity")) edits.push("Make authentication, authorization, WebAuthn/passkey, or security boundaries explicit where supported by the code.");
  if (targetTracks.includes("AI Product")) edits.push("Document the AI workflow, model boundaries, structured outputs, and user-facing controls.");
  if (targetTracks.includes("Defense / Visualization")) edits.push("Show screenshots or clips of the visualization state, controls, and real-time behavior.");
  return unique(edits).slice(0, 5);
}

function scoreRepository(
  repo: ReviewProfile["githubRepositories"][number],
  topics: string[],
  matchedTracks: Array<{ track: Track; matches: string[] }>,
  gaps: string[],
) {
  let score = 25;
  if (repo.description) score += repo.description.length >= 80 ? 20 : 12;
  if (repo.homepage) score += 12;
  if (hasMeaningfulDocumentation(repo.readmeText)) score += 16;
  if (hasMeaningfulDocumentation(repo.wikiText)) score += 10;
  if (hasDemoOrScreenshotDocumentation(repo)) score += 8;
  score += Math.min(14, topics.length * 2);
  if (repo.language) score += 6;
  if (repo.pushedAt && daysSince(repo.pushedAt) <= 180) score += 12;
  if (repo.pushedAt && daysSince(repo.pushedAt) > 365) score -= 10;
  score += Math.min(20, matchedTracks.reduce((total, match) => total + match.matches.length, 0) * 3);
  score -= Math.min(18, gaps.length * 2);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildPriorityActions(reviews: GithubPortfolioReviewOutput["repositoryReviews"], reviewableCount: number) {
  if (!reviewableCount) return ["Sync GitHub repositories from Settings before running portfolio review."];
  const actions = reviews
    .flatMap((review) => review.recommendedEdits.map((edit) => `${review.name}: ${edit}`))
    .slice(0, 6);
  if (reviews.filter((review) => review.readinessScore >= 70).length < 3) {
    actions.unshift("Choose three flagship repos and make their descriptions, topics, README screenshots, and demo links recruiter-ready.");
  }
  return unique(actions).slice(0, 7);
}

function buildWarnings(
  profile: ReviewProfile | null,
  repositories: ReviewProfile["githubRepositories"],
  reviewable: ReviewProfile["githubRepositories"],
  reviews: GithubPortfolioReviewOutput["repositoryReviews"],
) {
  const warnings: string[] = [];
  if (!profile?.githubUrl) warnings.push("GitHub profile URL is missing.");
  if (!repositories.length) warnings.push("No synced GitHub repositories found.");
  if (repositories.length && !reviewable.length) warnings.push("All synced repositories are forks or archived.");
  if (reviewable.length && !reviews.length) warnings.push("No synced repositories have enough target-role signal to recommend yet.");
  return warnings;
}

function recommendedTopics(targetTracks: string[]) {
  const topics = new Set(["react", "typescript"]);
  if (targetTracks.includes("Security / Identity")) ["auth", "webauthn", "passkeys"].forEach((topic) => topics.add(topic));
  if (targetTracks.includes("AI Product")) ["ai", "openai", "llm"].forEach((topic) => topics.add(topic));
  if (targetTracks.includes("Defense / Visualization")) ["visualization", "simulation", "threejs"].forEach((topic) => topics.add(topic));
  if (targetTracks.includes("Design Systems / Frontend Platform")) ["storybook", "design-systems", "frontend-platform"].forEach((topic) => topics.add(topic));
  return Array.from(topics).slice(0, 5);
}

function daysSince(date: Date) {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/next\.js/g, "nextjs").replace(/node\.js/g, "nodejs");
}

function hasMeaningfulDocumentation(value: string | null | undefined) {
  return Boolean(value && normalizeMarkdown(value).length >= 200);
}

function hasDemoOrScreenshotDocumentation(repo: Pick<GithubRepository, "homepage" | "readmeText" | "wikiText">) {
  const text = normalize(`${repo.homepage ?? ""} ${repo.readmeText ?? ""} ${repo.wikiText ?? ""}`);
  return /\b(demo|homepage|live app|screenshot|screenshots|walkthrough|preview|video|loom|vercel|netlify|render)\b/.test(text) || /!\[[^\]]*]\(/.test(`${repo.readmeText ?? ""} ${repo.wikiText ?? ""}`);
}

function summarizeDocumentationSignals(value: string | null | undefined) {
  if (!value) return "";
  return normalizeMarkdown(value)
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 1800)
    .join(" ");
}

function normalizeMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " screenshot ")
    .replace(/\[[^\]]+]\([^)]+\)/g, " ")
    .replace(/[#>*_\-|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
