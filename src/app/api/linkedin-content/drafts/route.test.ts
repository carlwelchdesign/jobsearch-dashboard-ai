import { beforeEach, describe, expect, it, vi } from "vitest";
import { runLinkedInContentAgent } from "@/lib/agents/linkedin-content";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";

vi.mock("@/lib/agents/linkedin-content", () => ({
  runLinkedInContentAgent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
    linkedInPostDraft: { findMany: vi.fn() },
  },
}));

const runLinkedInContentAgentMock = vi.mocked(runLinkedInContentAgent);
const userFindFirstMock = vi.mocked(prisma.user.findFirst);
const draftFindManyMock = vi.mocked(prisma.linkedInPostDraft.findMany);

describe("/api/linkedin-content/drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    draftFindManyMock.mockResolvedValue([{ id: "draft_1", title: "Draft" }] as never);
    runLinkedInContentAgentMock.mockResolvedValue({
      run: { id: "agent_run_1" },
      output: {
        draftId: "draft_1",
        title: "Draft",
        hook: "Hook",
        body: "Body",
        hashtags: ["#BuildInPublic"],
        disclosureText: "Prepared by my agent content team from the Job Search OS build log.",
        contentPillar: "app_progress",
        sourceFacts: [],
        memorySources: [],
        analyticsSources: [],
        agentReviews: [],
        claims: [],
        risks: [],
        screenshotAssets: [],
        selectedScreenshots: [],
        privacyReview: { status: "PASS", warnings: [], blockedTerms: [], reviewedAt: "2026-06-12T12:00:00Z" },
        mode: "deterministic",
        generationModel: "gpt-5.5",
      },
    } as never);
  });

  it("generates a draft through the LinkedIn content agent", async () => {
    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts", {
      method: "POST",
      body: JSON.stringify({
        prompt: "Document our system architecture with architectural diagrams.",
        format: "decision_diary",
        visualDirection: "show architecture diagrams",
      }),
    }));

    expect(response.status).toBe(201);
    expect(runLinkedInContentAgentMock).toHaveBeenCalledWith({
      prompt: "Document our system architecture with architectural diagrams.",
      format: "decision_diary",
      visualDirection: "show architecture diagrams",
    });
    await expect(response.json()).resolves.toMatchObject({
      draftId: "draft_1",
      agentRunId: "agent_run_1",
      message: "LinkedIn draft created for manual review.",
    });
  });

  it("keeps legacy content pillar generation compatible", async () => {
    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts", {
      method: "POST",
      body: JSON.stringify({ contentPillar: "architecture" }),
    }));

    expect(response.status).toBe(201);
    expect(runLinkedInContentAgentMock).toHaveBeenCalledWith({ contentPillar: "architecture" });
  });

  it("accepts detailed content briefs over the old 2000 character prompt limit", async () => {
    const detailedPrompt = [
      "Document the LinkedIn content workflow as a decision diary.",
      "Cover how the draft stays review-only, how privacy checks work, how visuals are selected, and how the prompt fidelity reviewer decides whether the result matches the request.",
      "Explain the system architecture, agent handoffs, evidence sources, draft editing loop, and why a detailed human brief should remain intact instead of being collapsed into a generic topic.",
    ].join(" ").repeat(12);

    expect(detailedPrompt.length).toBeGreaterThan(2000);

    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts", {
      method: "POST",
      body: JSON.stringify({ prompt: detailedPrompt }),
    }));

    expect(response.status).toBe(201);
    expect(runLinkedInContentAgentMock).toHaveBeenCalledWith({ prompt: detailedPrompt.trim() });
  });

  it("lists active drafts for the first local user", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(draftFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user_1", status: { not: "ARCHIVED" } },
    }));
    await expect(response.json()).resolves.toMatchObject({ drafts: [{ id: "draft_1" }] });
  });
});
