import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishLinkedInDraft } from "@/lib/linkedin/share";
import { prisma } from "@/lib/prisma";
import { materialClaimGate, syncMaterialClaimsForLinkedInDraft } from "@/lib/trust/material-claims";
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

vi.mock("@/lib/trust/material-claims", () => ({
  materialClaimGate: vi.fn(),
  syncMaterialClaimsForLinkedInDraft: vi.fn(),
}));

const findUniqueMock = vi.mocked(prisma.linkedInPostDraft.findUnique);
const updateMock = vi.mocked(prisma.linkedInPostDraft.update);
const publishMock = vi.mocked(publishLinkedInDraft);
const materialClaimGateMock = vi.mocked(materialClaimGate);
const syncMaterialClaimsForLinkedInDraftMock = vi.mocked(syncMaterialClaimsForLinkedInDraft);

describe("/api/linkedin-content/drafts/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue({
      privacyReview: { status: "PASS" },
      claims: [{ text: "Grounded", provenance: "memory", status: "grounded" }],
    } as never);
    updateMock.mockResolvedValue({ id: "draft_1", status: "APPROVED" } as never);
    publishMock.mockResolvedValue({ id: "draft_1", status: "PUBLISHED" } as never);
    syncMaterialClaimsForLinkedInDraftMock.mockResolvedValue([] as never);
    materialClaimGateMock.mockResolvedValue({ canApprove: true, reason: "No unsupported claims are recorded.", claims: [], unsupportedClaims: [] } as never);
  });

  it("approves and publishes the draft", async () => {
    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts/draft_1/approve", { method: "POST" }), { params: { id: "draft_1" } });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "draft_1" },
      data: expect.objectContaining({ status: "APPROVED", publishError: null }),
    }));
    expect(syncMaterialClaimsForLinkedInDraftMock).toHaveBeenCalledWith("draft_1");
    expect(materialClaimGateMock).toHaveBeenCalledWith({ artifactType: "LINKEDIN_POST_DRAFT", artifactId: "draft_1" });
    expect(publishMock).toHaveBeenCalledWith("draft_1");
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

  it("does not approve or publish drafts with unsupported synced claims", async () => {
    materialClaimGateMock.mockResolvedValue({ canApprove: false, reason: "Resolve 1 unsupported claim before approval.", claims: [], unsupportedClaims: [{ id: "claim_1" }] } as never);

    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts/draft_1/approve", { method: "POST" }), { params: { id: "draft_1" } });

    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });
});
