import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishLinkedInDraft } from "@/lib/linkedin/share";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/linkedin/share", async () => {
  const actual = await vi.importActual<typeof import("@/lib/linkedin/share")>("@/lib/linkedin/share");
  return {
    ...actual,
    publishLinkedInDraft: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    linkedInPostDraft: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

const findUniqueMock = vi.mocked(prisma.linkedInPostDraft.findUnique);
const updateMock = vi.mocked(prisma.linkedInPostDraft.update);
const publishMock = vi.mocked(publishLinkedInDraft);

describe("/api/linkedin-content/drafts/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue({
      privacyReview: { status: "PASS" },
      claims: [{ text: "Grounded", provenance: "memory", status: "grounded" }],
    } as never);
    updateMock.mockResolvedValue({ id: "draft_1", status: "APPROVED" } as never);
    publishMock.mockResolvedValue({ id: "draft_1", status: "PUBLISHED" } as never);
  });

  it("approves and publishes the draft", async () => {
    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts/draft_1/approve", { method: "POST" }), { params: { id: "draft_1" } });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "draft_1" },
      data: expect.objectContaining({ status: "APPROVED", publishError: null }),
    }));
    expect(publishMock).toHaveBeenCalledWith("draft_1", { overrideReview: undefined });
    expect(response.status).toBe(200);
  });

  it("does not approve or publish drafts with failed review", async () => {
    findUniqueMock.mockResolvedValue({
      privacyReview: { status: "NEEDS_REVIEW" },
      claims: [{ text: "Grounded", provenance: "memory", status: "grounded" }],
    } as never);

    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts/draft_1/approve", { method: "POST" }), { params: { id: "draft_1" } });

    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("does not approve or publish drafts with ungrounded claims", async () => {
    findUniqueMock.mockResolvedValue({
      privacyReview: { status: "PASS" },
      claims: [{ text: "Unsupported metric", provenance: "missing", status: "ungrounded" }],
    } as never);

    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts/draft_1/approve", { method: "POST" }), { params: { id: "draft_1" } });

    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("approves and publishes with explicit review override", async () => {
    findUniqueMock.mockResolvedValue({
      privacyReview: { status: "PASS" },
      claims: [{ text: "Unsupported metric", provenance: "missing", status: "ungrounded" }],
    } as never);

    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts/draft_1/approve", {
      method: "POST",
      body: JSON.stringify({ overrideReview: true }),
    }), { params: { id: "draft_1" } });

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "draft_1" },
      data: expect.objectContaining({ status: "APPROVED", publishError: null }),
    }));
    expect(publishMock).toHaveBeenCalledWith("draft_1", { overrideReview: true });
  });
});
