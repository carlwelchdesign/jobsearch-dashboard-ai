import { beforeEach, describe, expect, it, vi } from "vitest";
import { repairApplicationMaterials } from "@/lib/applications/material-quality-repair";
import { syncApplicationPacket } from "@/lib/applications/application-packets";
import { transitionApplicationState } from "@/lib/applications/state-transitions";
import { syncMaterialClaimsForCoverLetter } from "@/lib/trust/material-claims";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    generatedCoverLetter: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/applications/application-packets", () => ({
  syncApplicationPacket: vi.fn(),
}));

vi.mock("@/lib/applications/prepare-package", () => ({
  prepareApplicationPackage: vi.fn(),
}));

vi.mock("@/lib/applications/state-transitions", () => ({
  transitionApplicationState: vi.fn(),
}));

vi.mock("@/lib/trust/material-claims", () => ({
  syncMaterialClaimsForCoverLetter: vi.fn(),
}));

const findCoverLettersMock = vi.mocked(prisma.generatedCoverLetter.findMany);
const updateCoverLetterMock = vi.mocked(prisma.generatedCoverLetter.update);
const transitionMock = vi.mocked(transitionApplicationState);
const syncPacketMock = vi.mocked(syncApplicationPacket);
const syncClaimsMock = vi.mocked(syncMaterialClaimsForCoverLetter);

describe("repairApplicationMaterials", () => {
  beforeEach(() => {
    findCoverLettersMock.mockReset();
    updateCoverLetterMock.mockReset();
    transitionMock.mockReset();
    syncPacketMock.mockReset();
    syncClaimsMock.mockReset();
  });

  it("dry-runs weak deterministic fallback cover letters without mutation", async () => {
    findCoverLettersMock.mockResolvedValue([weakCoverLetter()] as Awaited<ReturnType<typeof prisma.generatedCoverLetter.findMany>>);

    const result = await repairApplicationMaterials();

    expect(result.mode).toBe("dry-run");
    expect(result.scanned).toBe(1);
    expect(result.blocked).toBe(1);
    expect(result.applicationsMoved).toBe(0);
    expect(result.samples[0]).toMatchObject({
      coverLetterId: "letter_1",
      launchable: false,
    });
    expect(updateCoverLetterMock).not.toHaveBeenCalled();
    expect(transitionMock).not.toHaveBeenCalled();
  });

  it("marks weak letters and moves ready applications back to approved in apply mode", async () => {
    findCoverLettersMock.mockResolvedValue([weakCoverLetter()] as Awaited<ReturnType<typeof prisma.generatedCoverLetter.findMany>>);

    const result = await repairApplicationMaterials({ mode: "apply" });

    expect(result.updated).toBe(1);
    expect(result.applicationsMoved).toBe(1);
    expect(updateCoverLetterMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "letter_1" },
      data: expect.objectContaining({
        generationNotes: expect.objectContaining({
          materialQuality: expect.objectContaining({
            launchable: false,
            status: "BLOCKED",
          }),
        }),
      }),
    }));
    expect(transitionMock).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: "app_1",
      toStatus: "approved",
      source: "application_material_quality_repair",
    }));
    expect(syncPacketMock).toHaveBeenCalledWith("app_1");
    expect(syncClaimsMock).toHaveBeenCalledWith("letter_1");
  });
});

function weakCoverLetter() {
  return {
    id: "letter_1",
    userId: "user_1",
    jobPostingId: "job_1",
    jobProfileMatchId: "match_1",
    body: "Dear Linear hiring team,\n\nI am interested in the Product Engineer role.\n\nRelevant examples from my approved profile include: unrelated AR work.\n\nOne relevant example is my Agentic job search assistant.\n\nI would welcome a conversation about how this experience maps to Linear's needs for this role.\n\nBest,\nCarl Welch",
    version: 1,
    generationNotes: {
      generatedBy: "deterministic_fallback",
      applicationQa: { status: "NEEDS_REVIEW", score: 74, evidenceRefs: [] },
    },
    createdAt: new Date("2026-06-16T00:00:00.000Z"),
    updatedAt: new Date("2026-06-16T00:00:00.000Z"),
    jobPosting: {
      id: "job_1",
      company: "Linear",
      title: "Product Engineer",
      applicationUrl: "https://linear.app/apply",
    },
    applications: [
      { id: "app_1", status: "ready_to_apply", notes: null },
    ],
  };
}
