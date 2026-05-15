import type { Application, ApplicationPacket, ApplicationPacketStatus, GeneratedCoverLetter, GeneratedResume, Prisma } from "@prisma/client";
import { syncApprovedApplicationPacketEvidence } from "@/lib/evidence/ingest";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";

type PacketMaterialData = Omit<Prisma.ApplicationPacketUncheckedCreateInput, "id" | "userId" | "applicationId" | "jobPostingId" | "createdAt" | "updatedAt">;

export async function syncApplicationPacket(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      coverLetter: true,
      jobPosting: true,
      resume: true,
      user: true,
    },
  });
  if (!application) throw new Error("Application not found.");

  const [resumeProfile, existingPacket, latestOutreach, companyResearchRun, portfolioRun] = await Promise.all([
    findResumeProfileForApplication(application),
    prisma.applicationPacket.findUnique({
      where: { applicationId },
      select: { applicationAnswersJson: true, status: true },
    }),
    prisma.recruiterOutreach.findFirst({
      where: {
        userId: application.userId,
        jobPostingId: application.jobPostingId,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agentRun.findFirst({
      where: {
        agentType: "COMPANY_RESEARCH",
        status: "COMPLETED",
        inputJson: {
          path: ["applicationId"],
          equals: application.id,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agentRun.findFirst({
      where: {
        agentType: "PORTFOLIO_MATCH",
        status: "COMPLETED",
        inputJson: {
          path: ["applicationId"],
          equals: application.id,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const packetData = buildApplicationPacketData({
    application,
    resume: application.resume,
    coverLetter: application.coverLetter,
    resumeProfileId: resumeProfile?.id ?? null,
    recruiterMessage: latestOutreach?.message ?? null,
    companyBrief: companyBriefFromRun(companyResearchRun?.outputJson),
    projectLinks: projectLinksFromRun(portfolioRun?.outputJson),
    applicationAnswersJson: existingPacket?.applicationAnswersJson ?? undefined,
    existingStatus: existingPacket?.status ?? null,
  });

  const packet = await prisma.applicationPacket.upsert({
    where: { applicationId },
    update: packetData,
    create: {
      ...packetData,
      userId: application.userId,
      applicationId: application.id,
      jobPostingId: application.jobPostingId,
    },
  });
  await syncApprovedApplicationPacketEvidence(applicationId);
  return packet;
}

export async function approveApplicationPacket(applicationId: string) {
  await syncApplicationPacket(applicationId);
  const packet = await prisma.applicationPacket.findUnique({
    where: { applicationId },
  });
  if (!packet) throw new Error("Application packet not found.");

  const approval = packetApprovalState(packet);
  if (!approval.canApprove) throw new Error(approval.reason);

  const approved = await prisma.applicationPacket.update({
    where: { applicationId },
    data: { status: "APPROVED" },
  });
  await syncApprovedApplicationPacketEvidence(applicationId);

  return {
    packet: approved,
    message: "Application packet approved. It is now available as approved writing-style evidence.",
  };
}

export async function appendApplicationPacketAnswer(input: {
  applicationId: string;
  question: string;
  generatedBy?: string;
  options: Array<{
    title: string;
    answer: string;
    evidence: string[];
    tone: string;
    cautions: string[];
  }>;
}) {
  await syncApplicationPacket(input.applicationId);
  const packet = await prisma.applicationPacket.findUnique({
    where: { applicationId: input.applicationId },
    select: { applicationAnswersJson: true },
  });
  if (!packet) throw new Error("Application packet not found.");

  const current = applicationAnswerEntries(packet.applicationAnswersJson);
  const entry = {
    id: `answer_${Date.now()}`,
    question: input.question,
    generatedBy: input.generatedBy ?? "unknown",
    options: input.options,
    createdAt: new Date().toISOString(),
  };

  await prisma.applicationPacket.update({
    where: { applicationId: input.applicationId },
    data: {
      applicationAnswersJson: [...current, entry] as Prisma.InputJsonValue,
    },
  });

  return {
    saved: true,
    answerCount: current.length + 1,
    entry,
  };
}

export async function deleteApplicationPacketAnswer(applicationId: string, answerId: string) {
  const packet = await prisma.applicationPacket.findUnique({
    where: { applicationId },
    select: { applicationAnswersJson: true },
  });
  if (!packet) throw new Error("Application packet not found.");

  const current = applicationAnswerEntries(packet.applicationAnswersJson);
  const next = current.filter((entry) => entry.id !== answerId);
  if (next.length === current.length) throw new Error("Saved application answer not found.");

  await prisma.applicationPacket.update({
    where: { applicationId },
    data: {
      applicationAnswersJson: next as Prisma.InputJsonValue,
    },
  });

  return {
    deleted: true,
    answerCount: next.length,
    message: "Saved application answer removed.",
  };
}

export async function backfillApplicationPackets(limit = 200) {
  const applications = await prisma.application.findMany({
    select: { id: true },
    orderBy: { updatedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
  let synced = 0;
  const errors: Array<{ applicationId: string; error: string }> = [];

  for (const application of applications) {
    try {
      await syncApplicationPacket(application.id);
      synced += 1;
    } catch (error) {
      errors.push({
        applicationId: application.id,
        error: error instanceof Error ? error.message : "Unknown packet sync error",
      });
    }
  }

  return {
    scanned: applications.length,
    synced,
    errors,
    message: `Synced ${synced} application packet${synced === 1 ? "" : "s"} from ${applications.length} application${applications.length === 1 ? "" : "s"}.`,
  };
}

export function buildApplicationPacketData({
  application,
  resume,
  coverLetter,
  resumeProfileId,
  recruiterMessage,
  companyBrief,
  projectLinks,
  applicationAnswersJson,
  existingStatus,
}: {
  application: Pick<Application, "status" | "resumeId" | "coverLetterId">;
  resume: Pick<GeneratedResume, "id" | "markdown" | "plainText" | "generationNotes"> | null;
  coverLetter: Pick<GeneratedCoverLetter, "id" | "body" | "generationNotes"> | null;
  resumeProfileId?: string | null;
  recruiterMessage?: string | null;
  companyBrief?: string | null;
  projectLinks?: unknown[];
  applicationAnswersJson?: unknown;
  existingStatus?: ApplicationPacketStatus | null;
}): PacketMaterialData {
  const resumeNotes = materialNotes(resume?.generationNotes);
  const coverLetterNotes = materialNotes(coverLetter?.generationNotes);
  const qa = objectValue(coverLetterNotes.applicationQa) || objectValue(resumeNotes.applicationQa);
  const strategy = objectValue(resumeNotes.resumeStrategy) || objectValue(coverLetterNotes.resumeStrategy);
  const evidenceRefs = Array.from(new Set([
    ...jsonArray(strategy?.evidenceRefs),
    ...jsonArray(qa?.evidenceRefs),
    ...jsonArray(resume?.generationNotes && objectValue(resume.generationNotes)?.selectedExperienceBullets).map((item) => item),
  ]));

  return {
    resumeProfileId,
    generatedResumeId: resume?.id ?? application.resumeId,
    generatedCoverLetterId: coverLetter?.id ?? application.coverLetterId,
    tailoredResumeContent: resume?.plainText ?? resume?.markdown ?? null,
    coverLetterContent: coverLetter?.body ?? null,
    applicationAnswersJson: applicationAnswerEntries(applicationAnswersJson) as Prisma.InputJsonValue,
    recruiterMessage,
    hiringManagerMessage: null,
    companyBrief,
    projectLinks: (projectLinks ?? []) as Prisma.InputJsonValue,
    evidenceRefs: evidenceRefs as Prisma.InputJsonValue,
    qualityReviewJson: (qa ?? {}) as Prisma.InputJsonValue,
    status: packetStatus(application.status, qa, existingStatus),
  };
}

export function packetApprovalState(packet: Pick<ApplicationPacket, "status" | "tailoredResumeContent" | "coverLetterContent" | "qualityReviewJson">) {
  if (packet.status === "APPROVED") return { canApprove: false, reason: "This packet is already approved." };
  if (packet.status === "SUBMITTED") return { canApprove: false, reason: "This packet has already been submitted." };
  if (packet.status === "ARCHIVED") return { canApprove: false, reason: "Archived packets cannot be approved." };
  if (!packet.tailoredResumeContent || !packet.coverLetterContent) {
    return { canApprove: false, reason: "Generate both a tailored resume and cover letter before approving the packet." };
  }

  const qa = objectValue(packet.qualityReviewJson);
  if (packet.status === "NEEDS_REVIEW" || qa?.status === "NEEDS_REVIEW") {
    return { canApprove: false, reason: "Resolve QA review items before approving this packet." };
  }

  return { canApprove: true, reason: "Packet can be approved." };
}

export function packetApprovalChecklist(packet: Pick<ApplicationPacket, "status" | "tailoredResumeContent" | "coverLetterContent" | "qualityReviewJson"> | null | undefined) {
  if (!packet) {
    return [
      { label: "Packet created", complete: false, detail: "Prepare the application package first." },
      { label: "Tailored resume", complete: false, detail: "No resume content has been saved to a packet yet." },
      { label: "Cover letter", complete: false, detail: "No cover letter content has been saved to a packet yet." },
      { label: "QA review", complete: false, detail: "QA has not run for this packet yet." },
    ];
  }

  const qa = objectValue(packet.qualityReviewJson);
  const qaStatus = typeof qa?.status === "string" ? qa.status : null;

  return [
    {
      label: "Packet created",
      complete: true,
      detail: `Current packet status: ${packet.status}.`,
    },
    {
      label: "Tailored resume",
      complete: Boolean(packet.tailoredResumeContent),
      detail: packet.tailoredResumeContent ? "Resume content is attached." : "Generate or sync a tailored resume.",
    },
    {
      label: "Cover letter",
      complete: Boolean(packet.coverLetterContent),
      detail: packet.coverLetterContent ? "Cover letter content is attached." : "Generate or sync a cover letter.",
    },
    {
      label: "QA review",
      complete: packet.status !== "NEEDS_REVIEW" && qaStatus !== "NEEDS_REVIEW",
      detail: qaStatus === "NEEDS_REVIEW" || packet.status === "NEEDS_REVIEW"
        ? "Resolve QA warnings before approval."
        : qaStatus === "PASS"
        ? "QA passed."
        : "No blocking QA issues are recorded.",
    },
  ];
}

export function applicationAnswerEntries(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is {
    id?: string;
    question: string;
    generatedBy?: string;
    options: Array<{
      title: string;
      answer: string;
      evidence: string[];
      tone: string;
      cautions: string[];
    }>;
    createdAt?: string;
  } => {
    if (!item || typeof item !== "object") return false;
    const entry = item as Record<string, unknown>;
    return typeof entry.question === "string" && Array.isArray(entry.options);
  });
}

async function findResumeProfileForApplication(application: {
  userId: string;
  resume: Pick<GeneratedResume, "generationNotes"> | null;
  coverLetter: Pick<GeneratedCoverLetter, "generationNotes"> | null;
}) {
  const resumeNotes = materialNotes(application.resume?.generationNotes);
  const coverLetterNotes = materialNotes(application.coverLetter?.generationNotes);
  const strategy = objectValue(resumeNotes.resumeStrategy) || objectValue(coverLetterNotes.resumeStrategy);
  const recommendedResumeProfile = typeof strategy?.recommendedResumeProfile === "string" ? strategy.recommendedResumeProfile : "";
  if (!recommendedResumeProfile) return null;
  return prisma.resumeProfile.findFirst({
    where: {
      userId: application.userId,
      name: recommendedResumeProfile,
    },
  });
}

function packetStatus(applicationStatus: Application["status"], qa: Record<string, unknown> | null, existingStatus?: ApplicationPacketStatus | null) {
  if (applicationStatus === "archived") return "ARCHIVED" as const;
  if (["applied", "follow_up_due", "screening", "interviewing", "offer", "rejected_by_company"].includes(applicationStatus)) return "SUBMITTED" as const;
  if (qa?.status === "NEEDS_REVIEW") return "NEEDS_REVIEW" as const;
  if (existingStatus === "APPROVED") return "APPROVED" as const;
  return "DRAFT" as const;
}

function materialNotes(value: unknown) {
  return objectValue(value) ?? {};
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function companyBriefFromRun(value: unknown) {
  const output = objectValue(value);
  return typeof output?.brief === "string" ? output.brief : null;
}

function projectLinksFromRun(value: unknown) {
  const output = objectValue(value);
  const links = Array.isArray(output?.projectLinks) ? output.projectLinks : [];
  return links.filter((item) => item && typeof item === "object");
}
