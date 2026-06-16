import { beforeEach, describe, expect, it, vi } from "vitest";
import { rollbackSearchProfileChange } from "@/lib/agents/recruiting-search-optimization";
import { requireSingleUser } from "@/lib/auth/single-user";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/auth/single-user", () => ({
  requireSingleUser: vi.fn(),
}));

vi.mock("@/lib/agents/recruiting-search-optimization", () => ({
  rollbackSearchProfileChange: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    searchProfileChange: {
      findFirst: vi.fn(),
    },
  },
}));

const requireSingleUserMock = vi.mocked(requireSingleUser);
const rollbackMock = vi.mocked(rollbackSearchProfileChange);
const findFirstMock = vi.mocked(prisma.searchProfileChange.findFirst);

describe("POST /api/search-optimization/changes/[id]/rollback", () => {
  beforeEach(() => {
    requireSingleUserMock.mockReset();
    rollbackMock.mockReset();
    findFirstMock.mockReset();
    requireSingleUserMock.mockResolvedValue({ id: "user_1", email: "person@example.com", name: null, createdAt: new Date(), updatedAt: new Date() });
    findFirstMock.mockResolvedValue({ id: "change_1" } as never);
    rollbackMock.mockResolvedValue({ id: "change_1", status: "ROLLED_BACK" } as never);
  });

  it("rolls back a change owned by the protected user", async () => {
    const response = await POST(new Request("http://localhost/api/search-optimization/changes/change_1/rollback", { method: "POST" }), { params: { id: "change_1" } });

    expect(response.status).toBe(200);
    expect(findFirstMock).toHaveBeenCalledWith({ where: { id: "change_1", userId: "user_1" }, select: { id: true } });
    expect(rollbackMock).toHaveBeenCalledWith("change_1");
  });

  it("404s when the change is not owned by the user", async () => {
    findFirstMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/search-optimization/changes/change_1/rollback", { method: "POST" }), { params: { id: "change_1" } });

    expect(response.status).toBe(404);
    expect(rollbackMock).not.toHaveBeenCalled();
  });
});
