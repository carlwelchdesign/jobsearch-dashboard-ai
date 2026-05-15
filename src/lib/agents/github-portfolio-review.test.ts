import { describe, expect, it } from "vitest";
import { buildGithubPortfolioReview } from "@/lib/agents/github-portfolio-review";

describe("github portfolio review agent", () => {
  it("scores repository readiness from synced metadata without inventing claims", () => {
    const output = buildGithubPortfolioReview({
      id: "profile_1",
      githubUrl: "https://github.com/carl",
      githubRepositories: [
        {
          id: "repo_webauthn",
          name: "webauthn-core",
          fullName: "carl/webauthn-core",
          htmlUrl: "https://github.com/carl/webauthn-core",
          description: "Reusable server-side WebAuthn orchestration package with pluggable adapters for authentication flows.",
          homepage: "https://example.com/webauthn",
          language: "TypeScript",
          topics: ["typescript", "webauthn", "passkeys", "authentication", "security"],
          stars: 2,
          forks: 0,
          isFork: false,
          isArchived: false,
          pushedAt: new Date(),
        },
      ],
    });

    expect(output.repositoryReviews[0]?.targetTracks).toContain("Security / Identity");
    expect(output.repositoryReviews[0]?.readinessScore).toBeGreaterThanOrEqual(70);
    expect(output.repositoryReviews[0]?.evidenceRefs).toEqual(["repo_webauthn"]);
    expect(output.reasoningSummary).toContain("saved repository data");
  });

  it("flags thin or stale repositories with concrete edits", () => {
    const output = buildGithubPortfolioReview({
      id: "profile_1",
      githubUrl: "https://github.com/carl",
      githubRepositories: [
        {
          id: "repo_emf",
          name: "emf-disturbance-sim",
          fullName: "carl/emf-disturbance-sim",
          htmlUrl: "https://github.com/carl/emf-disturbance-sim",
          description: "3D sim",
          homepage: null,
          language: "TypeScript",
          topics: ["react"],
          stars: 0,
          forks: 0,
          isFork: false,
          isArchived: false,
          pushedAt: new Date("2024-01-01T00:00:00.000Z"),
        },
      ],
    });

    const review = output.repositoryReviews[0];
    expect(review?.gaps).toContain("Description is too thin for recruiter scanning.");
    expect(review?.recommendedEdits.some((edit) => edit.includes("description"))).toBe(true);
    expect(output.priorityActions.length).toBeGreaterThan(0);
  });

  it("warns when no GitHub repositories are synced", () => {
    const output = buildGithubPortfolioReview({
      id: "profile_1",
      githubUrl: "https://github.com/carl",
      githubRepositories: [],
    });

    expect(output.warnings).toContain("No synced GitHub repositories found.");
    expect(output.priorityActions).toContain("Sync GitHub repositories from Settings before running portfolio review.");
  });
});
