import { beforeEach, describe, expect, it, vi } from "vitest";
import { repairApplicationMaterialIssue, repairApplicationMaterials } from "@/lib/applications/material-quality-repair";
import { prepareApplicationPackage } from "@/lib/applications/prepare-package";
import { syncApplicationPacket } from "@/lib/applications/application-packets";
import { transitionApplicationState } from "@/lib/applications/state-transitions";
import { syncMaterialClaimsForCoverLetter } from "@/lib/trust/material-claims";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      findUnique: vi.fn(),
    },
    applicationEvent: {
      create: vi.fn(),
    },
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
const findApplicationMock = vi.mocked(prisma.application.findUnique);
const createEventMock = vi.mocked(prisma.applicationEvent.create);
const updateCoverLetterMock = vi.mocked(prisma.generatedCoverLetter.update);
const preparePackageMock = vi.mocked(prepareApplicationPackage);
const transitionMock = vi.mocked(transitionApplicationState);
const syncPacketMock = vi.mocked(syncApplicationPacket);
const syncClaimsMock = vi.mocked(syncMaterialClaimsForCoverLetter);

describe("repairApplicationMaterials", () => {
  beforeEach(() => {
    findCoverLettersMock.mockReset();
    findApplicationMock.mockReset();
    createEventMock.mockReset();
    updateCoverLetterMock.mockReset();
    preparePackageMock.mockReset();
    transitionMock.mockReset();
    syncPacketMock.mockReset();
    syncClaimsMock.mockReset();
    createEventMock.mockResolvedValue({ id: "event_1" } as never);
    syncPacketMock.mockResolvedValue({ id: "packet_1" } as never);
    syncClaimsMock.mockResolvedValue([]);
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

  it("repairs a QA-needs-review application through the agent package pipeline", async () => {
    findApplicationMock.mockResolvedValue(applicationForRepair({
      materialQuality: {
        status: "NEEDS_REVIEW",
        launchable: false,
        reason: "Application QA marked the generated materials as needing review.",
        reasons: ["application_qa_needs_review"],
        score: 76,
        generatedBy: "openai_structured",
        evidenceRefs: [],
      },
    }) as never);
    preparePackageMock.mockResolvedValue(readyPackage() as never);

    const result = await repairApplicationMaterialIssue("app_1");

    expect(preparePackageMock).toHaveBeenCalledWith("job_1", {
      regenerateResume: false,
      regenerateCoverLetter: true,
      repairContext: expect.objectContaining({
        reasons: ["application_qa_needs_review"],
      }),
    });
    expect(result).toMatchObject({
      status: "repaired",
      movedToReady: true,
      attemptedRepair: true,
    });
    expect(createEventMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        applicationId: "app_1",
        source: "application_material_issue_repair",
      }),
    }));
    expect(syncPacketMock).toHaveBeenCalledWith("app_1");
  });

  it("repairs unsupported claim blockers through evidence-grounded regeneration", async () => {
    findApplicationMock.mockResolvedValue(applicationForRepair({
      materialQuality: {
        status: "BLOCKED",
        launchable: false,
        reason: "Application QA found unsupported claims.",
        reasons: ["unsupported_claims_detected"],
        score: 65,
        generatedBy: "openai_structured",
        evidenceRefs: [],
      },
    }) as never);
    preparePackageMock.mockResolvedValue(readyPackage() as never);

    const result = await repairApplicationMaterialIssue("app_1");

    expect(preparePackageMock).toHaveBeenCalledWith("job_1", {
      regenerateResume: false,
      regenerateCoverLetter: true,
      repairContext: expect.objectContaining({
        reasons: ["unsupported_claims_detected"],
        previousMaterialQuality: expect.objectContaining({
          reason: "Application QA found unsupported claims.",
        }),
        instructions: expect.arrayContaining([
          expect.stringContaining("Eliminate unsupported claims"),
        ]),
      }),
    });
    expect(result).toMatchObject({
      status: "repaired",
      attemptedRepair: true,
      movedToReady: true,
    });
  });

  it("reports remaining unsupported claims after a failed repair attempt", async () => {
    findApplicationMock.mockResolvedValue(applicationForRepair({
      materialQuality: {
        status: "BLOCKED",
        launchable: false,
        reason: "Application QA found unsupported claims.",
        reasons: ["unsupported_claims_detected"],
        score: 65,
        generatedBy: "openai_structured",
        evidenceRefs: [],
      },
    }) as never);
    preparePackageMock.mockResolvedValue(blockedPackage() as never);

    const result = await repairApplicationMaterialIssue("app_1");

    expect(result).toMatchObject({
      status: "blocked",
      attemptedRepair: true,
      movedToReady: false,
      remainingReasons: ["unsupported_claims_detected", "application_qa_needs_review"],
      remainingUnsupportedClaims: ["Claimed direct Mistral production experience without evidence."],
    });
    expect(result.recommendation).toContain("still found unsupported claims");
  });

  it("keeps provider configuration blockers out of automatic repair", async () => {
    findApplicationMock.mockResolvedValue(applicationForRepair({
      materialQuality: {
        status: "BLOCKED",
        launchable: false,
        reason: "OpenAI is not configured.",
        reasons: ["openai_not_configured"],
        score: 0,
        generatedBy: "deterministic_fallback",
        evidenceRefs: [],
      },
    }) as never);

    const result = await repairApplicationMaterialIssue("app_1");

    expect(preparePackageMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "blocked",
      attemptedRepair: false,
    });
    expect(result.recommendation).toContain("OpenAI is not configured");
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

function applicationForRepair({ materialQuality }: { materialQuality: Record<string, unknown> }) {
  return {
    id: "app_1",
    userId: "user_1",
    jobPostingId: "job_1",
    resumeId: "resume_1",
    coverLetterId: "letter_1",
    jobPosting: {
      id: "job_1",
      company: "Linear",
      title: "Product Engineer",
      applicationUrl: "https://linear.app/apply",
    },
    resume: { id: "resume_1" },
    coverLetter: {
      id: "letter_1",
      generationNotes: {
        generatedBy: "openai_structured",
        materialQuality,
      },
    },
  };
}

function readyPackage() {
  return {
    application: { id: "app_1" },
    resume: { id: "resume_new" },
    coverLetter: { id: "letter_new" },
    readyToApply: true,
    materialQuality: {
      status: "PASS",
      launchable: true,
      reason: "Cover letter passed material quality review.",
      reasons: [],
      score: 92,
      generatedBy: "openai_structured",
      evidenceRefs: ["evidence_1"],
    },
  };
}

function blockedPackage() {
  return {
    application: { id: "app_1" },
    resume: { id: "resume_new" },
    coverLetter: {
      id: "letter_new",
      generationNotes: {
        applicationQa: {
          unsupportedClaims: ["Claimed direct Mistral production experience without evidence."],
        },
      },
    },
    readyToApply: false,
    materialQuality: {
      status: "BLOCKED",
      launchable: false,
      reason: "Application QA found unsupported claims.",
      reasons: ["unsupported_claims_detected", "application_qa_needs_review"],
      score: 62,
      generatedBy: "openai_structured",
      evidenceRefs: ["evidence_1"],
    },
  };
}
