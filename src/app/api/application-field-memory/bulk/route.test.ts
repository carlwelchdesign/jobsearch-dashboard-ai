import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { PATCH } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    applicationFieldMemory: {
      updateMany: vi.fn(),
    },
  },
}));

const updateManyMock = vi.mocked(prisma.applicationFieldMemory.updateMany);

describe("PATCH /api/application-field-memory/bulk", () => {
  beforeEach(() => {
    updateManyMock.mockReset();
  });

  it("approves only safe review memories", async () => {
    updateManyMock.mockResolvedValue({ count: 2 });

    const response = await PATCH(new Request("http://localhost/api/application-field-memory/bulk", {
      method: "PATCH",
      body: JSON.stringify({ action: "approve", memoryIds: ["memory_1", "memory_2"] }),
    }));

    expect(response.status).toBe(200);
    expect(updateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ["memory_1", "memory_2"] },
        status: "NEEDS_REVIEW",
        sensitivity: { in: ["LOW", "MEDIUM"] },
      }),
      data: expect.objectContaining({
        status: "ACTIVE",
        reusePolicy: "AUTO_USE",
      }),
    }));
    await expect(response.json()).resolves.toMatchObject({ updated: 2 });
  });
});
