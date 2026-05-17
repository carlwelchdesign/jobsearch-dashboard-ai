import { afterEach, describe, expect, it } from "vitest";
import { isLocalAssistantRequest } from "@/lib/applications/local-assistant-origin";

describe("isLocalAssistantRequest", () => {
  const originalFlag = process.env.ENABLE_LOCAL_ASSISTANT;

  afterEach(() => {
    process.env.ENABLE_LOCAL_ASSISTANT = originalFlag;
  });

  it("allows common local development hosts", () => {
    expect(isLocalAssistantRequest(new URL("http://localhost:3000/applications/assistant"))).toBe(true);
    expect(isLocalAssistantRequest(new URL("http://127.0.0.1:3000/applications/assistant"))).toBe(true);
    expect(isLocalAssistantRequest(new URL("http://0.0.0.0:3000/applications/assistant"))).toBe(true);
    expect(isLocalAssistantRequest(new URL("http://[::1]:3000/applications/assistant"))).toBe(true);
  });

  it("rejects non-local hosts unless explicitly enabled", () => {
    process.env.ENABLE_LOCAL_ASSISTANT = "false";
    expect(isLocalAssistantRequest(new URL("https://example.com/applications/assistant"))).toBe(false);

    process.env.ENABLE_LOCAL_ASSISTANT = "true";
    expect(isLocalAssistantRequest(new URL("https://example.com/applications/assistant"))).toBe(true);
  });
});
