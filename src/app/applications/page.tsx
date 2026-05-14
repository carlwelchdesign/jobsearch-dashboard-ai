import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import PlayCircleOutlineOutlinedIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import Link from "next/link";
import { AppShell } from "@/app/app-shell";
import { ActionButton } from "@/components/action-button";
import { BulkPrepareControl } from "@/components/bulk-prepare-control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip, formatStatus } from "@/components/ui/status-chip";
import { WorkflowGuide } from "@/components/ui/workflow-guide";
import { prisma } from "@/lib/prisma";
import { ApplicationCreateForm } from "./application-create-form";
import { ApplicationDeleteButton } from "./application-delete-button";
import { MarkAppliedButton } from "./mark-applied-button";

export const dynamic = "force-dynamic";

const columns = ["approved", "ready_to_apply", "applied", "follow_up_due", "screening", "interviewing", "offer", "archived"];

export default async function ApplicationsPage() {
  const [applications, matches] = await Promise.all([
    prisma.application.findMany({
      include: { jobPosting: true, resume: true, coverLetter: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.jobProfileMatch.findMany({
      where: { status: { in: ["approved", "ready_to_apply", "resume_generated", "cover_letter_generated"] } },
      include: { jobPosting: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Ready queue"
          title="Applications"
          description="Step 4: work from complete packages. Ready-to-apply items have a resume and cover letter, then move into Apply Sprint for manual submission."
          actions={<ApplicationCreateForm jobs={matches.map((match) => ({
            id: match.jobPostingId,
            matchId: match.id,
            label: `${match.jobPosting.company} · ${match.jobPosting.title}`,
          }))} />}
        />
        <WorkflowGuide active="applications" title="Step 4 of 5: choose the next complete package" />
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="h3">Apply Sprint</Typography>
              <Typography variant="body2" color="text.secondary">
                Batch-generate materials, then launch the next highest-scoring ready application. The assistant fills and uploads; you review and submit.
              </Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ alignItems: { md: "center" } }}>
                <BulkPrepareControl compact defaultMinimumScore={85} defaultLimit={10} />
                <ActionButton href="/applications/assistant" variant="outlined" startIcon={<BoltOutlinedIcon />}>
                  Open sprint console
                </ActionButton>
                <ActionButton
                  postTo="/api/applications/next-ready/launch-assistant"
                  variant="contained"
                  color="success"
                  startIcon={<PlayCircleOutlineOutlinedIcon />}
                >
                  Launch next ready
                </ActionButton>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }, gap: 2 }}>
          {columns.map((status) => {
            const items = applications.filter((application) => application.status === status);
            return (
              <Card key={status} sx={{ minHeight: 220 }}>
                <CardContent>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                    <StatusChip status={status} />
                    <Chip label={items.length} sx={{ fontVariantNumeric: "tabular-nums" }} />
                  </Stack>
                  <Stack spacing={1.5} sx={{ mt: 2 }}>
                    {items.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">No {formatStatus(status)} applications.</Typography>
                    ) : (
                      items.map((application) => (
                        <Box key={application.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                          <Typography sx={{ fontWeight: 800 }}>{application.jobPosting.title}</Typography>
                          <Typography variant="body2" color="text.secondary">{application.jobPosting.company}</Typography>
                          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
                            {application.resume ? <Chip size="small" color="success" variant="outlined" label="Resume" /> : null}
                            {application.coverLetter ? <Chip size="small" color="secondary" variant="outlined" label="Cover letter" /> : null}
                          </Stack>
                          {application.jobPosting.applicationUrl ? (
                            <Button
                              component={Link}
                              href={application.jobPosting.applicationUrl}
                              target="_blank"
                              rel="noreferrer"
                              size="small"
                              variant="outlined"
                              sx={{ mt: 1 }}
                            >
                              Open application
                            </Button>
                          ) : null}
                          {application.status === "approved" || application.status === "ready_to_apply" ? (
                            <Box sx={{ mt: 1 }}>
                              <ApplicationDeleteButton
                                applicationId={application.id}
                                label={`${application.jobPosting.company} - ${application.jobPosting.title}`}
                              />
                            </Box>
                          ) : null}
                          {application.status === "ready_to_apply" && application.resume && application.coverLetter ? (
                            <>
                              <Divider sx={{ my: 1.25 }} />
                              <Stack spacing={0.75}>
                                <ActionButton
                                  postTo={`/api/applications/${application.id}/launch-assistant`}
                                  message="Local assistant launched. Review the browser window and submit manually."
                                  size="small"
                                  variant="contained"
                                  color="success"
                                  startIcon={<PlayCircleOutlineOutlinedIcon />}
                                >
                                  Launch assistant
                                </ActionButton>
                                <MarkAppliedButton applicationId={application.id} />
                                <Typography variant="caption" color="text.secondary">
                                  Launch the assistant, submit manually on the employer site, then mark this item applied.
                                </Typography>
                              </Stack>
                            </>
                          ) : null}
                        </Box>
                      ))
                    )}
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Box>
        {applications.length === 0 ? (
          <Card>
            <EmptyState title="No applications tracked" body="Create an application from an approved match when you are ready to work it." />
          </Card>
        ) : null}
      </Stack>
    </AppShell>
  );
}
