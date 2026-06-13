import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { publishLinkedInDraft } from "@/lib/linkedin/share";

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

describe("publishLinkedInDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
