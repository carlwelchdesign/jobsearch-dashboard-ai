import type { MaterialClaimArtifactType, MaterialClaimStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ClaimDraft = {
  text: string;
  status: MaterialClaimStatus;
  sourceEvidenceIds?: string[];
  sourceRefs?: unknown[];
  reviewJson?: Record<string, unknown>;
  agentRunId?: string | null;
};

export type MaterialClaimGateInput = {
  artifactType: MaterialClaimArtifactType;
  artifactId: string;
};

export async function syncMaterialClaimsForResume(resumeId: string) {
  const resume = await prisma.generatedResume.findUnique({
    where: { id: resumeId },
    select: { id: true, userId: true, generationNotes: true },
  });
  if (!resume) throw new Error("Generated resume not found.");
  return replaceArtifactClaims({
    userId: resume.userId,
    artifactType: "GENERATED_RESUME",
    artifactId: resume.id,
    claims: claimsFromMaterialNotes(resume.generationNotes, "generated_resume"),
  });
}

export async function syncMaterialClaimsForCoverLetter(coverLetterId: string) {
  const coverLetter = await prisma.generatedCoverLetter.findUnique({
    where: { id: coverLetterId },
    select: { id: true, userId: true, generationNotes: true },
  });
  if (!coverLetter) throw new Error("Generated cover letter not found.");
  return replaceArtifactClaims({
    userId: coverLetter.userId,
    artifactType: "GENERATED_COVER_LETTER",
    artifactId: coverLetter.id,
    claims: claimsFromMaterialNotes(coverLetter.generationNotes, "generated_cover_letter"),
  });
}

export async function syncMaterialClaimsForLinkedInDraft(draftId: string) {
  const draft = await prisma.linkedInPostDraft.findUnique({
    where: { id: draftId },
    select: { id: true, userId: true, claims: true, agentRunId: true },
  });
  if (!draft) throw new Error("LinkedIn draft not found.");
  return replaceArtifactClaims({
    userId: draft.userId,
    artifactType: "LINKEDIN_POST_DRAFT",
    artifactId: draft.id,
    claims: claimsFromLinkedInDraft(draft.claims, draft.agentRunId),
  });
}

export async function materialClaimGate(input: MaterialClaimGateInput) {
  const claims = await prisma.materialClaim.findMany({
    where: { artifactType: input.artifactType, artifactId: input.artifactId },
    orderBy: { createdAt: "asc" },
  });
  const unsupportedClaims = claims.filter((claim) => claim.status === "UNSUPPORTED");
  return {
    canApprove: unsupportedClaims.length === 0,
    reason: unsupportedClaims.length
      ? `Resolve ${unsupportedClaims.length} unsupported claim${unsupportedClaims.length === 1 ? "" : "s"} before approval.`
      : "No unsupported claims are recorded.",
    claims,
    unsupportedClaims,
  };
}

export async function applicationPacketClaimGate(applicationId: string) {
  const packet = await prisma.applicationPacket.findUnique({
    where: { applicationId },
    select: {
      id: true,
      generatedResumeId: true,
      generatedCoverLetterId: true,
      applicationAnswersJson: true,
    },
  });
  if (!packet) throw new Error("Application packet not found.");

  if (packet.generatedResumeId) await syncMaterialClaimsForResume(packet.generatedResumeId);
  if (packet.generatedCoverLetterId) await syncMaterialClaimsForCoverLetter(packet.generatedCoverLetterId);
  await syncMaterialClaimsForApplicationPacket(applicationId);

  const artifactFilters = [
    { artifactType: "APPLICATION_PACKET" as const, artifactId: packet.id },
    ...(packet.generatedResumeId ? [{ artifactType: "GENERATED_RESUME" as const, artifactId: packet.generatedResumeId }] : []),
    ...(packet.generatedCoverLetterId ? [{ artifactType: "GENERATED_COVER_LETTER" as const, artifactId: packet.generatedCoverLetterId }] : []),
  ];
  const claims = await prisma.materialClaim.findMany({
    where: { OR: artifactFilters },
    orderBy: [{ status: "desc" }, { createdAt: "asc" }],
  });
  const unsupportedClaims = claims.filter((claim) => claim.status === "UNSUPPORTED");
  return {
    canApprove: unsupportedClaims.length === 0,
    reason: unsupportedClaims.length
      ? `Resolve ${unsupportedClaims.length} unsupported claim${unsupportedClaims.length === 1 ? "" : "s"} before approving this packet.`
      : "No unsupported packet claims are recorded.",
    claims,
    unsupportedClaims,
  };
}

async function syncMaterialClaimsForApplicationPacket(applicationId: string) {
  const packet = await prisma.applicationPacket.findUnique({
    where: { applicationId },
    select: { id: true, userId: true, applicationAnswersJson: true, qualityReviewJson: true },
  });
  if (!packet) throw new Error("Application packet not found.");
  return replaceArtifactClaims({
    userId: packet.userId,
    artifactType: "APPLICATION_PACKET",
    artifactId: packet.id,
    claims: [
      ...claimsFromMaterialNotes(packet.qualityReviewJson, "application_packet"),
      ...claimsFromApplicationAnswers(packet.applicationAnswersJson),
    ],
  });
}

async function replaceArtifactClaims(input: {
  userId: string;
  artifactType: MaterialClaimArtifactType;
  artifactId: string;
  claims: ClaimDraft[];
}) {
  const claims = uniqueClaims(input.claims);
  await prisma.$transaction([
    prisma.materialClaim.deleteMany({
      where: { artifactType: input.artifactType, artifactId: input.artifactId },
    }),
    ...(claims.length
      ? [prisma.materialClaim.createMany({
          data: claims.map((claim) => ({
            userId: input.userId,
            artifactType: input.artifactType,
            artifactId: input.artifactId,
            text: claim.text,
            status: claim.status,
            sourceEvidenceIds: (claim.sourceEvidenceIds ?? []) as Prisma.InputJsonValue,
            sourceRefs: (claim.sourceRefs ?? []) as Prisma.InputJsonValue,
            reviewJson: (claim.reviewJson ?? {}) as Prisma.InputJsonValue,
            agentRunId: claim.agentRunId ?? null,
          })),
        })]
      : []),
  ]);
  return prisma.materialClaim.findMany({
    where: { artifactType: input.artifactType, artifactId: input.artifactId },
    orderBy: { createdAt: "asc" },
  });
}

function claimsFromMaterialNotes(value: unknown, source: string): ClaimDraft[] {
  const notes = objectValue(value);
  const qa = objectValue(notes?.applicationQa) ?? notes;
  const claims: ClaimDraft[] = [];

  for (const text of stringArray(notes?.unsupportedClaimsDetected)) {
    claims.push({ text, status: "UNSUPPORTED", reviewJson: { source, reason: "unsupported_claim_detected" } });
  }
  for (const text of stringArray(qa?.unsupportedClaims)) {
    claims.push({ text, status: "UNSUPPORTED", reviewJson: { source, reason: "application_qa_unsupported_claim" } });
  }
  for (const text of stringArray(qa?.warnings)) {
    claims.push({ text, status: "NEEDS_REVIEW", reviewJson: { source, reason: "application_qa_warning" } });
  }
  for (const text of stringArray(qa?.styleViolations)) {
    claims.push({ text, status: "NEEDS_REVIEW", reviewJson: { source, reason: "application_qa_style_violation" } });
  }
  for (const evidenceRef of stringArray(qa?.evidenceRefs)) {
    claims.push({
      text: `Evidence reference: ${evidenceRef}`,
      status: "SUPPORTED",
      sourceEvidenceIds: [evidenceRef],
      sourceRefs: [{ type: "evidenceRef", id: evidenceRef }],
      reviewJson: { source, reason: "application_qa_evidence_ref" },
    });
  }
  for (const selection of objectArray(notes?.selectedExperienceBullets)) {
    const bulletId = stringValue(selection.bulletId);
    claims.push({
      text: stringValue(selection.text) || (bulletId ? `Selected experience bullet ${bulletId}` : "Selected experience bullet"),
      status: "SUPPORTED",
      sourceRefs: [{ type: "experienceBullet", id: bulletId }],
      reviewJson: { source, reason: "selected_experience_bullet" },
    });
  }
  return claims;
}

function claimsFromLinkedInDraft(value: unknown, agentRunId?: string | null): ClaimDraft[] {
  const claims: ClaimDraft[] = [];
  for (const claim of objectArray(value)) {
    const text = stringValue(claim.text);
    if (!text) continue;
    claims.push({
      text,
      status: stringValue(claim.status) === "ungrounded" ? "UNSUPPORTED" : "SUPPORTED",
      sourceRefs: [{ type: "linkedinDraftClaim", provenance: stringValue(claim.provenance) }],
      reviewJson: { source: "linkedin_post_draft", provenance: stringValue(claim.provenance), originalStatus: stringValue(claim.status) },
      agentRunId,
    });
  }
  return claims;
}

function claimsFromApplicationAnswers(value: unknown): ClaimDraft[] {
  return objectArray(value).flatMap((entry) => {
    const question = stringValue(entry.question);
    const options = objectArray(entry.options);
    return options.map((option) => ({
      text: `${question || "Application answer"}: ${stringValue(option.answer).slice(0, 220)}`,
      status: stringArray(option.cautions).length ? "NEEDS_REVIEW" as const : "SUPPORTED" as const,
      sourceRefs: stringArray(option.evidence).map((item) => ({ type: "answerEvidence", value: item })),
      reviewJson: { source: "application_answer", cautions: stringArray(option.cautions) },
    }));
  });
}

function uniqueClaims(claims: ClaimDraft[]) {
  const seen = new Set<string>();
  const result: ClaimDraft[] = [];
  for (const claim of claims) {
    const text = cleanText(claim.text);
    if (!text) continue;
    const key = `${claim.status}:${text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...claim, text });
  }
  return result;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 1000);
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(objectValue(item))) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => stringValue(item)).filter(Boolean) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
