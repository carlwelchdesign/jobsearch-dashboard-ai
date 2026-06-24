import { describe, expect, it } from "vitest";
import { getApplyWorkspacePrimaryAction, selectCanonicalApplicationForJob } from "./apply-workspace";

describe("selectCanonicalApplicationForJob", () => {
  it("prefers the material-bearing application over a newer empty approved tracker", () => {
    const canonical = selectCanonicalApplicationForJob([
      {
        id: "empty_newer",
        status: "approved",
        resumeId: null,
        coverLetterId: null,
        createdAt: "2026-06-24T20:00:00.000Z",
        updatedAt: "2026-06-24T20:30:00.000Z",
      },
      {
        id: "with_materials",
        status: "approved",
        resumeId: "resume_1",
        coverLetterId: "letter_1",
        applicationPackets: [{ status: "NEEDS_REVIEW", updatedAt: "2026-06-24T20:20:00.000Z" }],
        createdAt: "2026-06-24T19:00:00.000Z",
        updatedAt: "2026-06-24T20:21:00.000Z",
      },
    ]);

    expect(canonical?.id).toBe("with_materials");
  });

  it("does not require ready_to_apply to choose an application", () => {
    const canonical = selectCanonicalApplicationForJob([
      {
        id: "approved_with_materials",
        status: "approved",
        resumeId: "resume_1",
        coverLetterId: "letter_1",
        createdAt: "2026-06-24T19:00:00.000Z",
        updatedAt: "2026-06-24T20:00:00.000Z",
      },
    ]);

    expect(canonical?.id).toBe("approved_with_materials");
  });

  it("prefers ready_to_apply when material completeness is otherwise tied", () => {
    const canonical = selectCanonicalApplicationForJob([
      {
        id: "approved",
        status: "approved",
        resumeId: "resume_1",
        coverLetterId: "letter_1",
        createdAt: "2026-06-24T19:00:00.000Z",
        updatedAt: "2026-06-24T21:00:00.000Z",
      },
      {
        id: "ready",
        status: "ready_to_apply",
        resumeId: "resume_2",
        coverLetterId: "letter_2",
        createdAt: "2026-06-24T18:00:00.000Z",
        updatedAt: "2026-06-24T20:00:00.000Z",
      },
    ]);

    expect(canonical?.id).toBe("ready");
  });
});

describe("getApplyWorkspacePrimaryAction", () => {
  const base = {
    applicationId: "app_1",
    jobPostingId: "job_1",
    applicationStatus: "approved",
    appliedAt: null,
    hasResume: true,
    hasCoverLetter: true,
    packetStatus: "NEEDS_REVIEW",
    qaIssueCount: 0,
    canApprovePacket: false,
    assistantLaunched: false,
    hasAppliedOutcome: false,
  };

  it("asks the user to prepare the packet when materials are missing", () => {
    expect(getApplyWorkspacePrimaryAction({ ...base, hasResume: false }).kind).toBe("prepare_packet");
  });

  it("asks the user to review QA items before approval", () => {
    expect(getApplyWorkspacePrimaryAction({ ...base, qaIssueCount: 2 }).kind).toBe("review_packet");
  });

  it("asks the user to approve a clean packet", () => {
    expect(getApplyWorkspacePrimaryAction({ ...base, canApprovePacket: true }).kind).toBe("approve_packet");
  });

  it("launches the assistant after approval while preserving manual submission", () => {
    const action = getApplyWorkspacePrimaryAction({
      ...base,
      applicationStatus: "ready_to_apply",
      packetStatus: "APPROVED",
    });

    expect(action.kind).toBe("launch_assistant");
    expect(action.detail).toContain("Final submission stays manual");
  });

  it("tracks outcomes after the application is submitted", () => {
    expect(getApplyWorkspacePrimaryAction({ ...base, appliedAt: new Date("2026-06-24T22:00:00.000Z") }).kind).toBe("track_outcome");
  });
});
