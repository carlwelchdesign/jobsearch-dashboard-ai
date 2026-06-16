import { beforeEach, describe, expect, it, vi } from "vitest";
import { approveApplicationPacket } from "@/lib/applications/application-packets";
import { prisma } from "@/lib/prisma";
import { applicationPacketClaimGate } from "@/lib/trust/material-claims";

vi.mock("@/lib/evidence/ingest", () => ({
  syncApprovedApplicationPacketEvidence: vi.fn(),
}));

vi.mock("@/lib/trust/material-claims", () => ({
  applicationPacketClaimGate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: { findUnique: vi.fn() },
    applicationPacket: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    resumeProfile: { findFirst: vi.fn() },
    recruiterOutreach: { findFirst: vi.fn() },
    agentRun: { findFirst: vi.fn() },
  },
}));

const applicationFindUniqueMock = vi.mocked(prisma.application.findUnique);
const packetFindUniqueMock = vi.mocked(prisma.applicationPacket.findUnique);
const packetUpsertMock = vi.mocked(prisma.applicationPacket.upsert);
const packetUpdateMock = vi.mocked(prisma.applicationPacket.update);
const resumeProfileFindFirstMock = vi.mocked(prisma.resumeProfile.findFirst);
const recruiterOutreachFindFirstMock = vi.mocked(prisma.recruiterOutreach.findFirst);
const agentRunFindFirstMock = vi.mocked(prisma.agentRun.findFirst);
const claimGateMock = vi.mocked(applicationPacketClaimGate);

describe("approveApplicationPacket claim gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applicationFindUniqueMock.mockResolvedValue(applicationFixture() as never);
    resumeProfileFindFirstMock.mockResolvedValue(null as never);
    recruiterOutreachFindFirstMock.mockResolvedValue(null as never);
    agentRunFindFirstMock.mockResolvedValue(null as never);
    packetUpsertMock.mockResolvedValue({ id: "packet_1" } as never);
    packetFindUniqueMock
      .mockResolvedValueOnce({ applicationAnswersJson: [], status: "DRAFT" } as never)
      .mockResolvedValueOnce(approvalReadyPacket() as never);
    packetUpdateMock.mockResolvedValue({ ...approvalReadyPacket(), status: "APPROVED" } as never);
    claimGateMock.mockResolvedValue({ canApprove: true, reason: "No unsupported packet claims are recorded.", claims: [], unsupportedClaims: [] } as never);
  });

  it("approves packets when QA and claim gates pass", async () => {
    const result = await approveApplicationPacket("app_1");

    expect(claimGateMock).toHaveBeenCalledWith("app_1");
    expect(packetUpdateMock).toHaveBeenCalledWith({ where: { applicationId: "app_1" }, data: { status: "APPROVED" } });
    expect(result.message).toContain("approved");
  });

  it("blocks packets with unsupported related claims", async () => {
    claimGateMock.mockResolvedValue({ canApprove: false, reason: "Resolve 1 unsupported claim before approving this packet.", claims: [], unsupportedClaims: [{ id: "claim_1" }] } as never);

    await expect(approveApplicationPacket("app_1")).rejects.toThrow("Resolve 1 unsupported claim");

    expect(packetUpdateMock).not.toHaveBeenCalled();
  });
});

function applicationFixture() {
  return {
    id: "app_1",
    userId: "user_1",
    jobPostingId: "job_1",
    status: "ready_to_apply",
    resumeId: "resume_1",
    coverLetterId: "letter_1",
    user: { id: "user_1" },
    jobPosting: { id: "job_1", title: "Senior Engineer", company: "Acme" },
    resume: {
      id: "resume_1",
      markdown: "# Resume",
      plainText: "Resume",
      generationNotes: { applicationQa: { status: "PASS", evidenceRefs: ["ev_1"] } },
    },
    coverLetter: {
      id: "letter_1",
      body: "Cover letter",
      generationNotes: { applicationQa: { status: "PASS", evidenceRefs: ["ev_1"] } },
    },
  };
}

function approvalReadyPacket() {
  return {
    id: "packet_1",
    applicationId: "app_1",
    status: "DRAFT",
    tailoredResumeContent: "Resume",
    coverLetterContent: "Cover letter",
    qualityReviewJson: { status: "PASS" },
  };
}
