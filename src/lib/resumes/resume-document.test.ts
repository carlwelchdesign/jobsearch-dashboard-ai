import { describe, expect, it } from "vitest";
import { parseResumeDocument } from "@/lib/resumes/resume-document";

describe("parseResumeDocument", () => {
  it("promotes project technology stacks into rendered skills", () => {
    const document = parseResumeDocument(
      [
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
      ].join("\n"),
    );

    expect(document.projects[0]).toEqual(
      expect.objectContaining({
        name: "Job Search OS",
        technologies: expect.arrayContaining([
          "Next.js",
          "Prisma",
          "PostgreSQL",
          "pgvector",
          "LangGraph",
          "Material UI",
          "Vitest",
        ]),
      }),
    );
    expect(document.skills.slice(0, 28)).toEqual(
      expect.arrayContaining([
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
        "real-time event streaming",
        "Material UI",
        "Vitest",
      ]),
    );
    expect(document.skills).not.toContain("Model Context Protocol");
    expect(document.skills).not.toContain("Server-Sent Events");
  });

  it("filters unrelated music skills from rendered top-level skills", () => {
    const document = parseResumeDocument(
      [
        "Carl Welch",
        "",
        "Summary",
        "Senior Software Engineer.",
        "",
        "Skills",
        "React, TypeScript, guitar, guitarchords, music-theory, music-tools",
        "",
        "Projects",
        "- Job Search OS: Local-first product workflow system. | Next.js, React, MCP",
      ].join("\n"),
    );

    expect(document.skills).toEqual(
      expect.arrayContaining(["React", "TypeScript", "MCP"]),
    );
    expect(document.skills).not.toEqual(
      expect.arrayContaining(["guitar", "guitarchords", "music-theory", "music-tools"]),
    );
  });

  it("filters music skills for non-music jobs even when a music project is present", () => {
    const document = parseResumeDocument(
      [
        "Carl Welch",
        "",
        "Summary",
        "Senior Software Engineer.",
        "",
        "Skills",
        "React, TypeScript, guitar, music-theory, music-tools",
        "",
        "Projects",
        "- AI Musician Helper: Creator tool for guitar chord practice and music theory workflows. | React, guitar, music-theory, music-tools",
      ].join("\n"),
      { jobText: "Frontend Platform Engineer building React dashboards and developer tools." },
    );

    expect(document.skills).toEqual(expect.arrayContaining(["React", "TypeScript"]));
    expect(document.skills).not.toEqual(
      expect.arrayContaining(["guitar", "music-theory", "music-tools"]),
    );
  });

  it("keeps music skills when the target job is music related", () => {
    const document = parseResumeDocument(
      [
        "Carl Welch",
        "",
        "Summary",
        "Senior Software Engineer.",
        "",
        "Skills",
        "React, TypeScript, guitar, music-theory",
        "",
        "Projects",
        "- AI Musician Helper: Creator tool for guitar chord practice and music theory workflows. | React, guitar, music-theory",
      ].join("\n"),
      { jobText: "Senior Frontend Engineer for a music creator tool and audio practice platform." },
    );

    expect(document.skills).toEqual(
      expect.arrayContaining(["guitar", "music-theory"]),
    );
  });
});
