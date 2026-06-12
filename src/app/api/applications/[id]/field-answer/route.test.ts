import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveApplicationFieldAnswer } from "@/lib/applications/field-answer-resolver";
import { POST } from "./route";

vi.mock("@/lib/applications/field-answer-resolver", () => ({
  resolveApplicationFieldAnswer: vi.fn(),
}));

const resolveMock = vi.mocked(resolveApplicationFieldAnswer);

describe("POST /api/applications/[id]/field-answer", () => {
  beforeEach(() => {
    resolveMock.mockReset();
    delete process.env.BROWSER_EXTENSION_TOKEN;
    resolveMock.mockResolvedValue({
      answer: "Generated answer.",
      confidence: 88,
      sensitivity: "MEDIUM",
      source: "generated",
      autoFillAllowed: true,
      reason: "Generated from application context.",
      generatedBy: "openai_structured_outputs",
    });
  });

  afterEach(() => {
    delete process.env.BROWSER_EXTENSION_TOKEN;
  });

  it("returns field answer resolution metadata", async () => {
    const response = await POST(new Request("http://localhost/api/applications/app_1/field-answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "Describe a complex frontend project.",
        inputType: "textarea",
        category: "custom",
        selector: "textarea#project",
      }),
    }), { params: { id: "app_1" } });

    expect(resolveMock).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: "app_1",
      field: expect.objectContaining({
        label: "Describe a complex frontend project.",
        inputType: "textarea",
        category: "custom",
        selector: "textarea#project",
      }),
    }));
    await expect(response.json()).resolves.toMatchObject({
      answer: "Generated answer.",
      source: "generated",
      autoFillAllowed: true,
    });
  });

  it("enforces browser extension token when configured", async () => {
    process.env.BROWSER_EXTENSION_TOKEN = "secret";

    const response = await POST(new Request("http://localhost/api/applications/app_1/field-answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Describe a project.", inputType: "textarea" }),
    }), { params: { id: "app_1" } });

    expect(response.status).toBe(401);
    expect(resolveMock).not.toHaveBeenCalled();
  });
});
