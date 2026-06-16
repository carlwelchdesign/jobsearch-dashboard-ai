import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { requireSingleUser } from "@/lib/auth/single-user";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

const userCountMock = vi.mocked(prisma.user.count);
const userFindFirstMock = vi.mocked(prisma.user.findFirst);
const userFindUniqueMock = vi.mocked(prisma.user.findUnique);

describe("requireSingleUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("JOB_SEARCH_OS_USER_ID", "");
    vi.stubEnv("SEED_USER_EMAIL", "");
    userCountMock.mockResolvedValue(1);
    userFindFirstMock.mockResolvedValue({ id: "user_1", email: "person@example.com" } as never);
    userFindUniqueMock.mockResolvedValue({ id: "user_1", email: "person@example.com" } as never);
  });

  it("uses the configured protected user email when present", async () => {
    vi.stubEnv("SEED_USER_EMAIL", "person@example.com");

    const user = await requireSingleUser();

    expect(user.id).toBe("user_1");
    expect(userFindUniqueMock).toHaveBeenCalledWith({ where: { email: "person@example.com" } });
    expect(userCountMock).not.toHaveBeenCalled();
  });

  it("rejects requests for a different user id", async () => {
    vi.stubEnv("JOB_SEARCH_OS_USER_ID", "user_1");

    await expect(requireSingleUser(new Request("http://localhost/api", {
      headers: { "x-job-search-os-user-id": "user_2" },
    }))).rejects.toThrow("Request user does not match the protected Job Search OS user.");
  });

  it("requires an explicit protected user when multiple users exist", async () => {
    userCountMock.mockResolvedValue(2);

    await expect(requireSingleUser()).rejects.toThrow("Set JOB_SEARCH_OS_USER_ID or SEED_USER_EMAIL");
  });
});
