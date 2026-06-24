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

  it("archives approved applications without direct URLs before preparing the queue", async () => {
    findApplicationsMock.mockResolvedValue([
      application({
        id: "app_no_url",
        jobPostingId: "job_no_url",
        resumeId: "resume_old",
        coverLetterId: "letter_old",
        applicationUrl: null,
        generationNotes: {
          materialQuality: {
            status: "PASS",
            launchable: true,
            reason: "Cover letter passed material quality review.",
            reasons: [],
            score: 92,
            generatedBy: "openai_structured_outputs",
            evidenceRefs: [],
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
    expect(transitionMock).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: "app_no_url",
      toStatus: "archived",
      source: "bulk_move_to_apply_sprint_no_direct_url",
      metadata: expect.objectContaining({
        applicationUrl: null,
        applicationUrlQuality: expect.objectContaining({ kind: "missing", launchable: false }),
      }),
    }));
    await expect(response.json()).resolves.toMatchObject({
      archivedNoDirectUrl: 1,
      moved: 0,
      prepared: 0,
      results: [
        expect.objectContaining({
          ok: true,
          action: "archived_no_direct_url",
          reason: expect.stringContaining("No application URL is saved"),
        }),
      ],
    });
  });

  it("reports blocked existing cover letters instead of letting them monopolize the batch", async () => {
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
    expect(preparePackageMock).not.toHaveBeenCalled();
    expect(transitionMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      moved: 0,
      prepared: 0,
      regenerated: 0,
      materialBlocked: 1,
      failed: 0,
      results: [
        expect.objectContaining({
          ok: false,
          applicationId: "app_blocked",
          jobId: "job_blocked",
          action: "material_blocked",
          reason: expect.stringContaining("deterministic fallback"),
        }),
      ],
    });
  });

  it("regenerates material-blocked applications when the material review queue is requested", async () => {
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
      body: JSON.stringify({ limit: 10, queue: "material_blocked", regenerateBlockedMaterials: true }),
    }));

    expect(response.status).toBe(200);
    expect(preparePackageMock).toHaveBeenCalledWith("job_blocked", {
      regenerateResume: true,
      regenerateCoverLetter: true,
    });
    expect(transitionMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      moved: 0,
      prepared: 1,
      regenerated: 1,
      materialBlocked: 0,
      failed: 0,
      requested: expect.objectContaining({ queue: "material_blocked" }),
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
      materialBlocked: 1,
      failed: 0,
      results: [
        expect.objectContaining({
          ok: false,
          action: "material_blocked",
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

  it("reports OpenAI quota blocks without retrying blocked material first", async () => {
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
    expect(preparePackageMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      moved: 0,
      prepared: 0,
      regenerated: 0,
      failed: 0,
      materialBlocked: 1,
      quotaBlocked: 1,
      message: expect.stringContaining("OpenAI quota blocked cover-letter regeneration"),
      results: [
        expect.objectContaining({
          ok: false,
          action: "material_blocked",
          materialQuality: expect.objectContaining({
            reasons: expect.arrayContaining(["openai_insufficient_quota"]),
          }),
        }),
      ],
    });
  });

  it("does not let no-URL or blocked applications prevent older launchable applications from moving", async () => {
    findApplicationsMock.mockResolvedValue([
      application({
        id: "app_no_url",
        jobPostingId: "job_no_url",
        resumeId: "resume_no_url",
        coverLetterId: "letter_no_url",
        applicationUrl: null,
        generationNotes: {
          materialQuality: {
            status: "PASS",
            launchable: true,
            reason: "Cover letter passed material quality review.",
            reasons: [],
            score: 90,
            generatedBy: "openai_structured_outputs",
            evidenceRefs: [],
          },
        },
      }),
      application({
        id: "app_blocked",
        jobPostingId: "job_blocked",
        resumeId: "resume_blocked",
        coverLetterId: "letter_blocked",
        generationNotes: {
          materialQuality: {
            status: "BLOCKED",
            launchable: false,
            reason: "Application QA marked the generated materials as needing review.",
            reasons: ["application_qa_needs_review"],
            score: 72,
            generatedBy: "openai_structured_outputs",
            evidenceRefs: [],
          },
        },
      }),
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
            generatedBy: "openai_structured_outputs",
            evidenceRefs: [],
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
    expect(transitionMock).toHaveBeenCalledWith(expect.objectContaining({ applicationId: "app_no_url", toStatus: "archived" }));
    expect(transitionMock).toHaveBeenCalledWith(expect.objectContaining({ applicationId: "app_pass", toStatus: "ready_to_apply" }));
    await expect(response.json()).resolves.toMatchObject({
      moved: 1,
      archivedNoDirectUrl: 1,
      prepared: 0,
      materialBlocked: 1,
      failed: 0,
    });
  });

  it("prepares missing materials when direct URLs are available", async () => {
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
      body: JSON.stringify({ limit: 10 }),
    }));

    expect(response.status).toBe(200);
    expect(preparePackageMock).toHaveBeenCalledWith("job_missing_materials");
    await expect(response.json()).resolves.toMatchObject({
      moved: 0,
      prepared: 1,
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
  applicationUrl?: string | null;
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
      applicationUrl: input.applicationUrl === undefined ? "https://jobs.ashbyhq.com/acme/frontend-engineer/application" : input.applicationUrl,
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
