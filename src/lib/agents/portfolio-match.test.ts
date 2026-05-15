import type { GithubRepository, JobPosting, Project } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildPortfolioMatch } from "@/lib/agents/portfolio-match";

describe("portfolio match agent", () => {
  it("matches grounded projects and repositories to a job", () => {
    const output = buildPortfolioMatch({
      applicationId: "app",
      job: {
        company: "IdentityCo",
        title: "Senior Frontend Engineer",
        description: "Build React TypeScript authentication workflows, passkeys, WebAuthn, dashboards, and admin tools.",
      } as JobPosting,
      projects: [
        {
          name: "Progression Lab AI",
          description: "Next.js AI SaaS with OpenAI structured outputs.",
          url: "https://example.com",
          repoUrl: null,
          technologies: ["React", "TypeScript", "Next.js"],
          highlights: ["AI product", "admin controls"],
        },
      ] as unknown as Project[],
      repositories: [
        {
          name: "webauthn-core",
          description: "Reusable WebAuthn orchestration package for passkey registration and authentication flows.",
          htmlUrl: "https://github.com/example/webauthn-core",
          language: "TypeScript",
          topics: ["webauthn", "passkeys", "security", "authentication"],
          isFork: false,
          isArchived: false,
        },
      ] as unknown as GithubRepository[],
    });

    expect(output.projectLinks[0]?.name).toBe("webauthn-core");
    expect(output.projectLinks[0]?.url).toContain("github");
    expect(output.warnings).toEqual([]);
    expect(output.confidence).toBeGreaterThan(0.6);
  });
});
