import { mkdir, writeFile } from "fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    linkedInPostDraft: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const draftFindUniqueMock = vi.mocked(prisma.linkedInPostDraft.findUnique);
const draftUpdateMock = vi.mocked(prisma.linkedInPostDraft.update);
const mkdirMock = vi.mocked(mkdir);
const writeFileMock = vi.mocked(writeFile);

describe("/api/linkedin-content/drafts/[id]/visuals/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    draftFindUniqueMock.mockResolvedValue({
      id: "draft_1",
      status: "DRAFT",
      screenshotAssets: [{ label: "Generated", path: "/generated/linkedin-content/generated.png", description: "Generated visual", route: "/dashboard", privacyStatus: "PASS", warnings: [] }],
    } as never);
    draftUpdateMock.mockResolvedValue({ id: "draft_1", selectedScreenshots: [] } as never);
  });

  it("saves a valid uploaded image and makes it the selected screenshot", async () => {
    const formData = new FormData();
    formData.set("file", new File([new Uint8Array([1, 2, 3])], "dashboard.png", { type: "image/png" }));
    formData.set("label", "Dashboard replacement");

    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts/draft_1/visuals/upload", {
      method: "POST",
      body: formData,
    }), { params: { id: "draft_1" } });

    expect(response.status).toBe(200);
    expect(mkdirMock).toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalled();
    expect(draftUpdateMock).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: expect.objectContaining({
        publishError: null,
        selectedScreenshots: [expect.objectContaining({
          label: "Dashboard replacement",
          path: expect.stringContaining("/generated/linkedin-content/user-upload-draft_1-"),
          mimeType: "image/png",
          assetType: "screenshot",
          privacyStatus: "PASS",
          provenance: ["User uploaded replacement screenshot"],
          warnings: [],
        })],
        screenshotAssets: expect.arrayContaining([
          expect.objectContaining({ label: "Generated" }),
          expect.objectContaining({ label: "Dashboard replacement" }),
        ]),
      }),
    });
  });

  it("rejects unsupported files", async () => {
    const formData = new FormData();
    formData.set("file", new File(["not image"], "notes.txt", { type: "text/plain" }));

    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts/draft_1/visuals/upload", {
      method: "POST",
      body: formData,
    }), { params: { id: "draft_1" } });

    expect(response.status).toBe(400);
    expect(draftUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects files over 10MB", async () => {
    const formData = new FormData();
    formData.set("file", new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }));

    const response = await POST(new Request("http://localhost/api/linkedin-content/drafts/draft_1/visuals/upload", {
      method: "POST",
      body: formData,
    }), { params: { id: "draft_1" } });

    expect(response.status).toBe(400);
    expect(draftUpdateMock).not.toHaveBeenCalled();
  });
});
