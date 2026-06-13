import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishLinkedInDraft } from "@/lib/linkedin/share";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/linkedin/share", () => ({
  publishLinkedInDraft: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    linkedInPostDraft: { update: vi.fn() },
  },
}));

const updateMock = vi.mocked(prisma.linkedInPostDraft.update);
const publishMock = vi.mocked(publishLinkedInDraft);

describe("/api/linkedin-content/drafts/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue({ id: "draft_1", status: "APPROVED" } as never);
    publishMock.mockResolvedValue({ id: "draft_1", status: "PUBLISHED" } as never);
  });

  it("approves and publishes the draft", async () => {
    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts/draft_1/approve", { method: "POST" }), { params: { id: "draft_1" } });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "draft_1" },
      data: expect.objectContaining({ status: "APPROVED", publishError: null }),
    }));
    expect(publishMock).toHaveBeenCalledWith("draft_1");
    expect(response.status).toBe(200);
  });
});
