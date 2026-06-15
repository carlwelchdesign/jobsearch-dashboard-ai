import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { PATCH } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    linkedInPostDraft: { update: vi.fn() },
  },
}));

const draftUpdateMock = vi.mocked(prisma.linkedInPostDraft.update);

describe("/api/linkedin-content/drafts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    draftUpdateMock.mockResolvedValue({ id: "draft_1", status: "ARCHIVED" } as never);
  });

  it("archives a LinkedIn content draft", async () => {
    const response = await PATCH(new Request("http://localhost/api/linkedin-content/drafts/draft_1", {
      method: "PATCH",
      body: JSON.stringify({ status: "ARCHIVED" }),
    }), { params: { id: "draft_1" } });

    expect(response.status).toBe(200);
    expect(draftUpdateMock).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: { status: "ARCHIVED", publishError: null },
    });
  });

  it("saves editable draft fields", async () => {
    const response = await PATCH(new Request("http://localhost/api/linkedin-content/drafts/draft_1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Updated", hook: "Hook", body: "Body", hashtags: ["#AI"], disclosureText: "Prepared by agents." }),
    }), { params: { id: "draft_1" } });

    expect(response.status).toBe(200);
    expect(draftUpdateMock).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: expect.objectContaining({
        status: "NEEDS_REVIEW",
        title: "Updated",
        hook: "Hook",
        body: "Body",
        hashtags: ["#AI"],
        disclosureText: "Prepared by agents.",
        approvedAt: null,
        publishError: null,
        privacyReview: expect.objectContaining({
          status: "NEEDS_REVIEW",
          warnings: expect.arrayContaining(["Draft was edited after review and must be re-reviewed before publishing."]),
        }),
      }),
    });
  });
});
