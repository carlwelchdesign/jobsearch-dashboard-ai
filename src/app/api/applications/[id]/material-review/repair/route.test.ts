import { beforeEach, describe, expect, it, vi } from "vitest";
import { repairApplicationMaterialIssue } from "@/lib/applications/material-quality-repair";
import { reconcileApplicationCanonicalState } from "@/lib/applications/reconciliation";
import { POST } from "./route";

vi.mock("@/lib/applications/material-quality-repair", () => ({
  repairApplicationMaterialIssue: vi.fn(),
}));

vi.mock("@/lib/applications/reconciliation", () => ({
  reconcileApplicationCanonicalState: vi.fn(),
}));

const repairMock = vi.mocked(repairApplicationMaterialIssue);
const reconcileMock = vi.mocked(reconcileApplicationCanonicalState);

describe("POST /api/applications/[id]/material-review/repair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reconcileMock.mockResolvedValue(undefined as never);
  });

  it("returns a repaired result when agents move the application to ready", async () => {
    repairMock.mockResolvedValue({
      applicationId: "app_1",
      jobPostingId: "job_1",
      status: "repaired",
      attemptedRepair: true,
      movedToReady: true,
      resumeId: "resume_1",
      coverLetterId: "letter_1",
      materialQuality: null,
      reason: "Agents repaired the application materials and moved this application to Ready to apply.",
      recommendation: "Open this application in Apply Sprint.",
    });

    const response = await POST(new Request("http://localhost/api/applications/app_1/material-review/repair"), {
      params: { id: "app_1" },
    });

    expect(response.status).toBe(200);
    expect(repairMock).toHaveBeenCalledWith("app_1");
    expect(reconcileMock).toHaveBeenCalledWith({ applicationId: "app_1", source: "application_material_issue_repair" });
    await expect(response.json()).resolves.toMatchObject({
      status: "repaired",
      movedToReady: true,
      message: "Agents fixed the material issue. Moved to Ready to apply.",
    });
  });

  it("returns a blocked result when agents cannot safely repair", async () => {
    repairMock.mockResolvedValue({
      applicationId: "app_1",
      jobPostingId: "job_1",
      status: "blocked",
      attemptedRepair: false,
      movedToReady: false,
      resumeId: "resume_1",
      coverLetterId: "letter_1",
      materialQuality: null,
      remainingReasons: ["openai_not_configured"],
      remainingUnsupportedClaims: [],
      reason: "Application QA found unsupported claims.",
      recommendation: "Agents found unsupported claims. Update the evidence or regenerate materials from verified facts before moving this application forward.",
    });

    const response = await POST(new Request("http://localhost/api/applications/app_1/material-review/repair"), {
      params: { id: "app_1" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "blocked",
      message: expect.stringContaining("Agents could not start repair."),
    });
  });

  it("returns post-repair QA details when an attempted repair remains blocked", async () => {
    repairMock.mockResolvedValue({
      applicationId: "app_1",
      jobPostingId: "job_1",
      status: "blocked",
      attemptedRepair: true,
      movedToReady: false,
      resumeId: "resume_2",
      coverLetterId: "letter_2",
      previousMaterialQuality: null,
      materialQuality: null,
      remainingReasons: ["unsupported_claims_detected", "application_qa_needs_review"],
      remainingUnsupportedClaims: ["Claimed direct Mistral production experience without evidence."],
      reason: "Application QA found unsupported claims.",
      recommendation: "Agents rewrote from verified evidence, but Application QA still found unsupported claims.",
    });

    const response = await POST(new Request("http://localhost/api/applications/app_1/material-review/repair"), {
      params: { id: "app_1" },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      status: "blocked",
      attemptedRepair: true,
      message: expect.stringContaining("Agents rewrote the materials, but QA still found issues."),
    });
    expect(payload.message).toContain("Claimed direct Mistral production experience without evidence.");
  });
});
