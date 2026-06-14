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
        prompt: "Document the Email Ops agent team as a field note.",
        format: "field_note",
        visualDirection: "show Email Ops evidence",
      }),
    }));

    expect(response.status).toBe(201);
    expect(runLinkedInContentAgentMock).toHaveBeenCalledWith({
      prompt: "Document the Email Ops agent team as a field note.",
      format: "field_note",
      visualDirection: "show Email Ops evidence",
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

  it("lists active drafts for the first local user", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(draftFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user_1", status: { not: "ARCHIVED" } },
    }));
    await expect(response.json()).resolves.toMatchObject({ drafts: [{ id: "draft_1" }] });
  });
});
