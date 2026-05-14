import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { AppShell } from "@/app/app-shell";
import { RunSearchControl } from "@/components/run-search-control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { WorkflowGuide } from "@/components/ui/workflow-guide";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = await prisma.jobSearchRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Worker visibility"
          title="Cron Run Logs"
          description="Search runs feed Step 2. Use this page to confirm discovery finished and saved jobs into the review queue."
          actions={<RunSearchControl compact />}
        />
        <WorkflowGuide active="jobs" title="Discovery feeds the review queue" />
        <RunSearchControl />
        <TableContainer component={Card}>
          <Table sx={{ minWidth: 820 }}>
            <TableHead>
              <TableRow>
                <TableCell>Started</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Fetched</TableCell>
                <TableCell>After dedupe</TableCell>
                <TableCell>Needs review</TableCell>
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

function latestProgress(progress: unknown) {
  if (!Array.isArray(progress) || progress.length === 0) return "No updates";
  const latest = progress[progress.length - 1] as { message?: string };
  return latest.message ?? "No updates";
}
