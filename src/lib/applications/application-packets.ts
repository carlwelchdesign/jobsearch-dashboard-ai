import type { Application, GeneratedCoverLetter, GeneratedResume, Prisma } from "@prisma/client";
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

  const [resumeProfile, latestOutreach, companyResearchRun, portfolioRun] = await Promise.all([
    findResumeProfileForApplication(application),
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
  });

  return prisma.applicationPacket.upsert({
    where: { applicationId },
    update: packetData,
    create: {
      ...packetData,
      userId: application.userId,
      applicationId: application.id,
      jobPostingId: application.jobPostingId,
    },
  });
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
}: {
  application: Pick<Application, "status" | "resumeId" | "coverLetterId">;
  resume: Pick<GeneratedResume, "id" | "markdown" | "plainText" | "generationNotes"> | null;
  coverLetter: Pick<GeneratedCoverLetter, "id" | "body" | "generationNotes"> | null;
  resumeProfileId?: string | null;
  recruiterMessage?: string | null;
  companyBrief?: string | null;
  projectLinks?: unknown[];
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
    applicationAnswersJson: {},
    recruiterMessage,
    hiringManagerMessage: null,
    companyBrief,
    projectLinks: (projectLinks ?? []) as Prisma.InputJsonValue,
    evidenceRefs: evidenceRefs as Prisma.InputJsonValue,
    qualityReviewJson: (qa ?? {}) as Prisma.InputJsonValue,
    status: packetStatus(application.status, qa),
  };
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

function packetStatus(applicationStatus: Application["status"], qa: Record<string, unknown> | null) {
  if (applicationStatus === "archived") return "ARCHIVED" as const;
  if (["applied", "follow_up_due", "screening", "interviewing", "offer", "rejected_by_company"].includes(applicationStatus)) return "SUBMITTED" as const;
  if (qa?.status === "NEEDS_REVIEW") return "NEEDS_REVIEW" as const;
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
