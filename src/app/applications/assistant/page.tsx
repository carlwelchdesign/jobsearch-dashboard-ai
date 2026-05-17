import { AppShell } from "@/app/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import Stack from "@mui/material/Stack";
import { prisma } from "@/lib/prisma";
import { summarizeAutomationBlockers } from "@/lib/applications/automation-analytics";
import { recoverStaleApplicationAutomationRuns, syncRunningApplicationAutomationRunsFromLogs } from "@/lib/applications/automation-runs";
import { hasApplicationForJob, submittedApplicationJobKeySet, submittedApplicationStatuses } from "@/lib/applications/job-filters";
import { reconcileApplicationCanonicalState, visibleCanonicalApplications } from "@/lib/applications/reconciliation";
import { isJobSuppressed, loadJobSuppressionStatesByUserIds } from "@/lib/jobs/suppression";
import { AssistantWorkbench } from "./assistant-workbench";

export const dynamic = "force-dynamic";

export default async function ApplicationAssistantPage() {
  await reconcileApplicationCanonicalState({ source: "apply_sprint_page" }).catch(() => null);
  await syncRunningApplicationAutomationRunsFromLogs();
  await recoverStaleApplicationAutomationRuns();

  const [applications, submittedApplications, atsBlockers] = await Promise.all([
    prisma.application.findMany({
    where: {
      status: "ready_to_apply",
      resumeId: { not: null },
      coverLetterId: { not: null },
      jobPosting: {
        applicationUrl: { not: null },
          NOT: [
            { applicationUrl: { contains: "example.com", mode: "insensitive" } },
            { applicationUrl: { contains: "remoteok.com", mode: "insensitive" } },
          ],
        },
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
      jobProfileMatch: true,
    },
    orderBy: [
      { jobProfileMatch: { overallScore: "desc" } },
      { updatedAt: "desc" },
    ],
    take: 50,
    }),
    prisma.application.findMany({
      where: { status: { in: submittedApplicationStatuses } },
      select: {
        status: true,
        jobPosting: {
          select: {
            company: true,
            title: true,
            location: true,
            lastSeenAt: true,
          },
        },
      },
    }),
    summarizeAutomationBlockers(200),
  ]);
  const suppressionStates = await loadJobSuppressionStatesByUserIds(applications.map((application) => application.userId));
  const submittedJobKeys = submittedApplicationJobKeySet(submittedApplications);
  const canonicalApplications = visibleCanonicalApplications(applications);
  const visibleApplications = canonicalApplications.filter((application) => (
    !hasApplicationForJob(application.jobPosting, submittedJobKeys)
    && (!suppressionStates.get(application.userId) || !isJobSuppressed(application.jobPosting, suppressionStates.get(application.userId)!))
  ));

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Application assistant"
          title="Apply Sprint"
          description="Run the local application assistant on ready packets. It fills known fields, stops for blockers, respects auto-submit gates, and records what happened."
        />
        <AssistantWorkbench
          atsBlockers={atsBlockers}
          applications={visibleApplications.map((application) => ({
            id: application.id,
            jobPostingId: application.jobPostingId,
            jobProfileMatchId: application.jobProfileMatchId,
            company: application.jobPosting.company,
            title: application.jobPosting.title,
            applicationUrl: application.jobPosting.applicationUrl,
            score: application.jobProfileMatch?.overallScore ?? null,
            resumeId: application.resumeId,
            coverLetterId: application.coverLetterId,
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
