import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAgentUserRequest } from "@/lib/agent-user-requests";
import { POST } from "./route";

vi.mock("@/lib/agent-user-requests", () => ({
  resolveAgentUserRequest: vi.fn(),
}));

const resolveAgentUserRequestMock = vi.mocked(resolveAgentUserRequest);

describe("POST /api/agent-user-requests/[id]/resolve", () => {
  beforeEach(() => {
    resolveAgentUserRequestMock.mockReset();
  });

  it("resolves an agent user request", async () => {
    resolveAgentUserRequestMock.mockResolvedValue({
      id: "request_1",
      status: "RESOLVED",
    } as Awaited<ReturnType<typeof resolveAgentUserRequest>>);

    const response = await POST(new Request("http://localhost/api/agent-user-requests/request_1/resolve", {
      method: "POST",
      body: JSON.stringify({ status: "RESOLVED" }),
    }), {
      params: { id: "request_1" },
    });

    expect(resolveAgentUserRequestMock).toHaveBeenCalledWith({
      id: "request_1",
      status: "RESOLVED",
      answer: undefined,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "request_1",
      status: "RESOLVED",
      message: "Request resolved.",
    });
  });

  it("saves an answer when supplied", async () => {
    resolveAgentUserRequestMock.mockResolvedValue({
      id: "request_1",
      status: "ANSWERED",
    } as Awaited<ReturnType<typeof resolveAgentUserRequest>>);

    const response = await POST(new Request("http://localhost/api/agent-user-requests/request_1/resolve", {
      method: "POST",
      body: JSON.stringify({ status: "ANSWERED", answer: "I need sponsorship now." }),
    }), {
      params: { id: "request_1" },
    });

    expect(resolveAgentUserRequestMock).toHaveBeenCalledWith({
      id: "request_1",
      status: "ANSWERED",
      answer: "I need sponsorship now.",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ANSWERED",
      message: "Answer saved.",
    });
  });

  it("rejects invalid statuses", async () => {
    const response = await POST(new Request("http://localhost/api/agent-user-requests/request_1/resolve", {
      method: "POST",
      body: JSON.stringify({ status: "OPEN" }),
    }), {
      params: { id: "request_1" },
    });

    expect(resolveAgentUserRequestMock).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });
});
