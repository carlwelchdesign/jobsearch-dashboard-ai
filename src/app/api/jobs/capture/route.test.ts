import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureManualJob } from "@/lib/jobs/manual-capture";
import { POST } from "./route";

vi.mock("@/lib/jobs/manual-capture", () => ({
  captureManualJob: vi.fn(),
}));

const captureManualJobMock = vi.mocked(captureManualJob);

describe("/api/jobs/capture", () => {
  beforeEach(() => {
    captureManualJobMock.mockReset();
    vi.unstubAllEnvs();
  });

  it("captures a browser job payload through the manual capture service", async () => {
    captureManualJobMock.mockResolvedValue({
      job: { id: "job_1", company: "Acme", title: "Senior Frontend Engineer" },
      matches: [],
      created: true,
    } as unknown as Awaited<ReturnType<typeof captureManualJob>>);

    const response = await POST(new Request("http://localhost/api/jobs/capture", {
      method: "POST",
      body: JSON.stringify({
        pageUrl: "https://acme.example/jobs/123",
        pageTitle: "Senior Frontend Engineer | Acme",
        company: "Acme",
        selectedText: "React TypeScript product UI role.",
      }),
    }));

    expect(captureManualJobMock).toHaveBeenCalledWith(expect.objectContaining({
      company: "Acme",
      title: "Senior Frontend Engineer",
      description: "React TypeScript product UI role.",
      pageUrl: "https://acme.example/jobs/123",
      sourceName: "Chrome Capture",
    }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      job: { id: "job_1" },
      message: "Captured job from browser.",
    });
  });

  it("returns a validation error for invalid URLs", async () => {
    const response = await POST(new Request("http://localhost/api/jobs/capture", {
      method: "POST",
      body: JSON.stringify({
        pageUrl: "not-a-url",
      }),
    }));

    expect(response.status).toBe(400);
    expect(captureManualJobMock).not.toHaveBeenCalled();
  });

  it("requires the optional browser extension token when configured", async () => {
    vi.stubEnv("BROWSER_EXTENSION_TOKEN", "local-token");

    const response = await POST(new Request("http://localhost/api/jobs/capture", {
      method: "POST",
      body: JSON.stringify({
        pageUrl: "https://acme.example/jobs/123",
      }),
    }));

    expect(response.status).toBe(401);
    expect(captureManualJobMock).not.toHaveBeenCalled();
  });
});
