import { beforeEach, describe, expect, it, vi } from "vitest";
import { regenerateLinkedInDraftVisuals } from "@/lib/agents/linkedin-content";
import { POST } from "./route";

vi.mock("@/lib/agents/linkedin-content", () => ({
  regenerateLinkedInDraftVisuals: vi.fn(),
}));

const regenerateMock = vi.mocked(regenerateLinkedInDraftVisuals);

describe("/api/linkedin-content/drafts/[id]/visuals/regenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    regenerateMock.mockResolvedValue({ id: "draft_1", selectedScreenshots: [{ label: "Fresh visual" }] } as never);
  });

  it("regenerates visuals for a draft from a replacement direction", async () => {
    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts/draft_1/visuals/regenerate", {
      method: "POST",
      body: JSON.stringify({ visualDirection: "Show the pipeline dashboard instead of a diagram." }),
    }), { params: { id: "draft_1" } });

    expect(response.status).toBe(200);
    expect(regenerateMock).toHaveBeenCalledWith({
      draftId: "draft_1",
      visualDirection: "Show the pipeline dashboard instead of a diagram.",
    });
    await expect(response.json()).resolves.toMatchObject({
      message: "LinkedIn draft visuals regenerated.",
      draft: { id: "draft_1" },
    });
  });

  it("requires a visual direction", async () => {
    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts/draft_1/visuals/regenerate", {
      method: "POST",
      body: JSON.stringify({ visualDirection: "" }),
    }), { params: { id: "draft_1" } });

    expect(response.status).toBe(400);
    expect(regenerateMock).not.toHaveBeenCalled();
  });
});
