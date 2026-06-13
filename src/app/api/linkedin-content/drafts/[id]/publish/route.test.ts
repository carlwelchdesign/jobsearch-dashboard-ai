import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishLinkedInDraft } from "@/lib/linkedin/share";
import { POST } from "./route";

vi.mock("@/lib/linkedin/share", () => ({
  publishLinkedInDraft: vi.fn(),
}));

const publishMock = vi.mocked(publishLinkedInDraft);

describe("/api/linkedin-content/drafts/[id]/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publishMock.mockResolvedValue({ id: "draft_1", status: "PUBLISHED" } as never);
  });

  it("retries publishing an approved draft", async () => {
    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts/draft_1/publish", { method: "POST" }), { params: { id: "draft_1" } });

    expect(publishMock).toHaveBeenCalledWith("draft_1");
    expect(response.status).toBe(200);
  });
});
