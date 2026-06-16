import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyReadinessOverride, buildLifecycleReadiness } from "@/lib/readiness/lifecycle";
import { prisma } from "@/lib/prisma";

const readinessState = vi.hoisted(() => ({
  candidateProfileCount: 0,
  evidenceReadyCount: 0,
  evidenceReviewCount: 0,
  latestRun: null as null | { status: string; jobsSaved: number },
  needsReviewCount: 0,
  resumeCount: 0,
  coverLetterCount: 0,
  packetCount: 0,
  readyApplicationCount: 0,
  followUpDueCount: 0,
  openInterviewTaskCount: 0,
  outcomeCount: 0,
  unsupportedClaimCount: 0,
  staleAgentRunCount: 0,
  staleSearchRunCount: 0,
  suppressedJobCount: 0,
  preparedPacketCount: 0,
  resolvedBlockerCount: 0,
  answerMemoryCount: 0,
  overrides: [] as any[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: { count: vi.fn(() => Promise.resolve(readinessState.candidateProfileCount)) },
    candidateEvidence: {
      count: vi.fn((args: any) => Promise.resolve(args.where.confidence === "VERIFIED" ? readinessState.evidenceReadyCount : readinessState.evidenceReviewCount)),
    },
    jobSearchRun: {
      findFirst: vi.fn(() => Promise.resolve(readinessState.latestRun)),
      count: vi.fn(() => Promise.resolve(readinessState.staleSearchRunCount)),
    },
    jobProfileMatch: { count: vi.fn(() => Promise.resolve(readinessState.needsReviewCount)) },
    generatedResume: { count: vi.fn(() => Promise.resolve(readinessState.resumeCount)) },
    generatedCoverLetter: { count: vi.fn(() => Promise.resolve(readinessState.coverLetterCount)) },
    applicationPacket: {
      count: vi.fn((args: any) => Promise.resolve(args.where.status ? readinessState.preparedPacketCount : readinessState.packetCount)),
    },
    application: {
      count: vi.fn((args: any) => Promise.resolve(args.where.status === "ready_to_apply" ? readinessState.readyApplicationCount : readinessState.followUpDueCount)),
    },
    interviewPrepTask: { count: vi.fn(() => Promise.resolve(readinessState.openInterviewTaskCount)) },
    applicationOutcome: { count: vi.fn(() => Promise.resolve(readinessState.outcomeCount)) },
    materialClaim: { count: vi.fn(() => Promise.resolve(readinessState.unsupportedClaimCount)) },
    agentRun: { count: vi.fn(() => Promise.resolve(readinessState.staleAgentRunCount)) },
    jobSuppression: { count: vi.fn(() => Promise.resolve(readinessState.suppressedJobCount)) },
    agentUserRequest: { count: vi.fn(() => Promise.resolve(readinessState.resolvedBlockerCount)) },
    applicationAnswerMemory: { count: vi.fn(() => Promise.resolve(readinessState.answerMemoryCount)) },
    readinessOverride: {
      findMany: vi.fn(() => Promise.resolve(readinessState.overrides)),
      upsert: vi.fn((args: any) => Promise.resolve({ id: "override_1", ...args.create })),
      deleteMany: vi.fn(() => Promise.resolve({ count: 1 })),
    },
  },
}));

describe("lifecycle readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(readinessState, {
      candidateProfileCount: 0,
      evidenceReadyCount: 0,
      evidenceReviewCount: 0,
      latestRun: null,
      needsReviewCount: 0,
      resumeCount: 0,
      coverLetterCount: 0,
      packetCount: 0,
      readyApplicationCount: 0,
      followUpDueCount: 0,
      openInterviewTaskCount: 0,
      outcomeCount: 0,
      unsupportedClaimCount: 0,
      staleAgentRunCount: 0,
      staleSearchRunCount: 0,
      suppressedJobCount: 0,
      preparedPacketCount: 0,
      resolvedBlockerCount: 0,
      answerMemoryCount: 0,
      overrides: [],
    });
  });

  it("computes lifecycle readiness from live system signals", async () => {
    Object.assign(readinessState, {
      candidateProfileCount: 1,
      evidenceReadyCount: 3,
      latestRun: { status: "completed", jobsSaved: 12 },
      needsReviewCount: 2,
      resumeCount: 2,
      coverLetterCount: 1,
      packetCount: 1,
      readyApplicationCount: 4,
      outcomeCount: 1,
      suppressedJobCount: 8,
      preparedPacketCount: 2,
      answerMemoryCount: 5,
    });

    const readiness = await buildLifecycleReadiness({ userId: "user_1" });

    expect(readiness.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "setup.profile", status: "ready" }),
      expect.objectContaining({ key: "review.exceptions", status: "needs_work", count: 2 }),
      expect.objectContaining({ key: "apply.ready", status: "needs_work", count: 4 }),
    ]));
    expect(readiness.nextAction).toMatchObject({ key: "review.exceptions" });
    expect(readiness.valueProof).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "suppressed_jobs", value: 8 }),
      expect.objectContaining({ key: "answers_reused", value: 5 }),
    ]));
  });

  it("applies non-critical overrides as presentation state", async () => {
    readinessState.overrides = [{
      key: "setup.profile",
      status: "MANUAL_READY",
      snoozedUntil: null,
    }];

    const readiness = await buildLifecycleReadiness({ userId: "user_1" });

    expect(readiness.items.find((item) => item.key === "setup.profile")).toMatchObject({
      systemStatus: "needs_work",
      status: "ready",
      overrideStatus: "MANUAL_READY",
    });
  });

  it("does not let trust-critical overrides hide unsupported claims", async () => {
    readinessState.unsupportedClaimCount = 2;
    readinessState.overrides = [{
      key: "trust.unsupported_claims",
      status: "MANUAL_READY",
      snoozedUntil: null,
    }];

    const readiness = await buildLifecycleReadiness({ userId: "user_1" });

    expect(readiness.items.find((item) => item.key === "trust.unsupported_claims")).toMatchObject({
      systemStatus: "blocked",
      status: "blocked",
      overrideStatus: "MANUAL_READY",
    });
  });

  it("ignores expired snoozes", async () => {
    readinessState.overrides = [{
      key: "search.latest_run",
      status: "SNOOZED",
      snoozedUntil: new Date("2020-01-01T00:00:00.000Z"),
    }];

    const readiness = await buildLifecycleReadiness({ userId: "user_1" });

    expect(readiness.items.find((item) => item.key === "search.latest_run")).toMatchObject({
      systemStatus: "needs_work",
      status: "needs_work",
      overrideStatus: "SNOOZED",
    });
  });

  it("persists and resets readiness overrides", async () => {
    await applyReadinessOverride({ userId: "user_1", key: "setup.profile", action: "snooze", note: "Tomorrow" });
    expect(prisma.readinessOverride.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: "SNOOZED", note: "Tomorrow" }),
    }));

    await applyReadinessOverride({ userId: "user_1", key: "setup.profile", action: "reset" });
    expect(prisma.readinessOverride.deleteMany).toHaveBeenCalledWith({ where: { userId: "user_1", key: "setup.profile" } });
  });
});
