import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareApplicationPackage } from "@/lib/applications/prepare-package";
import { syncApplicationPacket } from "@/lib/applications/application-packets";
import { reconcileApplicationCanonicalState } from "@/lib/applications/reconciliation";
import { transitionApplicationState } from "@/lib/applications/state-transitions";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/applications/prepare-package", () => ({
  prepareApplicationPackage: vi.fn(),
}));

vi.mock("@/lib/applications/application-packets", () => ({
  syncApplicationPacket: vi.fn(),
}));

vi.mock("@/lib/applications/reconciliation", () => ({
  reconcileApplicationCanonicalState: vi.fn(),
}));

vi.mock("@/lib/applications/state-transitions", () => ({
  transitionApplicationState: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: { findMany: vi.fn() },
  },
}));

const findApplicationsMock = vi.mocked(prisma.application.findMany);
const preparePackageMock = vi.mocked(prepareApplicationPackage);
const syncPacketMock = vi.mocked(syncApplicationPacket);
const reconcileMock = vi.mocked(reconcileApplicationCanonicalState);
const transitionMock = vi.mocked(transitionApplicationState);

describe("POST /api/applications/bulk-move-to-sprint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findApplicationsMock.mockResolvedValue([] as never);
    preparePackageMock.mockResolvedValue(readyPackage("app_prepared"));
    transitionMock.mockResolvedValue({ application: { id: "app_moved", status: "ready_to_apply" } } as Awaited<ReturnType<typeof transitionApplicationState>>);
    syncPacketMock.mockResolvedValue({ id: "packet_1" } as never);
    reconcileMock.mockResolvedValue(undefined as never);
  });

  it("regenerates blocked existing cover letters before moving approved applications into Apply Sprint", async () => {
    findApplicationsMock.mockResolvedValue([
      application({
        id: "app_blocked",
        jobPostingId: "job_blocked",
        resumeId: "resume_old",
        coverLetterId: "letter_old",
        company: "Linear",
        title: "Product Engineer",
        generationNotes: {
          generatedBy: "deterministic_fallback",
          materialQuality: {
            status: "BLOCKED",
            launchable: false,
            reason: "Cover letter used deterministic fallback output and must be regenerated or reviewed before launch.",
            reasons: ["deterministic_fallback"],
            score: 0,
            generatedBy: "deterministic_fallback",
            evidenceRefs: [],
          },
        },
      }),
    ] as never);
    preparePackageMock.mockResolvedValue(readyPackage("app_blocked", "resume_new", "letter_new"));

    const response = await POST(new Request("http://localhost/api/applications/bulk-move-to-sprint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 10 }),
    }));

    expect(response.status).toBe(200);
    expect(preparePackageMock).toHaveBeenCalledWith("job_blocked", { regenerateCoverLetter: true });
    expect(transitionMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      moved: 0,
      prepared: 1,
      regenerated: 1,
      failed: 0,
      results: [
        expect.objectContaining({
          ok: true,
          applicationId: "app_blocked",
          jobId: "job_blocked",
          action: "prepared",
          regeneratedCoverLetter: true,
        }),
      ],
    });
  });

  it("can still fail blocked existing cover letters when regeneration is explicitly disabled", async () => {
    findApplicationsMock.mockResolvedValue([
      application({
        id: "app_blocked",
        jobPostingId: "job_blocked",
        resumeId: "resume_old",
        coverLetterId: "letter_old",
        generationNotes: {
          materialQuality: {
            status: "BLOCKED",
            launchable: false,
            reason: "Needs review.",
            reasons: ["deterministic_fallback"],
            score: 0,
            generatedBy: "deterministic_fallback",
            evidenceRefs: [],
          },
        },
      }),
    ] as never);

    const response = await POST(new Request("http://localhost/api/applications/bulk-move-to-sprint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 10, regenerateBlockedMaterials: false }),
    }));

    expect(response.status).toBe(200);
    expect(preparePackageMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      moved: 0,
      prepared: 0,
      regenerated: 0,
      failed: 1,
      results: [
        expect.objectContaining({
          ok: false,
          action: "failed",
          error: "material_quality_needs_review: Needs review.",
        }),
      ],
    });
  });

  it("reports OpenAI quota blocks when regenerated materials still cannot launch", async () => {
    findApplicationsMock.mockResolvedValue([
      application({
        id: "app_blocked",
        jobPostingId: "job_blocked",
        resumeId: "resume_old",
        coverLetterId: "letter_old",
        generationNotes: {
          materialQuality: {
            status: "BLOCKED",
            launchable: false,
            reason: "Needs regeneration.",
            reasons: ["deterministic_fallback"],
            score: 0,
            generatedBy: "deterministic_fallback",
            evidenceRefs: [],
          },
        },
      }),
    ] as never);
    preparePackageMock.mockResolvedValue({
      ...readyPackage("app_blocked"),
      readyToApply: false,
      materialQuality: {
        status: "BLOCKED",
        launchable: false,
        reason: "OpenAI quota is exhausted, so the structured cover-letter writer could not run. Regeneration is required before launch.",
        reasons: ["deterministic_fallback", "openai_insufficient_quota"],
        score: 32,
        generatedBy: "deterministic_fallback",
        evidenceRefs: [],
        generationFailure: {
          provider: "openai",
          code: "openai_insufficient_quota",
          message: "OpenAI quota is exhausted; structured cover-letter generation could not run.",
          retryable: false,
        },
      },
    } as Awaited<ReturnType<typeof prepareApplicationPackage>>);

    const response = await POST(new Request("http://localhost/api/applications/bulk-move-to-sprint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 10 }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      moved: 0,
      prepared: 0,
      regenerated: 0,
      failed: 1,
      materialBlocked: 1,
      quotaBlocked: 1,
      message: expect.stringContaining("OpenAI quota blocked cover-letter regeneration"),
      results: [
        expect.objectContaining({
          ok: false,
          regeneratedCoverLetter: true,
          materialQuality: expect.objectContaining({
            reasons: expect.arrayContaining(["openai_insufficient_quota"]),
          }),
        }),
      ],
    });
  });

  it("moves existing launchable materials without regenerating", async () => {
    findApplicationsMock.mockResolvedValue([
      application({
        id: "app_pass",
        jobPostingId: "job_pass",
        resumeId: "resume_pass",
        coverLetterId: "letter_pass",
        generationNotes: {
          materialQuality: {
            status: "PASS",
            launchable: true,
            reason: "Cover letter passed material quality review.",
            reasons: [],
            score: 92,
            generatedBy: "openai_structured",
            evidenceRefs: ["evidence_1"],
          },
        },
      }),
    ] as never);

    const response = await POST(new Request("http://localhost/api/applications/bulk-move-to-sprint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 10 }),
    }));

    expect(response.status).toBe(200);
    expect(preparePackageMock).not.toHaveBeenCalled();
    expect(transitionMock).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: "app_pass",
      toStatus: "ready_to_apply",
      source: "bulk_move_to_apply_sprint",
    }));
    expect(syncPacketMock).toHaveBeenCalledWith("app_pass");
    await expect(response.json()).resolves.toMatchObject({
      moved: 1,
      prepared: 0,
      regenerated: 0,
      failed: 0,
    });
  });

  it("accepts a 250 item regeneration batch for large blocked backlogs", async () => {
    findApplicationsMock.mockResolvedValue([
      application({
        id: "app_pass",
        jobPostingId: "job_pass",
        resumeId: "resume_pass",
        coverLetterId: "letter_pass",
        generationNotes: {
          materialQuality: {
            status: "PASS",
            launchable: true,
            reason: "Cover letter passed material quality review.",
            reasons: [],
            score: 92,
            generatedBy: "openai_structured",
            evidenceRefs: ["evidence_1"],
          },
        },
      }),
    ] as never);

    const response = await POST(new Request("http://localhost/api/applications/bulk-move-to-sprint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 250, regenerateBlockedMaterials: true }),
    }));

    expect(response.status).toBe(200);
    expect(findApplicationsMock).toHaveBeenCalledWith(expect.objectContaining({ take: 1000 }));
    await expect(response.json()).resolves.toMatchObject({
      requested: expect.objectContaining({ limit: 250, regenerateBlockedMaterials: true }),
    });
  });
});

function readyPackage(applicationId: string, resumeId = "resume_1", coverLetterId = "letter_1") {
  return {
    application: { id: applicationId },
    resume: { id: resumeId },
    coverLetter: { id: coverLetterId },
    readyToApply: true,
    materialQuality: {
      status: "PASS",
      launchable: true,
      reason: "Cover letter passed material quality review.",
      reasons: [],
      score: 91,
      generatedBy: "openai_structured",
      evidenceRefs: ["evidence_1"],
    },
  } as unknown as Awaited<ReturnType<typeof prepareApplicationPackage>>;
}

function application(input: {
  id: string;
  jobPostingId: string;
  resumeId: string;
  coverLetterId: string;
  company?: string;
  title?: string;
  generationNotes: Record<string, unknown>;
}) {
  return {
    id: input.id,
    jobPostingId: input.jobPostingId,
    resumeId: input.resumeId,
    coverLetterId: input.coverLetterId,
    notes: null,
    jobPosting: {
      id: input.jobPostingId,
      company: input.company ?? "Acme",
      title: input.title ?? "Frontend Engineer",
      applicationUrl: "https://jobs.ashbyhq.com/acme/frontend-engineer/application",
    },
    coverLetter: {
      generationNotes: input.generationNotes,
    },
  };
}
