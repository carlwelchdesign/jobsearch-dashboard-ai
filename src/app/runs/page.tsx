export const metadata = {
  title: "Runs | Job Search OS",
  description: "Inspect job search runs and discovery execution history.",
};

import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { AppShell } from "@/app/app-shell";
import { ActionButton } from "@/components/action-button";
import { RunSearchControl } from "@/components/run-search-control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = await prisma.jobSearchRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  const latestRun = runs[0] ?? null;
  const nextAction = runsNextAction(latestRun);

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Worker visibility"
          title="Cron Run Logs"
          description="Inspect discovery workers, cron runs, saved jobs, duplicate filtering, and failures without leaving the local app."
          actions={<RunSearchControl compact />}
        />
        <Card sx={{ borderColor: nextAction.color === "success" ? "success.main" : nextAction.color === "warning" ? "warning.main" : "primary.main", bgcolor: nextAction.color === "success" ? "rgba(16, 185, 129, 0.08)" : nextAction.color === "warning" ? "rgba(245, 158, 11, 0.08)" : "rgba(37, 99, 235, 0.08)" }}>
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
              <Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  <Chip size="small" color={nextAction.color} label="Next action" />
                  {latestRun ? <Chip size="small" variant="outlined" label={latestRun.status} /> : null}
                </Stack>
                <Typography variant="h3">{nextAction.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{nextAction.detail}</Typography>
              </Box>
              {nextAction.kind === "search" ? (
                <RunSearchControl compact />
              ) : (
                <ActionButton href={nextAction.href} variant="contained" color={nextAction.color} startIcon={nextAction.icon}>
                  {nextAction.label}
                </ActionButton>
              )}
            </Stack>
          </CardContent>
        </Card>
        <RunSearchControl />
        <TableContainer component={Card}>
          <Table sx={{ minWidth: 820 }}>
            <TableHead>
              <TableRow>
                <TableCell>Started</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Fetched</TableCell>
                <TableCell>After dedupe</TableCell>
                <TableCell>Matched</TableCell>
                <TableCell>Saved</TableCell>
                <TableCell>Latest update</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState title="No runs yet" body="Run a search to fetch, dedupe, score, and save matching jobs." />
                  </TableCell>
                </TableRow>
              ) : (
                runs.map((run) => (
                  <TableRow key={run.id} hover>
                    <TableCell>{run.startedAt.toLocaleString()}</TableCell>
                    <TableCell><StatusChip status={run.status} /></TableCell>
                    <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>{run.jobsFetched}</TableCell>
                    <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>{run.jobsAfterDedupe}</TableCell>
                    <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>{run.jobsAfterFilters}</TableCell>
                    <TableCell sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>{run.jobsSaved}</TableCell>
                    <TableCell>{latestProgress(run.progress)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </AppShell>
  );
}

function runsNextAction(latestRun: { status: string; progress: unknown; jobsSaved: number } | null) {
  if (!latestRun) {
    return {
      kind: "search" as const,
      title: "Run discovery",
      detail: "Fetch, dedupe, score, save matching jobs, and hand strong matches to the agency.",
      label: "Run search",
      color: "primary" as const,
      icon: <SearchOutlinedIcon />,
    };
  }
  if (latestRun.status === "running") {
    return {
      kind: "link" as const,
      title: "Discovery is running",
      detail: latestProgress(latestRun.progress),
      label: "Open jobs",
      href: "/jobs",
      color: "primary" as const,
      icon: <VisibilityOutlinedIcon />,
    };
  }
  if (latestRun.jobsSaved > 0) {
    return {
      kind: "link" as const,
      title: "Agency is handling saved jobs",
      detail: `The latest run saved ${latestRun.jobsSaved} job${latestRun.jobsSaved === 1 ? "" : "s"} and handed strong matches to the agency when eligible.`,
      label: "Open dashboard",
      href: "/dashboard",
      color: "success" as const,
      icon: <VisibilityOutlinedIcon />,
    };
  }
  if (latestRun.status === "failed" || latestRun.status === "partial") {
    return {
      kind: "search" as const,
      title: latestRun.status === "failed" ? "Retry discovery" : "Review partial run",
      detail: latestProgress(latestRun.progress),
      label: "Run search",
      color: "warning" as const,
      icon: <SearchOutlinedIcon />,
    };
  }
  return {
    kind: "search" as const,
    title: "Run a fresh search",
    detail: "The latest run did not save reviewable jobs. Adjust profiles or run discovery again.",
    label: "Run search",
    color: "primary" as const,
    icon: <SearchOutlinedIcon />,
  };
}

function latestProgress(progress: unknown) {
  if (!Array.isArray(progress) || progress.length === 0) return "No updates";
  const latest = progress[progress.length - 1] as { message?: string };
  return latest.message ?? "No updates";
}
