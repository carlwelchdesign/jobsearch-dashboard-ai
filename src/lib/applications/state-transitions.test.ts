import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Application, JobMatchStatus } from "@prisma/client";
import { syncApplicationPacket } from "@/lib/applications/application-packets";
import { reconcileApplicationCanonicalState } from "@/lib/applications/reconciliation";
import { transitionApplicationState } from "@/lib/applications/state-transitions";
import { recordSubmittedJobSuppression } from "@/lib/jobs/suppression";
import { refreshOutcomeCalibration } from "@/lib/observability/outcome-calibration";
import { prisma } from "@/lib/prisma";

const prismaMock = vi.hoisted(() => ({
  application: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  applicationEvent: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  jobProfileMatch: {
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/applications/application-packets", () => ({
  syncApplicationPacket: vi.fn(),
}));

vi.mock("@/lib/applications/reconciliation", () => ({
  reconcileApplicationCanonicalState: vi.fn(),
}));

vi.mock("@/lib/jobs/suppression", () => ({
  recordSubmittedJobSuppression: vi.fn(),
}));

vi.mock("@/lib/observability/outcome-calibration", () => ({
  refreshOutcomeCalibration: vi.fn(),
}));

const applicationFindUniqueMock = vi.mocked(prisma.application.findUnique);
const applicationUpdateMock = vi.mocked(prisma.application.update);
const eventFindFirstMock = vi.mocked(prisma.applicationEvent.findFirst);
const eventCreateMock = vi.mocked(prisma.applicationEvent.create);
const matchUpdateMock = vi.mocked(prisma.jobProfileMatch.update);
const transactionMock = vi.mocked(prisma.$transaction);
const syncPacketMock = vi.mocked(syncApplicationPacket);
const reconcileMock = vi.mocked(reconcileApplicationCanonicalState);
const suppressionMock = vi.mocked(recordSubmittedJobSuppression);
const refreshMock = vi.mocked(refreshOutcomeCalibration);

describe("transitionApplicationState", () => {
  beforeEach(() => {
    applicationFindUniqueMock.mockReset();
    applicationUpdateMock.mockReset();
    eventFindFirstMock.mockReset();
    eventCreateMock.mockReset();
    matchUpdateMock.mockReset();
    transactionMock.mockReset();
    syncPacketMock.mockReset();
    reconcileMock.mockReset();
    suppressionMock.mockReset();
    refreshMock.mockReset();

    eventFindFirstMock.mockResolvedValue(null);
    transactionMock.mockImplementation(async (callback) => callback(prisma));
    eventCreateMock.mockResolvedValue({
      id: "event_1",
      applicationId: "app_1",
      type: "status_changed",
      source: "test_transition",
      actorType: "system",
      actorId: null,
      requestId: null,
      idempotencyKey: null,
      beforeJson: {},
      afterJson: {},
      entityVersion: 2,
      payload: {},
      createdAt: new Date("2026-06-16T12:00:00.000Z"),
    } as Awaited<ReturnType<typeof prisma.applicationEvent.create>>);
    matchUpdateMock.mockResolvedValue({ id: "match_1" } as Awaited<ReturnType<typeof prisma.jobProfileMatch.update>>);
    syncPacketMock.mockResolvedValue({ id: "packet_1" } as Awaited<ReturnType<typeof syncApplicationPacket>>);
  });

  it("moves an approved application to ready_to_apply and syncs linked match, packet, audit, and version", async () => {
    const before = applicationFixture({ status: "approved", approvedAt: null, version: 1 });
    const approvedAt = new Date("2026-06-16T12:00:00.000Z");
    applicationFindUniqueMock.mockResolvedValue(before);
    applicationUpdateMock.mockResolvedValue({ ...before, status: "ready_to_apply", approvedAt, version: 2 } as Application);

    const result = await transitionApplicationState({
      applicationId: "app_1",
      toStatus: "ready_to_apply",
      source: "test_transition",
      actor: { type: "system" },
      reason: "Packet is ready.",
      occurredAt: approvedAt,
      metadata: { packet: true },
    });

    expect(result.application.status).toBe("ready_to_apply");
    expect(applicationUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "app_1" },
      data: expect.objectContaining({
        status: "ready_to_apply",
        approvedAt,
        version: { increment: 1 },
      }),
    }));
    expect(matchUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "match_1" },
      data: expect.objectContaining({ status: "ready_to_apply", reviewedAt: approvedAt }),
    }));
    expect(eventCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        applicationId: "app_1",
        type: "status_changed",
        source: "test_transition",
        actorType: "system",
        entityVersion: 2,
        beforeJson: expect.objectContaining({ status: "approved", version: 1 }),
        afterJson: expect.objectContaining({ status: "ready_to_apply", version: 2 }),
      }),
    }));
    expect(syncPacketMock).toHaveBeenCalledWith("app_1");
    expect(refreshMock).toHaveBeenCalledWith({ userId: "user_1", source: "test_transition" });
  });

  it("marks applied applications with submitted suppression and canonical reconciliation", async () => {
    const occurredAt = new Date("2026-06-16T12:30:00.000Z");
    const before = applicationFixture({ status: "ready_to_apply", approvedAt: new Date("2026-06-16T12:00:00.000Z"), version: 4 });
    const after = {
      ...before,
      status: "applied",
      appliedAt: occurredAt,
      followUpAt: new Date("2026-06-23T12:30:00.000Z"),
      version: 5,
    };
    applicationFindUniqueMock.mockResolvedValue(before);
    applicationUpdateMock.mockResolvedValue(after as Application);

    await transitionApplicationState({
      applicationId: "app_1",
      toStatus: "applied",
      source: "mark_applied",
      actor: { type: "user" },
      reason: "Submitted manually.",
      occurredAt,
    });

    expect(applicationUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "applied",
        appliedAt: occurredAt,
        followUpAt: new Date("2026-06-23T12:30:00.000Z"),
      }),
    }));
    expect(suppressionMock).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: "app_1",
      jobProfileMatchId: "match_1",
      source: "mark_applied",
      reason: "applied",
    }));
    expect(reconcileMock).toHaveBeenCalledWith({
      applicationId: "app_1",
      source: "mark_applied",
      useTransitions: true,
    });
  });

  it("returns the existing event when an idempotency key has already been used", async () => {
    const existingEvent = {
      id: "event_existing",
      applicationId: "app_1",
      type: "status_changed",
      source: "api",
      actorType: "user",
      actorId: null,
      requestId: "req_1",
      idempotencyKey: "idem_1",
      beforeJson: {},
      afterJson: {},
      entityVersion: 3,
      payload: {},
      createdAt: new Date("2026-06-16T12:00:00.000Z"),
    } as Awaited<ReturnType<typeof prisma.applicationEvent.findFirst>>;
    eventFindFirstMock.mockResolvedValue(existingEvent);
    applicationFindUniqueMock.mockResolvedValue(applicationFixture({ status: "applied", version: 3 }));

    const result = await transitionApplicationState({
      applicationId: "app_1",
      toStatus: "applied",
      source: "api",
      actor: { type: "user" },
      reason: "Duplicate request.",
      idempotencyKey: "idem_1",
    });

    expect(result.event.id).toBe("event_existing");
    expect(result.sideEffects.idempotent).toBe(true);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(applicationUpdateMock).not.toHaveBeenCalled();
  });

  it("soft archives applications without deleting history", async () => {
    const before = applicationFixture({ status: "ready_to_apply", version: 8 });
    applicationFindUniqueMock.mockResolvedValue(before);
    applicationUpdateMock.mockResolvedValue({ ...before, status: "archived", followUpAt: null, version: 9 } as Application);

    await transitionApplicationState({
      applicationId: "app_1",
      toStatus: "archived",
      source: "apply_sprint_delete",
      actor: { type: "user" },
      reason: "Archived from Apply Sprint.",
      note: "Archived from Apply Sprint as not a good fit.",
      sideEffects: { syncPacket: false, refreshOutcomeCalibration: false },
    });

    expect(applicationUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "app_1" },
      data: expect.objectContaining({
        status: "archived",
        followUpAt: null,
        notes: "Archived from Apply Sprint as not a good fit.",
      }),
    }));
    expect(eventCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        source: "apply_sprint_delete",
        beforeJson: expect.objectContaining({ status: "ready_to_apply", version: 8 }),
        afterJson: expect.objectContaining({ status: "archived", version: 9 }),
      }),
    }));
  });
});

function applicationFixture(input: {
  status: JobMatchStatus;
  approvedAt?: Date | null;
  appliedAt?: Date | null;
  followUpAt?: Date | null;
  notes?: string | null;
  version: number;
}) {
  const now = new Date("2026-06-16T11:00:00.000Z");
  return {
    id: "app_1",
    userId: "user_1",
    jobPostingId: "job_1",
    jobProfileMatchId: "match_1",
    status: input.status,
    approvedAt: input.approvedAt ?? null,
    appliedAt: input.appliedAt ?? null,
    followUpAt: input.followUpAt ?? null,
    notes: input.notes ?? null,
    resumeId: "resume_1",
    coverLetterId: "cover_letter_1",
    sourceContactId: null,
    autoSubmitOverride: null,
    version: input.version,
    jobPosting: {
      id: "job_1",
      company: "Acme",
      title: "Senior Engineer",
      location: "Remote",
      duplicateGroupId: null,
    },
    createdAt: now,
    updatedAt: now,
  };
}
