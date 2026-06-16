import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applicationPacketClaimGate,
  materialClaimGate,
  syncMaterialClaimsForCoverLetter,
  syncMaterialClaimsForLinkedInDraft,
  syncMaterialClaimsForResume,
} from "@/lib/trust/material-claims";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    generatedResume: { findUnique: vi.fn() },
    generatedCoverLetter: { findUnique: vi.fn() },
    linkedInPostDraft: { findUnique: vi.fn() },
    applicationPacket: { findUnique: vi.fn() },
    materialClaim: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

const transactionMock = vi.mocked(prisma.$transaction);
const resumeFindMock = vi.mocked(prisma.generatedResume.findUnique);
const coverLetterFindMock = vi.mocked(prisma.generatedCoverLetter.findUnique);
const linkedInDraftFindMock = vi.mocked(prisma.linkedInPostDraft.findUnique);
const packetFindMock = vi.mocked(prisma.applicationPacket.findUnique);
const claimDeleteManyMock = vi.mocked(prisma.materialClaim.deleteMany);
const claimCreateManyMock = vi.mocked(prisma.materialClaim.createMany);
const claimFindManyMock = vi.mocked(prisma.materialClaim.findMany);

describe("material claim provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(async (operations: any) => Promise.all(operations) as never);
    claimDeleteManyMock.mockResolvedValue({ count: 0 } as never);
    claimCreateManyMock.mockResolvedValue({ count: 1 } as never);
    claimFindManyMock.mockResolvedValue([] as never);
  });

  it("syncs unsupported and supported resume claims from generation notes", async () => {
    resumeFindMock.mockResolvedValue({
      id: "resume_1",
      userId: "user_1",
      generationNotes: {
        unsupportedClaimsDetected: ["Led a 50-person team"],
        applicationQa: { evidenceRefs: ["evidence_1"] },
        selectedExperienceBullets: [{ bulletId: "bullet_1", text: "Built workflow automation" }],
      },
    } as never);

    await syncMaterialClaimsForResume("resume_1");

    expect(claimCreateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ artifactType: "GENERATED_RESUME", text: "Led a 50-person team", status: "UNSUPPORTED" }),
        expect.objectContaining({ artifactType: "GENERATED_RESUME", text: "Evidence reference: evidence_1", status: "SUPPORTED" }),
        expect.objectContaining({ artifactType: "GENERATED_RESUME", text: "Built workflow automation", status: "SUPPORTED" }),
      ]),
    }));
  });

  it("syncs cover-letter QA warnings as review-needed claims", async () => {
    coverLetterFindMock.mockResolvedValue({
      id: "letter_1",
      userId: "user_1",
      generationNotes: { applicationQa: { warnings: ["Tone is too generic"] } },
    } as never);

    await syncMaterialClaimsForCoverLetter("letter_1");

    expect(claimCreateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ artifactType: "GENERATED_COVER_LETTER", text: "Tone is too generic", status: "NEEDS_REVIEW" }),
      ]),
    }));
  });

  it("syncs ungrounded LinkedIn draft claims as unsupported", async () => {
    linkedInDraftFindMock.mockResolvedValue({
      id: "draft_1",
      userId: "user_1",
      agentRunId: "run_1",
      claims: [{ text: "Thousands of users rely on this", provenance: "missing", status: "ungrounded" }],
    } as never);

    await syncMaterialClaimsForLinkedInDraft("draft_1");

    expect(claimCreateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({
          artifactType: "LINKEDIN_POST_DRAFT",
          text: "Thousands of users rely on this",
          status: "UNSUPPORTED",
          agentRunId: "run_1",
        }),
      ]),
    }));
  });

  it("blocks approval when a material artifact has unsupported claims", async () => {
    claimFindManyMock.mockResolvedValue([{ id: "claim_1", status: "UNSUPPORTED" }] as never);

    const gate = await materialClaimGate({ artifactType: "LINKEDIN_POST_DRAFT", artifactId: "draft_1" });

    expect(gate.canApprove).toBe(false);
    expect(gate.reason).toContain("Resolve 1 unsupported claim");
  });

  it("checks packet, resume, cover-letter, and answer claims before approval", async () => {
    packetFindMock
      .mockResolvedValueOnce({
        id: "packet_1",
        generatedResumeId: "resume_1",
        generatedCoverLetterId: "letter_1",
        applicationAnswersJson: [],
      } as never)
      .mockResolvedValueOnce({
        id: "packet_1",
        userId: "user_1",
        applicationAnswersJson: [{ question: "Why us?", options: [{ answer: "Because of the mission", cautions: ["Too vague"], evidence: [] }] }],
        qualityReviewJson: {},
      } as never);
    resumeFindMock.mockResolvedValue({ id: "resume_1", userId: "user_1", generationNotes: {} } as never);
    coverLetterFindMock.mockResolvedValue({ id: "letter_1", userId: "user_1", generationNotes: {} } as never);
    claimFindManyMock.mockResolvedValue([{ id: "claim_1", status: "UNSUPPORTED" }] as never);

    const gate = await applicationPacketClaimGate("app_1");

    expect(gate.canApprove).toBe(false);
    expect(claimFindManyMock).toHaveBeenLastCalledWith(expect.objectContaining({
      where: {
        OR: [
          { artifactType: "APPLICATION_PACKET", artifactId: "packet_1" },
          { artifactType: "GENERATED_RESUME", artifactId: "resume_1" },
          { artifactType: "GENERATED_COVER_LETTER", artifactId: "letter_1" },
        ],
      },
    }));
  });
});
