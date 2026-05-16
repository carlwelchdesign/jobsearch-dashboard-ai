import { prisma } from "@/lib/prisma";

export type JolenePageContext = {
  routeType: string;
  contextPath: string;
  summary: string;
  data: Record<string, unknown>;
  suggestedActions: JoleneSuggestedAction[];
};

export type JoleneSuggestedAction = {
  label: string;
  href?: string;
  method?: "GET" | "POST";
  description: string;
};

export async function buildJolenePageContext(contextPath: string): Promise<JolenePageContext> {
  const pathname = normalizeContextPath(contextPath);

  if (pathname === "/" || pathname === "/dashboard") return buildDashboardContext(pathname);
  if (pathname === "/jobs") return buildJobsListContext(pathname);
  if (pathname.startsWith("/jobs/")) return buildJobContext(pathname);
  if (pathname === "/applications" || pathname === "/applications/assistant") return buildApplicationsContext(pathname);
  if (pathname.startsWith("/applications/")) return buildApplicationContext(pathname);
  if (pathname === "/needs-me") return buildNeedsMeContext(pathname);
  if (pathname === "/settings") return buildSettingsContext(pathname);

  return {
    routeType: "general",
    contextPath: pathname,
    summary: "General Job Search OS page. Jolene can answer workflow questions, explain the current section, and suggest where to go next.",
    data: {},
    suggestedActions: [
      { label: "Open Command Center", href: "/dashboard", description: "Review the most important jobs, blockers, packets, and search activity." },
      { label: "Review Jobs", href: "/jobs", description: "Inspect scored jobs and decide which ones should move forward." },
    ],
  };
}

export function formatJoleneContextForPrompt(context: JolenePageContext) {
  return JSON.stringify(
    {
      routeType: context.routeType,
      contextPath: context.contextPath,
      summary: context.summary,
      data: context.data,
      suggestedActions: context.suggestedActions,
    },
    null,
    2,
  );
}

function normalizeContextPath(contextPath: string) {
  if (!contextPath || contextPath === "undefined") return "/dashboard";
  try {
    const url = new URL(contextPath, "http://local");
    return url.pathname || "/dashboard";
  } catch {
    return contextPath.startsWith("/") ? contextPath.split("?")[0] || "/dashboard" : "/dashboard";
  }
}

async function buildDashboardContext(contextPath: string): Promise<JolenePageContext> {
  const [latestRun, needsMeCount, jobCounts, applicationCounts, packetsNeedingReview] = await Promise.all([
    prisma.jobSearchRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.agentUserRequest.count({ where: { status: "OPEN" } }),
    prisma.jobProfileMatch.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.application.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.applicationPacket.count({ where: { status: { in: ["DRAFT", "NEEDS_REVIEW"] } } }),
  ]);

  return {
    routeType: "dashboard",
    contextPath,
    summary: "Command Center overview with live search state, jobs needing decisions, application blockers, packets, and pipeline health.",
    data: {
      latestSearchRun: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            triggeredBy: latestRun.triggeredBy,
            startedAt: latestRun.startedAt,
            finishedAt: latestRun.finishedAt,
            jobsFetched: latestRun.jobsFetched,
            jobsAfterDedupe: latestRun.jobsAfterDedupe,
            jobsSaved: latestRun.jobsSaved,
            progress: latestRun.progress,
            errors: latestRun.errors,
          }
        : null,
      needsMeCount,
      packetsNeedingReview,
      jobCounts: countsByStatus(jobCounts),
      applicationCounts: countsByStatus(applicationCounts),
    },
    suggestedActions: [
      { label: "Resolve blockers", href: "/needs-me", description: "Answer questions that are preventing agents from finishing work." },
      { label: "Review job queue", href: "/jobs", description: "Approve, reject, or save newly scored jobs." },
      { label: "Open Apply Sprint", href: "/applications/assistant", description: "Launch application work for approved packets." },
    ],
  };
}

async function buildJobsListContext(contextPath: string): Promise<JolenePageContext> {
  const [matches, topJobs] = await Promise.all([
    prisma.jobProfileMatch.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.jobProfileMatch.findMany({
      include: {
        jobPosting: { select: { id: true, title: true, company: true, location: true, remoteType: true, applicationUrl: true } },
        jobSearchProfile: { select: { id: true, name: true } },
      },
      orderBy: [{ overallScore: "desc" }, { createdAt: "desc" }],
      take: 8,
    }),
  ]);

  return {
    routeType: "jobs_list",
    contextPath,
    summary: "Jobs review queue. This page is for searching by signals, inspecting scored matches, and approving or rejecting roles.",
    data: {
      matchCounts: countsByStatus(matches),
      topJobs: topJobs.map((match) => ({
        jobId: match.jobPostingId,
        title: match.jobPosting.title,
        company: match.jobPosting.company,
        location: match.jobPosting.location,
        remoteType: match.jobPosting.remoteType,
        matchedProfile: match.jobSearchProfile.name,
        status: match.status,
        overallScore: match.overallScore,
        strongestMatches: match.strongestMatches,
        concerns: match.concerns,
        missingKeywords: match.missingKeywords,
        recommendedAction: match.recommendedAction,
      })),
    },
    suggestedActions: [
      { label: "Run search", href: "/dashboard", description: "Start or monitor the live job search run from the Command Center." },
      { label: "Tune settings", href: "/settings", description: "Adjust cron, email, automation, and source settings." },
    ],
  };
}

async function buildJobContext(contextPath: string): Promise<JolenePageContext> {
  const id = contextPath.split("/").filter(Boolean)[1];
  const job = id
    ? await prisma.jobPosting.findUnique({
        where: { id },
        include: {
          evaluations: {
            include: { jobSearchProfile: { select: { id: true, name: true } } },
            orderBy: { fitScore: "desc" },
            take: 3,
          },
          matches: {
            include: { jobSearchProfile: { select: { id: true, name: true } } },
            orderBy: { overallScore: "desc" },
            take: 3,
          },
          applications: { select: { id: true, status: true, approvedAt: true, appliedAt: true }, take: 3 },
          source: { select: { name: true, type: true } },
        },
      })
    : null;

  if (!job) {
    return {
      routeType: "job_detail",
      contextPath,
      summary: "Job detail page, but this job was not found in the local database.",
      data: { jobId: id },
      suggestedActions: [{ label: "Back to Jobs", href: "/jobs", description: "Return to the job review queue." }],
    };
  }

  const bestMatch = job.matches[0] ?? null;
  const bestEvaluation = job.evaluations[0] ?? null;

  return {
    routeType: "job_detail",
    contextPath,
    summary: `${job.title} at ${job.company}. Jolene can explain why this job is shown, what evidence supports it, and what to do next.`,
    data: {
      job: {
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        remoteType: job.remoteType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        applicationUrl: job.applicationUrl,
        source: job.source,
        staleScore: job.staleScore,
        firstSeenAt: job.firstSeenAt,
        lastSeenAt: job.lastSeenAt,
        descriptionExcerpt: excerpt(job.description, 1200),
      },
      bestMatch: bestMatch
        ? {
            status: bestMatch.status,
            profile: bestMatch.jobSearchProfile.name,
            overallScore: bestMatch.overallScore,
            titleFit: bestMatch.titleFit,
            skillFit: bestMatch.skillFit,
            seniorityFit: bestMatch.seniorityFit,
            industryFit: bestMatch.industryFit,
            compensationFit: bestMatch.compensationFit,
            remoteFit: bestMatch.remoteFit,
            strongestMatches: bestMatch.strongestMatches,
            concerns: bestMatch.concerns,
            missingKeywords: bestMatch.missingKeywords,
            recommendedAction: bestMatch.recommendedAction,
            explanation: bestMatch.aiExplanation,
          }
        : null,
      bestEvaluation: bestEvaluation
        ? {
            profile: bestEvaluation.jobSearchProfile.name,
            fitScore: bestEvaluation.fitScore,
            opportunityScore: bestEvaluation.opportunityScore,
            confidenceScore: bestEvaluation.confidenceScore,
            recommendedAction: bestEvaluation.recommendedAction,
            recommendedResumeProfile: bestEvaluation.recommendedResumeProfile,
            strengths: bestEvaluation.strengths,
            risks: bestEvaluation.risks,
            missingKeywords: bestEvaluation.missingKeywords,
            evidenceRefs: bestEvaluation.evidenceRefs,
            explanation: bestEvaluation.explanation,
          }
        : null,
      applications: job.applications,
    },
    suggestedActions: [
      { label: "Approve job", method: "POST", href: `/api/jobs/${job.id}/approve`, description: "Move this job into the application workflow." },
      { label: "Reject job", method: "POST", href: `/api/jobs/${job.id}/reject`, description: "Remove this job from active review." },
      { label: "Prepare packet", method: "POST", href: `/api/jobs/${job.id}/prepare-application`, description: "Generate the application packet when the job is approved." },
    ],
  };
}

async function buildApplicationsContext(contextPath: string): Promise<JolenePageContext> {
  const [applications, blockers] = await Promise.all([
    prisma.application.findMany({
      include: {
        jobPosting: { select: { title: true, company: true } },
        applicationPackets: { select: { status: true }, take: 1 },
        emailMessages: {
          where: { classification: "AUTOMATED_CONFIRMATION" },
          orderBy: { receivedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
    }),
    prisma.agentUserRequest.count({ where: { status: "OPEN" } }),
  ]);

  return {
    routeType: contextPath === "/applications/assistant" ? "apply_sprint" : "applications",
    contextPath,
    summary: contextPath === "/applications/assistant"
      ? "Apply Sprint page for launching controlled application automation and handling blockers."
      : "Applications tracker showing approved, active, submitted, and outcome-bearing applications.",
    data: {
      openBlockers: blockers,
      recentApplications: applications.map((application) => ({
        id: application.id,
        status: application.status,
        job: application.jobPosting,
        packetStatus: application.applicationPackets[0]?.status ?? null,
        approvedAt: application.approvedAt,
        appliedAt: application.appliedAt,
        receivedConfirmation: application.emailMessages[0]
          ? {
              subject: application.emailMessages[0].subject,
              from: application.emailMessages[0].from,
              receivedAt: application.emailMessages[0].receivedAt,
            }
          : null,
      })),
    },
    suggestedActions: [
      { label: "Handle blockers", href: "/needs-me", description: "Resolve questions that stop agents from completing application work." },
      { label: "Review jobs", href: "/jobs", description: "Approve more jobs for the application pipeline." },
    ],
  };
}

async function buildApplicationContext(contextPath: string): Promise<JolenePageContext> {
  const id = contextPath.split("/").filter(Boolean)[1];
  const application = id
    ? await prisma.application.findUnique({
        where: { id },
        include: {
          jobPosting: { select: { id: true, title: true, company: true, location: true, applicationUrl: true, remoteType: true } },
          applicationPackets: { orderBy: { updatedAt: "desc" }, take: 1 },
          agentUserRequests: { where: { status: "OPEN" }, take: 10 },
          automationRuns: { orderBy: { createdAt: "desc" }, take: 5 },
          outcomes: { orderBy: { occurredAt: "desc" }, take: 5 },
        },
      })
    : null;

  if (!application) {
    return {
      routeType: "application_detail",
      contextPath,
      summary: "Application detail page, but this application was not found in the local database.",
      data: { applicationId: id },
      suggestedActions: [{ label: "Back to Applications", href: "/applications", description: "Return to the applications tracker." }],
    };
  }

  return {
    routeType: "application_detail",
    contextPath,
    summary: `${application.jobPosting.title} at ${application.jobPosting.company}. Jolene can explain application status, blockers, packet quality, and next steps.`,
    data: {
      application: {
        id: application.id,
        status: application.status,
        approvedAt: application.approvedAt,
        appliedAt: application.appliedAt,
        followUpAt: application.followUpAt,
        notes: application.notes,
      },
      job: application.jobPosting,
      latestPacket: application.applicationPackets[0]
        ? {
            id: application.applicationPackets[0].id,
            status: application.applicationPackets[0].status,
            hasResume: Boolean(application.applicationPackets[0].tailoredResumeContent),
            hasCoverLetter: Boolean(application.applicationPackets[0].coverLetterContent),
            qualityReviewJson: application.applicationPackets[0].qualityReviewJson,
            evidenceRefs: application.applicationPackets[0].evidenceRefs,
          }
        : null,
      openRequests: application.agentUserRequests.map((request) => ({
        id: request.id,
        type: request.type,
        question: request.question,
        createdAt: request.createdAt,
      })),
      automationRuns: application.automationRuns.map((run) => ({
        id: run.id,
        status: run.status,
        currentUrl: run.currentUrl,
        blockerType: run.blockerType,
        blockerMessage: run.blockerMessage,
        actionsJson: run.actionsJson,
        createdAt: run.createdAt,
      })),
      outcomes: application.outcomes,
    },
    suggestedActions: [
      { label: "Open Apply Sprint", href: "/applications/assistant", description: "Continue controlled application automation." },
      { label: "Resolve blockers", href: "/needs-me", description: "Answer open questions for this application." },
    ],
  };
}

async function buildNeedsMeContext(contextPath: string): Promise<JolenePageContext> {
  const requests = await prisma.agentUserRequest.findMany({
    where: { status: "OPEN" },
    include: {
      application: { include: { jobPosting: { select: { title: true, company: true } } } },
      jobPosting: { select: { title: true, company: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  return {
    routeType: "needs_me",
    contextPath,
    summary: "Needs Me queue for questions, blockers, email reviews, application blockers, and follow-up items that require the user's judgment.",
    data: {
      openRequests: requests.map((request) => ({
        id: request.id,
        type: request.type,
        question: request.question,
        contextJson: request.contextJson,
        application: request.application ? { id: request.application.id, job: request.application.jobPosting } : null,
        job: request.jobPosting,
        createdAt: request.createdAt,
      })),
    },
    suggestedActions: [
      { label: "Open Apply Sprint", href: "/applications/assistant", description: "Continue work after blockers are resolved." },
    ],
  };
}

async function buildSettingsContext(contextPath: string): Promise<JolenePageContext> {
  const [searchProfiles, automationSettings, emailConnections] = await Promise.all([
    prisma.jobSearchProfile.findMany({
      select: { id: true, name: true, enabled: true, scheduleEnabled: true, cronExpression: true, minimumMatchScore: true },
      orderBy: { name: "asc" },
      take: 30,
    }),
    prisma.applicationAutomationSettings.findFirst(),
    prisma.emailOAuthConnection.findMany({ select: { provider: true, emailAddress: true, status: true, updatedAt: true }, take: 10 }),
  ]);

  return {
    routeType: "settings",
    contextPath,
    summary: "Settings page for search schedules, email connections, automation gates, company policies, and supporting admin tools.",
    data: {
      searchProfiles,
      automationSettings,
      emailConnections,
      openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
      gmailConfigured: Boolean(process.env.GMAIL_OAUTH_CLIENT_ID && process.env.GMAIL_OAUTH_CLIENT_SECRET),
      outlookConfigured: Boolean(process.env.OUTLOOK_OAUTH_CLIENT_ID && process.env.OUTLOOK_OAUTH_CLIENT_SECRET),
    },
    suggestedActions: [
      { label: "Review search profiles", href: "/profiles", description: "Tune role, location, and signal targeting." },
      { label: "Open Command Center", href: "/dashboard", description: "Return to the main command surface." },
    ],
  };
}

function countsByStatus<T extends { _count: { _all: number } }>(items: T[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const status = String("status" in item ? item.status : "unknown");
    acc[status] = item._count._all;
    return acc;
  }, {});
}

function excerpt(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength).trim()}...` : compact;
}
