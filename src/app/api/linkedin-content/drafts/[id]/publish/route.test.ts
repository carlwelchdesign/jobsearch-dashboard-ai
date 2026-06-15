import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

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
const updateMock = vi.mocked(prisma.linkedInPostDraft.update);

describe("/api/linkedin-content/drafts/[id]/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue({ id: "draft_1", status: "FAILED" } as never);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch should not run"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks publishing when privacy review has not passed", async () => {
    findUniqueMock.mockResolvedValue({
      id: "draft_1",
      userId: "user_1",
      status: "APPROVED",
      privacyReview: { status: "NEEDS_REVIEW" },
      claims: [{ text: "Grounded", provenance: "memory", status: "grounded" }],
      user: { linkedinShareConnection: null },
    } as never);

    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts/draft_1/publish", { method: "POST" }), { params: { id: "draft_1" } });

    expect(response.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: expect.objectContaining({ status: "FAILED" }),
    });
    expect(updateMock).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PUBLISHING" }),
    }));
  });

  it("blocks publishing when claims are ungrounded", async () => {
    findUniqueMock.mockResolvedValue({
      id: "draft_1",
      userId: "user_1",
      status: "APPROVED",
      privacyReview: { status: "PASS" },
      claims: [{ text: "Unsupported", provenance: "missing", status: "ungrounded" }],
      user: { linkedinShareConnection: null },
    } as never);

    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts/draft_1/publish", { method: "POST" }), { params: { id: "draft_1" } });

    expect(response.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PUBLISHING" }),
    }));
  });
});
