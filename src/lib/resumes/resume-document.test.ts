import { describe, expect, it } from "vitest";
import { parseResumeDocument } from "@/lib/resumes/resume-document";

describe("parseResumeDocument", () => {
  it("promotes project technology stacks into rendered skills", () => {
    const document = parseResumeDocument([
      "Carl Welch",
      "carl@example.com | linkedin.com/in/carlwelch",
      "",
      "Summary",
      "Senior Software Engineer.",
      "",
      "Skills",
      "identity, SaaS, frontend architecture, Backend-for-Frontend, React, TypeScript, JavaScript, Node.js, VR, AR, defense",
      "",
      "Projects",
      "- Job Search OS: Local-first AI-powered job search operating system coordinating specialized agents. | Next.js, TypeScript, React, Prisma, PostgreSQL, pgvector, Redis, Docker, OpenAI structured outputs, RAG, MCP, Model Context Protocol, LangGraph, LangChain, Playwright, Server-Sent Events, Material UI, Vitest",
    ].join("\n"));

    expect(document.projects[0]).toEqual(expect.objectContaining({
      name: "Job Search OS",
      technologies: expect.arrayContaining(["Next.js", "Prisma", "PostgreSQL", "pgvector", "LangGraph", "Material UI", "Vitest"]),
    }));
    expect(document.skills.slice(0, 28)).toEqual(expect.arrayContaining([
      "Next.js",
      "Prisma",
      "PostgreSQL",
      "pgvector",
      "Redis",
      "Docker",
      "OpenAI structured outputs",
      "RAG",
      "MCP",
      "LangGraph",
      "LangChain",
      "Material UI",
      "Vitest",
    ]));
  });
});
