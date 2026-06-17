import { beforeEach, describe, expect, it, vi } from "vitest";
import { runApplicationQaAgent } from "@/lib/agents/application-qa";
import { runHiringManagerReviewerAgent } from "@/lib/agents/hiring-manager-reviewer";
import { prepareApplicationPackage } from "@/lib/applications/prepare-package";
import { syncApplicationPacket } from "@/lib/applications/application-packets";
import { reconcileApplicationCanonicalState } from "@/lib/applications/reconciliation";
import { transitionApplicationState } from "@/lib/applications/state-transitions";
import { syncMaterialClaimsForCoverLetter } from "@/lib/trust/material-claims";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/agents/application-qa", () => ({
  runApplicationQaAgent: vi.fn(),
}));

vi.mock("@/lib/agents/hiring-manager-reviewer", () => ({
  runHiringManagerReviewerAgent: vi.fn(),
}));

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
    generatedCoverLetter: { update: vi.fn() },
  },
}));

vi.mock("@/lib/trust/material-claims", () => ({
  syncMaterialClaimsForCoverLetter: vi.fn(),
}));

const findApplicationsMock = vi.mocked(prisma.application.findMany);
const updateCoverLetterMock = vi.mocked(prisma.generatedCoverLetter.update);
const runApplicationQaMock = vi.mocked(runApplicationQaAgent);
const runHiringManagerReviewMock = vi.mocked(runHiringManagerReviewerAgent);
const preparePackageMock = vi.mocked(prepareApplicationPackage);
const syncPacketMock = vi.mocked(syncApplicationPacket);
const syncClaimsMock = vi.mocked(syncMaterialClaimsForCoverLetter);
const reconcileMock = vi.mocked(reconcileApplicationCanonicalState);
const transitionMock = vi.mocked(transitionApplicationState);

describe("POST /api/applications/bulk-move-to-sprint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findApplicationsMock.mockResolvedValue([] as never);
    runApplicationQaMock.mockResolvedValue({
      run: { id: "agent_run_1" },
      output: {
        status: "PASS",
        score: 90,
        warnings: [],
        unsupportedClaims: [],
        styleViolations: [],
        suggestedEdits: [],
        evidenceRefs: ["evidence_1"],
        reasoningSummary: "QA passed.",
        confidence: 0.84,
      },
    } as unknown as Awaited<ReturnType<typeof runApplicationQaAgent>>);
    runHiringManagerReviewMock.mockResolvedValue({
      run: { id: "agent_run_review" },
      output: {
        status: "PASS",
        score: 90,
        strengths: ["Specific and relevant."],
        concerns: [],
        missingSignals: [],
        unsupportedClaims: [],
        genericSignals: [],
        rewriteRecommended: false,
        rewriteInstructions: null,
        reasoningSummary: "Hiring-manager review passed.",
        confidence: 0.84,
      },
    } as unknown as Awaited<ReturnType<typeof runHiringManagerReviewerAgent>>);
    preparePackageMock.mockResolvedValue(readyPackage("app_prepared"));
    updateCoverLetterMock.mockResolvedValue({ id: "letter_1" } as never);
    syncClaimsMock.mockResolvedValue([]);
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

  it("does not generate missing materials when regeneration is disabled", async () => {
    findApplicationsMock.mockResolvedValue([
      {
        id: "app_missing_materials",
        userId: "user_1",
        jobPostingId: "job_missing_materials",
        resumeId: null,
        coverLetterId: null,
        notes: null,
        jobPosting: {
          id: "job_missing_materials",
          company: "Acme",
          title: "Frontend Engineer",
          applicationUrl: "https://jobs.ashbyhq.com/acme/frontend-engineer/application",
        },
        resume: null,
        coverLetter: null,
      },
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
      failed: 1,
      results: [
        expect.objectContaining({
          ok: false,
          error: expect.stringContaining("missing_resume_or_cover_letter"),
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

  it("reassesses existing structured cover letters before spending a regeneration call", async () => {
    findApplicationsMock.mockResolvedValue([
      application({
        id: "app_structured",
        jobPostingId: "job_structured",
        resumeId: "resume_structured",
        coverLetterId: "letter_structured",
        generationNotes: {
          generatedBy: "openai_structured_outputs",
          applicationEvidencePlan: {
            status: "READY",
            jobSignals: ["react", "typescript", "product"],
            proofPoints: [],
            evidenceRefs: ["evidence_1"],
            avoidedSignals: [],
            warnings: [],
            rationale: "Use verified frontend evidence.",
            confidence: 0.86,
          },
          hiringManagerReview: {
            status: "PASS",
            score: 88,
            strengths: ["Specific and relevant."],
            concerns: [],
            missingSignals: [],
            unsupportedClaims: [],
            genericSignals: [],
            rewriteRecommended: false,
            reasoningSummary: "Specific and evidence-backed.",
            confidence: 0.86,
          },
          materialQuality: {
            status: "NEEDS_REVIEW",
            launchable: false,
            reason: "Application QA marked the generated materials as needing review.",
            reasons: ["application_qa_needs_review", "application_qa_score_below_pass"],
            score: 82,
            generatedBy: "openai_structured_outputs",
            evidenceRefs: ["evidence_1"],
          },
        },
      }),
    ] as never);
    runApplicationQaMock.mockResolvedValue({
      run: { id: "agent_run_qa" },
      output: {
        status: "PASS",
        score: 82,
        warnings: [],
        unsupportedClaims: [],
        styleViolations: [],
        suggestedEdits: [],
        evidenceRefs: ["evidence_1"],
        reasoningSummary: "QA passed after scoped reassessment.",
        confidence: 0.84,
      },
    } as unknown as Awaited<ReturnType<typeof runApplicationQaAgent>>);

    const response = await POST(new Request("http://localhost/api/applications/bulk-move-to-sprint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 10 }),
    }));

    expect(response.status).toBe(200);
    expect(runApplicationQaMock).toHaveBeenCalledWith(expect.objectContaining({
      jobPostingId: "job_structured",
      coverLetterBody: expect.stringContaining("Frontend Engineer"),
    }));
    expect(runHiringManagerReviewMock).not.toHaveBeenCalled();
    expect(updateCoverLetterMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "letter_structured" },
      data: expect.objectContaining({
        generationNotes: expect.objectContaining({
          materialQuality: expect.objectContaining({ launchable: true, status: "PASS" }),
        }),
      }),
    }));
    expect(syncClaimsMock).toHaveBeenCalledWith("letter_structured");
    expect(preparePackageMock).not.toHaveBeenCalled();
    expect(transitionMock).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: "app_structured",
      toStatus: "ready_to_apply",
      source: "bulk_move_to_apply_sprint",
    }));
    await expect(response.json()).resolves.toMatchObject({
      moved: 1,
      prepared: 0,
      regenerated: 0,
      reassessed: 1,
      failed: 0,
      results: [
        expect.objectContaining({
          ok: true,
          action: "moved",
          reassessedMaterialQuality: true,
        }),
      ],
    });
  });

  it("creates a missing hiring-manager review during structured cover-letter reassessment", async () => {
    findApplicationsMock.mockResolvedValue([
      application({
        id: "app_missing_review",
        jobPostingId: "job_missing_review",
        resumeId: "resume_missing_review",
        coverLetterId: "letter_missing_review",
        generationNotes: {
          generatedBy: "openai_structured_outputs",
          applicationEvidencePlan: {
            status: "READY",
            jobSignals: ["react", "typescript", "product"],
            proofPoints: [],
            evidenceRefs: ["evidence_1"],
            avoidedSignals: [],
            warnings: [],
            rationale: "Use verified frontend evidence.",
            confidence: 0.86,
          },
          materialQuality: {
            status: "NEEDS_REVIEW",
            launchable: false,
            reason: "Cover letter needs material quality review before launch.",
            reasons: ["missing_hiring_manager_review"],
            score: 90,
            generatedBy: "openai_structured_outputs",
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
    expect(runHiringManagerReviewMock).toHaveBeenCalledWith(expect.objectContaining({
      jobPostingId: "job_missing_review",
      coverLetterBody: expect.stringContaining("Frontend Engineer"),
      generatedBy: "openai_structured_outputs",
    }));
    expect(updateCoverLetterMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "letter_missing_review" },
      data: expect.objectContaining({
        generationNotes: expect.objectContaining({
          hiringManagerReview: expect.objectContaining({ status: "PASS" }),
          materialQuality: expect.objectContaining({ launchable: true, status: "PASS" }),
        }),
      }),
    }));
    expect(preparePackageMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      moved: 1,
      reassessed: 1,
      failed: 0,
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
    userId: "user_1",
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
    resume: {
      markdown: "Senior frontend engineer with React, TypeScript, and product workflow experience.".repeat(30),
    },
    coverLetter: {
      id: input.coverLetterId,
      body: [
        `Dear ${input.company ?? "Acme"} hiring team,`,
        "",
        `The ${input.title ?? "Frontend Engineer"} role maps to my verified React and TypeScript product workflow experience.`,
        "I have built customer-facing interfaces with clear component boundaries, pragmatic QA, and close product collaboration.",
        "My recent work has focused on making dense workflows easier to scan, safer to operate, and more reliable for teams that need speed without losing control.",
        "I would bring that same product-minded frontend execution to this role, from shaping ambiguous requirements through implementation details that remain maintainable after launch.",
        "I am especially useful when a team needs someone who can reason through user flows, edge cases, component behavior, and implementation tradeoffs in the same conversation.",
        "That mix helps me move quickly without turning the product into disconnected UI, and it is the approach I would bring to this application.",
        "",
        "Best,",
        "Carl Welch",
      ].join("\n"),
      generationNotes: input.generationNotes,
    },
  };
}
