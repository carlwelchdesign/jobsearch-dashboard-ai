import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { publishLinkedInDraft } from "@/lib/linkedin/share";
import { materialClaimGate, syncMaterialClaimsForLinkedInDraft } from "@/lib/trust/material-claims";

vi.mock("@/lib/trust/material-claims", () => ({
  materialClaimGate: vi.fn(),
  syncMaterialClaimsForLinkedInDraft: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    linkedInPostDraft: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    linkedInShareConnection: {
      update: vi.fn(),
    },
  },
}));

const findUniqueMock = vi.mocked(prisma.linkedInPostDraft.findUnique);
const draftUpdateMock = vi.mocked(prisma.linkedInPostDraft.update);
const materialClaimGateMock = vi.mocked(materialClaimGate);
const syncMaterialClaimsForLinkedInDraftMock = vi.mocked(syncMaterialClaimsForLinkedInDraft);

describe("publishLinkedInDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncMaterialClaimsForLinkedInDraftMock.mockResolvedValue([] as never);
    materialClaimGateMock.mockResolvedValue({ canApprove: true, reason: "No unsupported claims are recorded.", claims: [], unsupportedClaims: [] } as never);
  });

  it("marks the draft failed when publish prerequisites are missing", async () => {
    findUniqueMock.mockResolvedValue({
      id: "draft_1",
      userId: "user_1",
      status: "APPROVED",
      privacyReview: { status: "PASS" },
      claims: [{ text: "Grounded", provenance: "memory", status: "grounded" }],
      user: { linkedinShareConnection: null },
    } as never);
    draftUpdateMock.mockResolvedValue({ id: "draft_1", status: "FAILED" } as never);

    await expect(publishLinkedInDraft("draft_1")).rejects.toThrow("LinkedIn publishing connection is not active");

    expect(draftUpdateMock).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: expect.objectContaining({
        status: "FAILED",
        publishError: expect.stringContaining("LinkedIn publishing connection is not active"),
      }),
    });
  });

  it("blocks drafts whose privacy review has not passed before connection work", async () => {
    findUniqueMock.mockResolvedValue({
      id: "draft_1",
      userId: "user_1",
      status: "APPROVED",
      privacyReview: { status: "NEEDS_REVIEW" },
      claims: [{ text: "Grounded", provenance: "memory", status: "grounded" }],
      user: { linkedinShareConnection: null },
    } as never);
    draftUpdateMock.mockResolvedValue({ id: "draft_1", status: "FAILED" } as never);

    await expect(publishLinkedInDraft("draft_1")).rejects.toThrow("Draft privacy review must pass before publishing");

    expect(draftUpdateMock).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: expect.objectContaining({
        status: "FAILED",
        publishError: expect.stringContaining("Draft privacy review must pass before publishing"),
      }),
    });
  });

  it("blocks drafts with ungrounded claims before connection work", async () => {
    findUniqueMock.mockResolvedValue({
      id: "draft_1",
      userId: "user_1",
      status: "APPROVED",
      privacyReview: { status: "PASS" },
      claims: [{ text: "Unsupported metric", provenance: "missing", status: "ungrounded" }],
      user: { linkedinShareConnection: null },
    } as never);
    draftUpdateMock.mockResolvedValue({ id: "draft_1", status: "FAILED" } as never);

    await expect(publishLinkedInDraft("draft_1")).rejects.toThrow("Draft contains ungrounded public claims");

    expect(draftUpdateMock).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: expect.objectContaining({
        status: "FAILED",
        publishError: expect.stringContaining("Draft contains ungrounded public claims"),
      }),
    });
  });

  it("blocks drafts when synced material claims are unsupported", async () => {
    findUniqueMock.mockResolvedValue({
      id: "draft_1",
      userId: "user_1",
      status: "APPROVED",
      privacyReview: { status: "PASS" },
      claims: [{ text: "Grounded", provenance: "memory", status: "grounded" }],
      user: { linkedinShareConnection: null },
    } as never);
    draftUpdateMock.mockResolvedValue({ id: "draft_1", status: "FAILED" } as never);
    materialClaimGateMock.mockResolvedValue({ canApprove: false, reason: "Resolve 1 unsupported claim before approval.", claims: [], unsupportedClaims: [{ id: "claim_1" }] } as never);

    await expect(publishLinkedInDraft("draft_1")).rejects.toThrow("Resolve 1 unsupported claim");

    expect(syncMaterialClaimsForLinkedInDraftMock).toHaveBeenCalledWith("draft_1");
    expect(draftUpdateMock).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: expect.objectContaining({
        status: "FAILED",
        publishError: expect.stringContaining("Resolve 1 unsupported claim"),
      }),
    });
  });
});
