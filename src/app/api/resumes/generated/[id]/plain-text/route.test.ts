import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    generatedResume: { findUnique: vi.fn() },
  },
}));

const findUniqueMock = vi.mocked(prisma.generatedResume.findUnique);

describe("GET /api/resumes/generated/[id]/plain-text", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cleans stale top-level skills using the target job context", async () => {
    findUniqueMock.mockResolvedValue({
      id: "resume_1",
      plainText: [
        "Carl Welch",
        "",
        "Skills",
        "React, TypeScript, Model Context Protocol, MCP, Server-Sent Events, guitar, music-theory, music-tools",
        "",
        "Experience",
        "Senior Software Engineer - Acme",
      ].join("\n"),
      markdown: null,
      jobPosting: {
        company: "Acme",
        title: "Frontend Platform Engineer",
        description: "Build React and TypeScript developer platforms.",
      },
      user: { name: "Carl Welch" },
    } as never);

    const response = await GET(
      new Request("http://localhost/api/resumes/generated/resume_1/plain-text"),
      { params: { id: "resume_1" } },
    );

    const text = await response.text();
    expect(text).toContain(
      "Skills\nReact, TypeScript, MCP, real-time event streaming",
    );
    expect(text).not.toContain("Model Context Protocol");
    expect(text).not.toContain("Server-Sent Events");
    expect(text).not.toContain("guitar");
    expect(text).not.toContain("music-theory");
    expect(text).not.toContain("music-tools");
  });

  it("returns 404 for a missing resume", async () => {
    findUniqueMock.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/resumes/generated/missing/plain-text"),
      { params: { id: "missing" } },
    );

    expect(response.status).toBe(404);
  });
});
