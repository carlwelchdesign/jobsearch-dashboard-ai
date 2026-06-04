import type { ExperienceBullet, GithubRepository, Project, UserProfile, WorkExperience } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerApplicationQuestion } from "@/lib/ai/application-question";
import { parseStructuredOutput } from "@/lib/ai/openai";

vi.mock("@/lib/ai/openai", () => ({
  parseStructuredOutput: vi.fn(),
}));

const parseStructuredOutputMock = vi.mocked(parseStructuredOutput);

describe("answerApplicationQuestion", () => {
  beforeEach(() => {
    parseStructuredOutputMock.mockReset();
    parseStructuredOutputMock.mockResolvedValue(null);
  });

  it("keeps deterministic fallback answers aligned to cryptocurrency motivation questions", async () => {
    const result = await answerApplicationQuestion({
      question: "What excites you most about the cryptocurrency industry?",
      userProfile: profile(),
      bullets: [
        bullet("Yubico", "Built enterprise identity provisioning workflows with React, TypeScript, and Material UI."),
        bullet("Independent", "Built a local-first AI job search dashboard with agent automation and human approval gates."),
        bullet("TASER", "Developed a dashboard for reviewing and preparing body-worn camera evidence workflows."),
      ],
      workExperiences: [] as WorkExperience[],
      projects: [project("Jobsearch Dashboard AI", "Local-first AI job search dashboard.")],
      githubRepositories: [repo("jobsearch-dashboard-ai", "Local-first AI job search dashboard.")],
    });

    expect(result.generatedBy).toBe("deterministic_fallback");
    expect(result.options).toHaveLength(3);
    expect(result.options.map((option) => option.title)).toEqual([
      "Trust And Usability Angle",
      "Product Infrastructure Angle",
      "Builder Curiosity Angle",
    ]);
    expect(result.options[0].answer).toContain("cryptocurrency industry");
    expect(result.options[0].answer).not.toContain("One project I am proud of");
    expect(result.options[1].answer).not.toContain("A challenge I would highlight");
  });
});

function profile() {
  return {
    fullName: "Carl Welch",
    professionalSummary: "Senior frontend engineer focused on complex, high-trust product workflows.",
    masterSummary: null,
    yearsExperience: 10,
    primaryRoles: ["Senior Frontend Engineer"],
    coreSkills: ["React", "TypeScript", "Product engineering"],
    technicalSkills: ["React", "TypeScript", "Prisma"],
    industries: ["Security", "Enterprise software"],
    domainExpertise: ["Identity", "Workflow automation"],
  } as unknown as UserProfile;
}

function bullet(company: string, text: string) {
  return {
    company,
    role: "Senior Frontend Engineer",
    category: "impact",
    text,
    keywords: ["React", "TypeScript", "workflow"],
  } as unknown as ExperienceBullet;
}

function project(name: string, description: string) {
  return { name, description } as unknown as Project;
}

function repo(name: string, description: string) {
  return {
    name,
    description,
    isFork: false,
    language: "TypeScript",
    htmlUrl: `https://github.com/example/${name}`,
  } as unknown as GithubRepository;
}
