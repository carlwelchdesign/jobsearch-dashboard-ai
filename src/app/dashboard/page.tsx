import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AppShell } from "@/app/app-shell";
import { ActionButton } from "@/components/action-button";
import { BulkPrepareControl } from "@/components/bulk-prepare-control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ScoreChip } from "@/components/ui/score-chip";
import { formatStatus } from "@/components/ui/status-chip";
import { WorkflowGuide } from "@/components/ui/workflow-guide";
import { RunSearchControl } from "@/components/run-search-control";
import { jsonArray } from "@/lib/json";
import { uniqueMatchesByCanonicalJob } from "@/lib/job-search/unique-matches";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [profiles, latestRun, statusCounts, needsReview] = await Promise.all([
    prisma.jobSearchProfile.findMany({ where: { enabled: true }, orderBy: { name: "asc" } }),
    prisma.jobSearchRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.jobProfileMatch.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.jobProfileMatch.findMany({
      where: { status: "needs_review" },
      include: {
        jobPosting: true,
        jobSearchProfile: { select: { name: true } },
      },
      orderBy: [{ overallScore: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
  ]);
  const visibleNeedsReview = uniqueMatchesByCanonicalJob(needsReview).slice(0, 5);
  const countByStatus = new Map(statusCounts.map((count) => [count.status, count._count.status]));
  const readyToApply = countByStatus.get("ready_to_apply") ?? 0;

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Command center"
          title="Decision Dashboard"
          description="Start here: confirm your search profile, run discovery, approve strong matches, generate materials, then work the ready queue in Apply Sprint."
          actions={
            <>
            <ActionButton href="/jobs/manual" variant="outlined" startIcon={<AddCircleOutlineIcon />}>Add manual job</ActionButton>
            <RunSearchControl compact />
            </>
          }
        />

        <WorkflowGuide title="How a job reaches Apply Sprint" />

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }, gap: 2 }}>
          <Metric label="Enabled profiles" value={profiles.length.toString()} helper="Active campaigns" />
          <Metric label="Needs review" value={(countByStatus.get("needs_review") ?? 0).toString()} helper="Waiting for approval" />
          <Metric label="Ready to apply" value={readyToApply.toString()} helper="Materials reviewed" />
          <Metric label="Latest run" value={latestRun?.status ?? "None"} helper={latestRun ? latestRun.startedAt.toLocaleString() : "No runs yet"} />
        </Box>

        <BulkPrepareControl defaultMinimumScore={85} defaultLimit={10} />

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "2fr 1fr" }, gap: 2 }}>
          <Box>
            <Stack spacing={2}>
              <SectionTitle title="Needs Review" />
              {visibleNeedsReview.length === 0 ? (
                <Card>
                  <EmptyState title="No jobs waiting" body="Run a search or add a manual job to fill the review queue." />
                </Card>
              ) : (
                visibleNeedsReview.map((match) => (
                  <Card key={match.id} sx={{ transition: "border-color 160ms ease, transform 160ms ease", "&:hover": { borderColor: "primary.main", transform: "translateY(-1px)" } }}>
                    <CardContent>
                      <Stack spacing={2}>
                        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between" }}>
                          <Stack spacing={1}>
                            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                              <ScoreChip score={match.overallScore} label={`${match.overallScore} score`} />
                              <Chip variant="outlined" label={match.jobSearchProfile.name} />
                            </Stack>
                            <Box>
                              <Typography variant="h2">{match.jobPosting.title}</Typography>
                              <Typography color="text.secondary">{match.jobPosting.company} · {match.jobPosting.location ?? "Unknown location"}</Typography>
                            </Box>
                          </Stack>
                          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                            <ActionButton postTo={`/api/jobs/${match.jobPosting.id}/reject`} body={{ matchId: match.id }} variant="outlined" color="secondary">Reject</ActionButton>
                            <ActionButton postTo={`/api/jobs/${match.jobPosting.id}/approve`} body={{ matchId: match.id }} variant="contained">Approve</ActionButton>
                          </Stack>
                        </Stack>

                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                          <SignalList title="Why it matched" items={jsonArray(match.strongestMatches)} color="success" />
                          <SignalList title="Concerns" items={jsonArray(match.concerns)} color="warning" />
                        </Box>

                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
                          <Typography variant="body2" color="text.secondary">
                            Recommended action: <Box component="span" sx={{ fontWeight: 800, color: "text.primary" }}>{match.recommendedAction}</Box>
                          </Typography>
                          <ActionButton href={`/jobs/${match.jobPosting.id}`} size="small" endIcon={<OpenInNewIcon />}>Open job</ActionButton>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                ))
              )}
            </Stack>
          </Box>

          <Box>
            <Stack spacing={2}>
              <SectionTitle title="Pipeline" />
              <Card>
                <List disablePadding>
                  {["needs_review", "approved", "ready_to_apply", "applied", "follow_up_due", "archived"].map((status, index, statuses) => (
                    <ListItem
                      key={status}
                      divider={index < statuses.length - 1}
                      secondaryAction={<Chip size="small" label={countByStatus.get(status as never) ?? 0} />}
                      sx={{ py: 1.5 }}
                    >
                      <ListItemText
                        primary={<Typography component="span" sx={{ fontWeight: 800, fontSize: 14, textTransform: "capitalize" }}>{formatStatus(status)}</Typography>}
                        secondary={<Typography component="span" variant="caption" color="text.secondary">Application workflow status</Typography>}
                      />
                    </ListItem>
                  ))}
                </List>
              </Card>

              <SectionTitle title="Profile Health" />
              <Card>
                <CardContent>
                  <Stack spacing={2}>
                    {profiles.map((profile) => (
                      <Box key={profile.id}>
                        <Stack direction="row" sx={{ justifyContent: "space-between" }} spacing={2}>
                          <Typography variant="body2" sx={{ fontWeight: 800 }}>{profile.name}</Typography>
                          <Typography variant="body2" color="text.secondary">{profile.minimumMatchScore}</Typography>
                        </Stack>
                        <LinearProgress variant="determinate" value={profile.minimumMatchScore} sx={{ mt: 1, height: 8, borderRadius: 4 }} />
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>

              <ActionButton href="/jobs?statusView=archived" variant="outlined">
                View archived jobs
              </ActionButton>
            </Stack>
          </Box>
        </Box>
      </Stack>
    </AppShell>
  );
}

function Metric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h1" sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{helper}</Typography>
      </CardContent>
    </Card>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
      <Typography variant="h3">{title}</Typography>
    </Stack>
  );
}

function SignalList({ title, items, color }: { title: string; items: string[]; color: "success" | "warning" }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: "uppercase" }}>{title}</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
        {items.length === 0 ? <Chip size="small" variant="outlined" label="None" /> : items.map((item, index) => <Chip key={`${title}-${item}-${index}`} size="small" color={color} variant="outlined" label={item} />)}
      </Stack>
    </Box>
  );
}
