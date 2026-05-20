import { beforeEach, describe, expect, it, vi } from "vitest";
import { inferCustomOpportunityDetails } from "@/lib/resumes/custom-opportunity";
import { POST } from "./route";

vi.mock("@/lib/resumes/custom-opportunity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/resumes/custom-opportunity")>();
  return {
    ...actual,
    inferCustomOpportunityDetails: vi.fn(),
  };
});

const inferMock = vi.mocked(inferCustomOpportunityDetails);

describe("POST /api/resumes/custom-opportunity/infer", () => {
  beforeEach(() => {
    inferMock.mockReset();
  });

  it("returns inferred opportunity details", async () => {
    inferMock.mockResolvedValue({
      company: "Acme",
      title: "Senior Frontend Engineer",
      location: "Remote US",
      remoteType: "remote",
      applicationUrl: "https://acme.example/jobs/123",
    });

    const response = await POST(new Request("http://localhost/api/resumes/custom-opportunity/infer", {
      method: "POST",
      body: JSON.stringify({ description: "Recruiter note for a Senior Frontend Engineer role at Acme. Remote US. https://acme.example/jobs/123" }),
    }));

    expect(response.status).toBe(200);
    expect(inferMock).toHaveBeenCalledWith(expect.stringContaining("Senior Frontend Engineer"));
    await expect(response.json()).resolves.toMatchObject({
      details: {
        company: "Acme",
        title: "Senior Frontend Engineer",
        remoteType: "remote",
      },
    });
  });

  it("rejects too-short descriptions", async () => {
    const response = await POST(new Request("http://localhost/api/resumes/custom-opportunity/infer", {
      method: "POST",
      body: JSON.stringify({ description: "too short" }),
    }));

    expect(response.status).toBe(400);
    expect(inferMock).not.toHaveBeenCalled();
  });
});
