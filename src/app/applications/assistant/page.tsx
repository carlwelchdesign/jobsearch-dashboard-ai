export const metadata = {
  title: "Apply Sprint | Job Search OS",
  description: "Launch and monitor application learning workflows.",
};

import { AppShell } from "@/app/app-shell";
import { LifecycleReadinessContext } from "@/components/readiness/lifecycle-context";
import { PageHeader } from "@/components/ui/page-header";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { summarizeAutomationBlockers } from "@/lib/applications/automation-analytics";
import { recoverStaleApplicationAutomationRuns, syncRunningApplicationAutomationRunsFromLogs } from "@/lib/applications/automation-runs";
import { assessApplicationUrlQuality } from "@/lib/applications/application-url-quality";
import { buildAshbyRiskAssessment } from "@/lib/applications/ashby-risk";
import { reconcileApplicationCanonicalState, visibleCanonicalApplications } from "@/lib/applications/reconciliation";
import { buildApplySprintTrustFunnel } from "@/lib/applications/apply-sprint-funnel";
import { AssistantWorkbench } from "./assistant-workbench";
import { getServiceFallbacks } from "@/lib/service-fallbacks";
import { ServiceFallbackBanners } from "@/components/ui/service-fallback-banners";
import { loadJobSuppressionStatesByUserIds } from "@/lib/jobs/suppression";

export const dynamic = "force-dynamic";

export default async function ApplicationAssistantPage({ searchParams }: { searchParams?: { applicationId?: string } }) {
  await Promise.all([
    reconcileApplicationCanonicalState({ source: "apply_sprint_page" }).catch(() => null),
    syncRunningApplicationAutomationRunsFromLogs(),
    recoverStaleApplicationAutomationRuns(),
  ]);

  const [applications, atsBlockers, latestSearchRun, latestAgencyRun, funnelMatches, funnelApplications] = await Promise.all([
    prisma.application.findMany({
      where: {
        status: "ready_to_apply",
      },
      include: {
        agentUserRequests: {
          where: {
            status: "OPEN",
            type: "APPLICATION_BLOCKED",
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        automationRuns: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
        events: {
          where: { type: "note_added" },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        jobPosting: true,
        resume: { select: { plainText: true, markdown: true } },
        user: { include: { profile: true } },
        jobProfileMatch: true,
      },
      orderBy: [
        { jobProfileMatch: { overallScore: "desc" } },
        { updatedAt: "desc" },
      ],
      take: 200,
    }),
    summarizeAutomationBlockers(200),
    prisma.jobSearchRun.findFirst({
      orderBy: { startedAt: "desc" },
    }),
    prisma.agentRun.findFirst({
      where: { agentType: "RECRUITING_AGENCY" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        outputJson: true,
        updatedAt: true,
      },
    }),
    prisma.jobProfileMatch.findMany({
      where: {
        status: {
          in: [
            "needs_review",
            "approved",
            "resume_generated",
            "cover_letter_generated",
            "ready_to_apply",
            "rejected",
            "archived",
            "saved_for_later",
          ],
        },
      },
      include: {
        jobPosting: {
          select: {
            id: true,
            company: true,
            title: true,
            location: true,
            applicationUrl: true,
            duplicateGroupId: true,
            lastSeenAt: true,
          },
        },
        jobSearchProfile: {
          select: {
            name: true,
            userId: true,
          },
        },
      },
      orderBy: [
        { overallScore: "desc" },
        { updatedAt: "desc" },
      ],
      take: 500,
    }),
    prisma.application.findMany({
      include: {
        jobPosting: {
          select: {
            id: true,
            company: true,
            title: true,
            location: true,
            applicationUrl: true,
            duplicateGroupId: true,
            lastSeenAt: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    }),
  ]);
  const canonicalApplications = visibleCanonicalApplications(applications);
  const visibleApplications = canonicalApplications.filter((application) => (
    assessApplicationUrlQuality(application.jobPosting.applicationUrl).launchable
  ));
  const funnelUserIds = Array.from(new Set(funnelMatches.map((match) => match.jobSearchProfile.userId)));
  const suppressionByUserId = await loadJobSuppressionStatesByUserIds(funnelUserIds);
  const trustFunnel = buildApplySprintTrustFunnel({
    latestSearchRun,
    latestAgencyRun,
    matches: funnelMatches,
    applications: funnelApplications,
    visibleReadyApplicationIds: new Set(visibleApplications.map((application) => application.id)),
    suppressionByUserId,
  });

  const fallbacks = getServiceFallbacks(["openai", "playwright"]);

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Application assistant"
          title="Apply Sprint"
          description="Run the local application assistant on ready packets. It fills what it safely knows, learns from fields you complete manually, stops only for real blockers, and never submits without you."
          actions={(
            <Button component={Link} href="/settings/learning#settings-field-learning" variant="outlined">
              Review field learning
            </Button>
          )}
        />
        <ServiceFallbackBanners items={fallbacks} />
        <LifecycleReadinessContext stages={["apply", "packet", "trust"]} title="Apply Sprint readiness" />
        <AssistantWorkbench
          initialApplicationId={searchParams?.applicationId}
          atsBlockers={atsBlockers}
          trustFunnel={trustFunnel}
          applications={visibleApplications.map((application) => ({
            id: application.id,
            jobPostingId: application.jobPostingId,
            jobProfileMatchId: application.jobProfileMatchId,
            company: application.jobPosting.company,
            title: application.jobPosting.title,
            description: application.jobPosting.description,
            applicationUrl: application.jobPosting.applicationUrl,
            atsProvider: application.jobPosting.atsProvider,
            score: application.jobProfileMatch?.overallScore ?? null,
            resumeId: application.resumeId,
            coverLetterId: application.coverLetterId,
            ashbyRisk: buildAshbyRiskAssessment({
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
                location: application.user.profile?.location,
                yearsExperience: application.user.profile?.yearsExperience,
              },
              resumeText: application.resume?.plainText ?? application.resume?.markdown,
            }),
            automationRun: application.automationRuns[0]
              ? {
                  id: application.automationRuns[0].id,
                  status: application.automationRuns[0].status,
                  blockerType: application.automationRuns[0].blockerType,
                  blockerMessage: application.automationRuns[0].blockerMessage,
                  currentNode: application.automationRuns[0].currentNode,
                  graphThreadId: application.automationRuns[0].graphThreadId,
                  workflowState: application.automationRuns[0].workflowStateJson,
                  startedAt: application.automationRuns[0].startedAt.toISOString(),
                  finishedAt: application.automationRuns[0].finishedAt?.toISOString() ?? null,
                }
              : null,
            blocker: application.agentUserRequests[0]
              ? {
                  id: application.agentUserRequests[0].id,
                  question: application.agentUserRequests[0].question,
                }
              : null,
            assistantLaunched: application.events.some((event) => {
              const payload = event.payload as { note?: string } | null;
              return Boolean(application.automationRuns[0]) && payload?.note === "Local Playwright assistant launched. Manual submit checkpoint required.";
            }),
          }))}
        />
      </Stack>
    </AppShell>
  );
}
