import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/jolene/route";
import { requireSingleUser } from "@/lib/auth/single-user";
import { loadJoleneConversation, sendJoleneMessage } from "@/lib/jolene/chat";

vi.mock("@/lib/auth/single-user", () => ({
  requireSingleUser: vi.fn(),
}));

vi.mock("@/lib/jolene/chat", () => ({
  loadJoleneConversation: vi.fn(),
  normalizeContextPath: vi.fn((value: string) => value.split("?")[0] || "/dashboard"),
  sendJoleneMessage: vi.fn(),
}));

const requireSingleUserMock = vi.mocked(requireSingleUser);
const loadJoleneConversationMock = vi.mocked(loadJoleneConversation);
const sendJoleneMessageMock = vi.mocked(sendJoleneMessage);

describe("/api/jolene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSingleUserMock.mockResolvedValue({ id: "user_1" } as never);
    loadJoleneConversationMock.mockResolvedValue({
      conversation: { id: "conversation_1", contextPath: "/dashboard", title: "Jolene" },
      context: { routeType: "dashboard", summary: "Dashboard", suggestedActions: [] },
      messages: [],
    } as never);
    sendJoleneMessageMock.mockResolvedValue({
      conversation: { id: "conversation_1", contextPath: "/dashboard", title: "Jolene" },
      context: { routeType: "dashboard", summary: "Dashboard", suggestedActions: [] },
      messages: [{ id: "assistant_1", role: "ASSISTANT", content: "Done.", actionJson: {}, createdAt: "2026-06-17T12:00:00.000Z" }],
      clientAction: null,
    } as never);
  });

  it("loads the shared Jolene conversation payload", async () => {
    const response = await GET(new Request("http://localhost/api/jolene?contextPath=/jobs?x=1") as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.conversation.id).toBe("conversation_1");
    expect(requireSingleUserMock).toHaveBeenCalledWith(expect.any(Request), { allowMultipleUsers: true });
    expect(loadJoleneConversationMock).toHaveBeenCalledWith({ userId: "user_1", contextPath: "/jobs" });
  });

  it("delegates POST messages to the shared Jolene chat service", async () => {
    const response = await POST(new Request("http://localhost/api/jolene", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "What now?", contextPath: "/dashboard" }),
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.messages[0].content).toBe("Done.");
    expect(sendJoleneMessageMock).toHaveBeenCalledWith({
      userId: "user_1",
      message: "What now?",
      contextPath: "/dashboard",
    });
  });

  it("returns a setup error when no app user exists", async () => {
    requireSingleUserMock.mockRejectedValue(new Error("No user exists. Run seed first."));

    const response = await POST(new Request("http://localhost/api/jolene", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "What now?", contextPath: "/dashboard" }),
    }) as never);

    await expect(response.json()).resolves.toEqual({ error: "No user exists. Run seed first." });
    expect(response.status).toBe(400);
    expect(sendJoleneMessageMock).not.toHaveBeenCalled();
  });
});
