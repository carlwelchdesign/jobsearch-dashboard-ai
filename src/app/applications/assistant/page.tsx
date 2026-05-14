import { AppShell } from "@/app/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { WorkflowGuide } from "@/components/ui/workflow-guide";
import Stack from "@mui/material/Stack";
import { prisma } from "@/lib/prisma";
import { AssistantWorkbench } from "./assistant-workbench";

export const dynamic = "force-dynamic";

export default async function ApplicationAssistantPage() {
  const applications = await prisma.application.findMany({
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
  });

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Application assistant"
          title="Apply Sprint"
          description="Step 5: launch one ready application, review the employer form, submit manually, then mark the application applied."
        />
        <WorkflowGuide active="sprint" title="Step 5 of 5: submit manually" />
        <AssistantWorkbench
          applications={applications.map((application) => ({
            id: application.id,
            company: application.jobPosting.company,
            title: application.jobPosting.title,
            applicationUrl: application.jobPosting.applicationUrl,
            score: application.jobProfileMatch?.overallScore ?? null,
            resumeId: application.resumeId,
            coverLetterId: application.coverLetterId,
            assistantLaunched: application.events.some((event) => {
              const payload = event.payload as { note?: string } | null;
              return payload?.note === "Local Playwright assistant launched. Manual submit checkpoint required.";
            }),
          }))}
        />
      </Stack>
    </AppShell>
  );
}
