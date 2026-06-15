import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSystemArchitectureAgent } from "@/lib/agents/system-architecture";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";

vi.mock("@/lib/agents/system-architecture", () => ({
  runSystemArchitectureAgent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentRun: {
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
  },
}));

const runSystemArchitectureAgentMock = vi.mocked(runSystemArchitectureAgent);
const agentRunFindFirstMock = vi.mocked(prisma.agentRun.findFirst);
const userFindFirstMock = vi.mocked(prisma.user.findFirst);

describe("/api/architecture", () => {
  beforeEach(() => {
    runSystemArchitectureAgentMock.mockReset();
    agentRunFindFirstMock.mockReset();
    userFindFirstMock.mockReset();
  });

  it("returns the latest completed architecture run", async () => {
    agentRunFindFirstMock.mockResolvedValue({ id: "run_1", agentType: "SYSTEM_ARCHITECTURE", status: "COMPLETED" } as never);

    const response = await GET();

    expect(agentRunFindFirstMock).toHaveBeenCalledWith({
      where: { agentType: "SYSTEM_ARCHITECTURE", status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    });
    await expect(response.json()).resolves.toMatchObject({ latestRun: { id: "run_1" } });
  });

  it("refreshes the architecture report for the first user", async () => {
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    runSystemArchitectureAgentMock.mockResolvedValue({
      run: { id: "run_2", agentType: "SYSTEM_ARCHITECTURE", status: "COMPLETED" },
      output: { title: "System Architecture Report" },
    } as Awaited<ReturnType<typeof runSystemArchitectureAgent>>);

    const response = await POST();

    expect(runSystemArchitectureAgentMock).toHaveBeenCalledWith({ userId: "user_1", source: "dashboard" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ message: "System architecture report refreshed.", run: { id: "run_2" } });
  });
});
