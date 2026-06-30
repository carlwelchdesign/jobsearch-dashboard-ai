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

  it("collapses human-in-the-loop aliases to HITL", () => {
    const document = parseResumeDocument(
      [
        "Carl Welch",
        "",
        "Summary",
        "Senior Software Engineer.",
        "",
        "Skills",
        "React, HITL, human-in-the-loop, human in the loop",
      ].join("\n"),
    );

    expect(document.skills).toEqual(expect.arrayContaining(["React", "HITL"]));
    expect(document.skills.filter((skill) => skill === "HITL")).toHaveLength(1);
    expect(document.skills).not.toEqual(
      expect.arrayContaining(["human-in-the-loop", "human in the loop"]),
    );
  });

  it("keeps top-level skills ahead of project stack skills in rendered previews", () => {
    const document = parseResumeDocument(
      [
        "Carl Welch",
        "",
        "Summary",
        "Senior Software Engineer.",
        "",
        "Skills",
        "React, TypeScript, React Native, developer experience, API Design, Backend-for-Frontend, real-time event streaming, ai, JavaScript, Node.js, Redux, Material UI, Storybook, Jest, Playwright, API integrations, ElasticSearch, identity, SaaS, component library, analytics, HITL, frontend architecture",
        "",
        "Projects",
        "- Job Search OS: Local-first product workflow system. | Next.js, Prisma, PostgreSQL, pgvector, Redis, Docker, OpenAI structured outputs, RAG, MCP, LangGraph, LangChain, Playwright, Material UI, Vitest",
      ].join("\n"),
    );

    expect(document.skills.indexOf("HITL")).toBeGreaterThanOrEqual(0);
    expect(document.skills).toEqual(expect.arrayContaining(["REST APIs"]));
    expect(document.skills.indexOf("REST APIs")).toBeGreaterThan(
      document.skills.indexOf("API Design"),
    );
    expect(document.skills.indexOf("HITL")).toBeLessThan(28);
    expect(document.skills.indexOf("HITL")).toBeLessThan(
      document.skills.indexOf("Next.js"),
    );
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
        "React, TypeScript, guitar, guitarchords, music-theory, music-tools, piano, pianochord, pianochords",
        "",
        "Projects",
        "- Job Search OS: Local-first product workflow system. | Next.js, React, MCP",
      ].join("\n"),
    );

    expect(document.skills).toEqual(
      expect.arrayContaining(["React", "TypeScript", "MCP"]),
    );
    expect(document.skills).not.toEqual(
      expect.arrayContaining([
        "guitar",
        "guitarchords",
        "music-theory",
        "music-tools",
        "piano",
        "pianochord",
        "pianochords",
      ]),
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
        "React, TypeScript, guitar, music-theory, music-tools, piano, pianochord",
        "",
        "Projects",
        "- AI Musician Helper: Creator tool for guitar chord practice and music theory workflows. | React, guitar, music-theory, music-tools, piano, pianochord",
      ].join("\n"),
      { jobText: "Frontend Platform Engineer building React dashboards and developer tools." },
    );

    expect(document.skills).toEqual(expect.arrayContaining(["React", "TypeScript"]));
    expect(document.skills).not.toEqual(
      expect.arrayContaining(["guitar", "music-theory", "music-tools", "piano", "pianochord"]),
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
        "React, TypeScript, guitar, music-theory, piano, pianochord",
        "",
        "Projects",
        "- AI Musician Helper: Creator tool for guitar chord practice and music theory workflows. | React, guitar, music-theory, piano, pianochord",
      ].join("\n"),
      { jobText: "Senior Frontend Engineer for a music creator tool and audio practice platform." },
    );

    expect(document.skills).toEqual(
      expect.arrayContaining(["guitar", "music-theory", "piano", "pianochord"]),
    );
  });
});
