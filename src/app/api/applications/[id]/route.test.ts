import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { captureJobRejectionLearning } from "@/lib/jobs/rejection-learning";
import { recordRejectedJobSuppression } from "@/lib/jobs/suppression";
import { transitionApplicationState } from "@/lib/applications/state-transitions";
import { DELETE, PATCH } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    jobPosting: {
      update: vi.fn(),
    },
    applicationEvent: {
      create: vi.fn(),
    },
    jobProfileMatch: {
      update: vi.fn(),
    },
    skillFeedback: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (operations) => Promise.all(operations)),
  },
}));

vi.mock("@/lib/jobs/rejection-learning", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/jobs/rejection-learning")>()),
  captureJobRejectionLearning: vi.fn(),
}));

vi.mock("@/lib/jobs/suppression", () => ({
  recordRejectedJobSuppression: vi.fn(),
}));

vi.mock("@/lib/observability/outcome-calibration", () => ({
  refreshOutcomeCalibration: vi.fn(),
}));

vi.mock("@/lib/applications/state-transitions", () => ({
  transitionApplicationState: vi.fn(),
}));

const findApplicationMock = vi.mocked(prisma.application.findUnique);
const findApplicationsMock = vi.mocked(prisma.application.findMany);
const deleteApplicationMock = vi.mocked(prisma.application.delete);
const updateJobPostingMock = vi.mocked(prisma.jobPosting.update);
const createApplicationEventMock = vi.mocked(prisma.applicationEvent.create);
const updateMatchMock = vi.mocked(prisma.jobProfileMatch.update);
const createSkillFeedbackMock = vi.mocked(prisma.skillFeedback.create);
const transactionMock = vi.mocked(prisma.$transaction);
const captureJobRejectionLearningMock = vi.mocked(captureJobRejectionLearning);
const recordRejectedJobSuppressionMock = vi.mocked(recordRejectedJobSuppression);
const transitionApplicationStateMock = vi.mocked(transitionApplicationState);

describe("DELETE /api/applications/[id]", () => {
  beforeEach(() => {
    findApplicationMock.mockReset();
    findApplicationsMock.mockReset();
    deleteApplicationMock.mockReset();
    updateJobPostingMock.mockReset();
    createApplicationEventMock.mockReset();
    updateMatchMock.mockReset();
    createSkillFeedbackMock.mockReset();
    captureJobRejectionLearningMock.mockReset();
    recordRejectedJobSuppressionMock.mockReset();
    transitionApplicationStateMock.mockReset();
    transactionMock.mockClear();
    deleteApplicationMock.mockResolvedValue({ id: "app_1" } as Awaited<ReturnType<typeof prisma.application.delete>>);
    updateJobPostingMock.mockResolvedValue({ id: "job_1", applicationUrl: "https://jobs.acme.example/apply" } as Awaited<ReturnType<typeof prisma.jobPosting.update>>);
    createApplicationEventMock.mockResolvedValue({ id: "event_1" } as Awaited<ReturnType<typeof prisma.applicationEvent.create>>);
    updateMatchMock.mockResolvedValue({ id: "match_1", status: "rejected" } as Awaited<ReturnType<typeof prisma.jobProfileMatch.update>>);
    createSkillFeedbackMock.mockResolvedValue({ id: "feedback_1" } as Awaited<ReturnType<typeof prisma.skillFeedback.create>>);
    captureJobRejectionLearningMock.mockResolvedValue({ created: 1 });
    findApplicationsMock.mockResolvedValue([] as never);
    transitionApplicationStateMock.mockResolvedValue({
      application: { id: "app_1", status: "archived" },
      event: { id: "event_1" },
      sideEffects: { idempotent: false, packetSynced: true, reconciliationRan: false, submittedSuppressionRecorded: false, outcomeCalibrationRefreshed: true, errors: [] },
    } as unknown as Awaited<ReturnType<typeof transitionApplicationState>>);
  });

  it("soft archives the application and records agency learning feedback", async () => {
    findApplicationMock.mockResolvedValue({
      id: "app_1",
      userId: "user_1",
      jobPostingId: "job_1",
      status: "ready_to_apply",
      jobProfileMatchId: "match_1",
      jobPosting: {
        company: "Acme",
        title: "Senior Engineer",
        location: "Remote",
      },
    } as unknown as Awaited<ReturnType<typeof prisma.application.findUnique>>);

    const response = await DELETE(new Request("http://localhost/api/applications/app_1", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reasons: ["job_unavailable"],
        note: "Too much legacy Java.",
        source: "applications_rejection_reason_prompt",
      }),
    }), { params: { id: "app_1" } });

    expect(createSkillFeedbackMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user_1",
        skillId: "approve_agency_match",
        applicationId: "app_1",
        jobPostingId: "job_1",
        problemSummary: expect.stringContaining("not a good fit"),
        rawMessage: expect.stringContaining("job unavailable"),
        contextJson: expect.objectContaining({
          reasons: ["job_unavailable"],
          note: "Too much legacy Java.",
          source: "applications_rejection_reason_prompt",
        }),
      }),
    }));
    expect(transitionApplicationStateMock).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: "app_1",
      toStatus: "archived",
      source: "applications_rejection_reason_prompt",
      actor: { type: "user" },
      metadata: expect.objectContaining({
        reasons: ["job_unavailable"],
        note: "Too much legacy Java.",
        jobProfileMatchId: "match_1",
      }),
    }));
    expect(captureJobRejectionLearningMock).toHaveBeenCalledWith(expect.objectContaining({
      matchId: "match_1",
      jobPostingId: "job_1",
      reasons: ["job_unavailable"],
      note: "Too much legacy Java.",
      source: "applications_rejection_reason_prompt",
      previousStatus: "ready_to_apply",
    }));
    expect(recordRejectedJobSuppressionMock).toHaveBeenCalledWith(expect.objectContaining({
      source: "applications_rejection_reason_prompt",
      reason: expect.stringContaining("job unavailable"),
    }));
    expect(deleteApplicationMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ deleted: false, archived: true, rejected: true });
  });

  it("archives active sibling application trackers for the same canonical job", async () => {
    findApplicationMock.mockResolvedValue({
      id: "app_1",
      userId: "user_1",
      jobPostingId: "job_1",
      status: "approved",
      jobProfileMatchId: "match_1",
      jobPosting: {
        id: "job_1",
        company: "Linear",
        title: "Product Engineer",
        location: "Remote",
        duplicateGroupId: null,
      },
    } as unknown as Awaited<ReturnType<typeof prisma.application.findUnique>>);
    findApplicationsMock.mockResolvedValue([
      {
        id: "app_sibling",
        jobProfileMatchId: "match_sibling",
        notes: null,
        jobPosting: {
          id: "job_sibling",
          company: "Linear",
          title: "Product Engineer",
          location: "Europe",
          duplicateGroupId: null,
        },
      },
      {
        id: "app_other",
        jobProfileMatchId: "match_other",
        notes: null,
        jobPosting: {
          id: "job_other",
          company: "Linear",
          title: "Product Designer",
          location: "Remote",
          duplicateGroupId: null,
        },
      },
    ] as never);

    const response = await DELETE(new Request("http://localhost/api/applications/app_1", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reasons: ["wrong_tech_stack"],
        source: "applications_rejection_reason_prompt",
      }),
    }), { params: { id: "app_1" } });

    expect(transitionApplicationStateMock).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: "app_1",
      toStatus: "archived",
      source: "applications_rejection_reason_prompt",
    }));
    expect(transitionApplicationStateMock).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: "app_sibling",
      toStatus: "archived",
      source: "applications_rejection_reason_prompt_sibling",
      metadata: expect.objectContaining({
        rejectedApplicationId: "app_1",
        jobProfileMatchId: "match_sibling",
      }),
    }));
    expect(transitionApplicationStateMock).not.toHaveBeenCalledWith(expect.objectContaining({
      applicationId: "app_other",
    }));
    await expect(response.json()).resolves.toMatchObject({
      archivedSiblingCount: 1,
      message: expect.stringContaining("duplicate tracker"),
    });
  });

  it("updates the linked job posting application URL", async () => {
    updateJobPostingMock.mockResolvedValue({ id: "job_1", applicationUrl: "https://jobs.acme.example/apply?job=123" } as Awaited<ReturnType<typeof prisma.jobPosting.update>>);
    findApplicationMock.mockResolvedValue({
      id: "app_1",
      jobPostingId: "job_1",
      jobPosting: {
        id: "job_1",
        applicationUrl: "https://jobboard.example/intermediary",
        rawData: { source: "search_query" },
      },
    } as unknown as Awaited<ReturnType<typeof prisma.application.findUnique>>);

    const response = await PATCH(new Request("http://localhost/api/applications/app_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ applicationUrl: "https://jobs.acme.example/apply?job=123" }),
    }), { params: { id: "app_1" } });

    expect(updateJobPostingMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "job_1" },
      data: expect.objectContaining({
        applicationUrl: "https://jobs.acme.example/apply?job=123",
        rawData: expect.objectContaining({
          source: "search_query",
          manualApplicationUrlCorrection: expect.objectContaining({
            previousUrl: "https://jobboard.example/intermediary",
            applicationUrl: "https://jobs.acme.example/apply?job=123",
            source: "application_detail_page",
          }),
        }),
      }),
    }));
    expect(createApplicationEventMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        applicationId: "app_1",
        type: "note_added",
        payload: expect.objectContaining({
          previousUrl: "https://jobboard.example/intermediary",
          applicationUrl: "https://jobs.acme.example/apply?job=123",
        }),
      }),
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ applicationUrl: "https://jobs.acme.example/apply?job=123" });
  });

  it("allows clearing the application URL", async () => {
    findApplicationMock.mockResolvedValue({
      id: "app_1",
      jobPostingId: "job_1",
      jobPosting: {
        id: "job_1",
        applicationUrl: "https://jobboard.example/intermediary",
        rawData: {},
      },
    } as unknown as Awaited<ReturnType<typeof prisma.application.findUnique>>);
    updateJobPostingMock.mockResolvedValue({ id: "job_1", applicationUrl: null } as Awaited<ReturnType<typeof prisma.jobPosting.update>>);

    const response = await PATCH(new Request("http://localhost/api/applications/app_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ applicationUrl: "   " }),
    }), { params: { id: "app_1" } });

    expect(updateJobPostingMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ applicationUrl: null }),
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ applicationUrl: null });
  });

  it("rejects manual application URL updates to board URLs", async () => {
    const response = await PATCH(new Request("http://localhost/api/applications/app_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ applicationUrl: "https://builtin.com/job/frontend-engineer/8269411" }),
    }), { params: { id: "app_1" } });

    expect(updateJobPostingMock).not.toHaveBeenCalled();
    expect(createApplicationEventMock).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Direct application URL required"),
      applicationUrlQuality: expect.objectContaining({
        launchable: false,
        kind: "board_intermediary",
      }),
    });
  });

  it("rejects non-http application URLs", async () => {
    const response = await PATCH(new Request("http://localhost/api/applications/app_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ applicationUrl: "javascript:alert(1)" }),
    }), { params: { id: "app_1" } });

    expect(updateJobPostingMock).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });
});
