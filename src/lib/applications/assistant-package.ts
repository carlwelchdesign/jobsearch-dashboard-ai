import type { Application, Prisma } from "@prisma/client";
import { assessApplicationUrlQuality } from "@/lib/applications/application-url-quality";
import { buildAshbyRiskAssessment } from "@/lib/applications/ashby-risk";
import { evaluateAutoSubmitEligibility } from "@/lib/applications/auto-submit-policy";
import { selectedApplicationAnswers } from "@/lib/applications/application-packets";
import { fieldMemoryForAssistant, findActiveFieldMemories } from "@/lib/applications/field-learning";
import { prisma } from "@/lib/prisma";

type AssistantPackageApplication = Prisma.ApplicationGetPayload<{
  include: {
    coverLetter: true;
    applicationPackets: { orderBy: { updatedAt: "desc" }; take: 1 };
    jobPosting: true;
    resume: true;
    user: { include: { profile: true } };
  };
}>;

export async function findReadyApplicationByUrl(url: string) {
  const target = canonicalUrl(url);
  if (!target) return null;
  const applications = await prisma.application.findMany({
    where: {
      status: "ready_to_apply",
      jobPosting: { applicationUrl: { not: null } },
    },
    include: {
      coverLetter: true,
      applicationPackets: { orderBy: { updatedAt: "desc" }, take: 1 },
      jobPosting: true,
      resume: true,
      user: { include: { profile: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return applications.find((application) => (
    assessApplicationUrlQuality(application.jobPosting.applicationUrl).launchable
    && canonicalUrl(application.jobPosting.applicationUrl) === target
  )) ?? null;
}

export async function applicationAssistantPackageForId(applicationId: string, origin: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      coverLetter: true,
      applicationPackets: { orderBy: { updatedAt: "desc" }, take: 1 },
      jobPosting: true,
      resume: true,
      user: { include: { profile: true } },
    },
  });
  return buildApplicationAssistantPackage(application, origin);
}

export async function buildApplicationAssistantPackage(application: AssistantPackageApplication | null, origin: string) {
  if (!application) {
    return { status: 404, body: { error: "Application not found." } };
  }

  if (application.status !== "ready_to_apply") {
    return {
      status: 400,
      body: { error: "Application must be ready_to_apply before assisted form filling." },
    };
  }

  if (!application.jobPosting.applicationUrl) {
    return { status: 400, body: { error: "This job does not have an application URL." } };
  }
  const applicationUrlQuality = assessApplicationUrlQuality(application.jobPosting.applicationUrl);
  if (!applicationUrlQuality.launchable) {
    return {
      status: 400,
      body: {
        error: `Direct application URL required. ${applicationUrlQuality.reason}`,
        applicationUrlQuality,
      },
    };
  }

  if (!application.resume || !application.coverLetter) {
    return {
      status: 400,
      body: { error: "A generated resume and cover letter are required before assisted form filling." },
    };
  }

  const profile = application.user.profile;
  const fullName = profile?.fullName ?? application.user.name ?? "";
  const [firstName, ...lastNameParts] = fullName.split(/\s+/).filter(Boolean);
  const packet = application.applicationPackets[0];
  const autoSubmit = await evaluateAutoSubmitEligibility(application.id);
  const applicationHost = hostFromUrl(application.jobPosting.applicationUrl);
  const fieldMemories = await findActiveFieldMemories({
    userId: application.userId,
    atsProvider: application.jobPosting.atsProvider,
    host: applicationHost,
    limit: 50,
  });
  const isAshby = application.jobPosting.atsProvider === "ashby" || /(^|\.)ashbyhq\.com$/i.test(applicationHost);
  const selectedAnswers = selectedApplicationAnswers(packet?.applicationAnswersJson);
  const ashbyRisk = buildAshbyRiskAssessment({
    atsProvider: application.jobPosting.atsProvider,
    applicationUrl: application.jobPosting.applicationUrl,
    job: {
      title: application.jobPosting.title,
      company: application.jobPosting.company,
      description: application.jobPosting.description,
      location: application.jobPosting.location,
      country: application.jobPosting.country,
      remoteType: application.jobPosting.remoteType,
    },
    candidate: {
      location: profile?.location,
      yearsExperience: profile?.yearsExperience,
    },
    resumeText: application.resume.plainText ?? application.resume.markdown,
    selectedAnswers,
  });

  return {
    status: 200,
    body: {
      safety: {
        localAssistantOnly: true,
        manualSubmitRequired: isAshby || !autoSubmit.allowed,
        autoSubmitAllowed: isAshby ? false : autoSubmit.allowed,
        autoSubmitReasons: isAshby
          ? ["Ashby applications use normal Chrome assisted fill with manual final submit to avoid anti-fraud friction."]
          : autoSubmit.reasons,
        prohibitedActions: [
          isAshby || !autoSubmit.allowed
            ? "Do not submit the application."
            : "Submit only if the page still has no CAPTCHA, login block, unresolved required fields, or unexpected confirmation screen.",
          "Do not bypass CAPTCHA.",
          "Do not use stealth browser settings.",
          "Do not infer sensitive demographic answers. Only use explicit user-configured settings.",
        ],
        normalBrowserRecommended: isAshby,
      },
      application: {
        id: application.id,
        status: application.status,
        notes: application.notes,
        packetId: packet?.id ?? null,
      },
      job: {
        id: application.jobPosting.id,
        company: application.jobPosting.company,
        title: application.jobPosting.title,
        location: application.jobPosting.location,
        country: application.jobPosting.country,
        remoteType: application.jobPosting.remoteType,
        applicationUrl: application.jobPosting.applicationUrl,
        applicationHost,
        applicationUrlQuality,
      },
      candidate: {
        fullName,
        firstName: firstName ?? "",
        lastName: lastNameParts.join(" "),
        email: profile?.email ?? application.user.email,
        phone: profile?.phone ?? "",
        location: profile?.location ?? "",
        linkedinUrl: profile?.linkedinUrl ?? "",
        githubUrl: profile?.githubUrl ?? "",
        portfolioUrl: profile?.portfolioUrl ?? "",
        demographicAnswers: {
          race: profile?.raceAnswer ?? "",
          gender: profile?.genderAnswer ?? "",
          veteranStatus: profile?.veteranStatusAnswer ?? "",
          disability: profile?.disabilityAnswer ?? "",
        },
      },
      materials: {
        resumeId: application.resume.id,
        resumePdfUrl: `${origin}/api/resumes/generated/${application.resume.id}/pdf`,
        resumePlainTextUrl: `${origin}/api/resumes/generated/${application.resume.id}/plain-text`,
        coverLetterId: application.coverLetter.id,
        coverLetterPdfUrl: `${origin}/api/cover-letters/${application.coverLetter.id}/pdf`,
        coverLetterBody: application.coverLetter.body,
        selectedApplicationAnswers: selectedAnswers,
      },
      learning: {
        fieldMemories: fieldMemories.map(fieldMemoryForAssistant),
      },
      ashbyRisk,
      workflow: {
        fieldByFieldCommands: true,
        eventUrl: `${origin}/api/applications/${application.id}/assistant-workflow/events`,
        commandUrl: `${origin}/api/applications/${application.id}/assistant-workflow/command`,
        commandResultUrl: `${origin}/api/applications/${application.id}/assistant-workflow/command-result`,
        fieldAnswerUrl: `${origin}/api/applications/${application.id}/field-answer`,
      },
    },
  };
}

function canonicalUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    const search = Array.from(url.searchParams.entries())
      .filter(([key]) => !/^utm_|^(gh_src|source)$/i.test(key))
      .sort(([left], [right]) => left.localeCompare(right));
    url.search = "";
    for (const [key, item] of search) url.searchParams.append(key, item);
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/$/, "") || null;
  }
}

function hostFromUrl(url: string | null) {
  if (!url) return "unknown";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export type ApplicationForAssistantPackage = Application;
