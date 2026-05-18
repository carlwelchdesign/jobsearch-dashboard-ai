export const metadata = {
  title: "Outcomes | Job Search OS",
  description: "Analyze application outcomes and job search quality signals.",
};

import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
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
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ScoreChip } from "@/components/ui/score-chip";
import { StatusChip, formatStatus } from "@/components/ui/status-chip";
import { prisma } from "@/lib/prisma";
import { AnalyzeOutcomesButton } from "./analyze-outcomes-button";

export const dynamic = "force-dynamic";

type OutcomeOutput = {
  sampleSize?: number;
  statusCounts?: Record<string, number>;
  outcomeCounts?: Record<string, number>;
  profilePerformance?: Array<{
    profileId: string;
    profileName: string;
    applications: number;
    applied: number;
    positiveOutcomes: number;
    negativeOutcomes: number;
    callbackRate: number;
    averageMatchScore: number;
    confidence: "LOW" | "MEDIUM" | "HIGH";
    recommendation: string;
  }>;
  sourcePerformance?: Array<{
    sourceName: string;
    applications: number;
    applied: number;
    positiveOutcomes: number;
    callbackRate: number;
    recommendation: string;
  }>;
  resumeSignals?: Array<{
    signal: string;
    applications: number;
    positiveOutcomes: number;
    recommendation: string;
  }>;
  recommendations?: string[];
  warnings?: string[];
  rationale?: string;
  confidence?: number;
};

export default async function OutcomeAnalyticsPage() {
  const [latestRun, liveStatusCounts, applicationCount, recentOutcomes] = await Promise.all([
    prisma.agentRun.findFirst({
      where: { agentType: "OUTCOME_LEARNING", status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.application.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.application.count(),
    prisma.applicationOutcome.findMany({
      include: {
        jobPosting: { select: { company: true, title: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 12,
    }),
  ]);
  const output = outcomeOutput(latestRun?.outputJson);
  const statusCounts = output?.statusCounts ?? Object.fromEntries(liveStatusCounts.map((count) => [count.status, count._count.status]));
  const outcomeCounts = output?.outcomeCounts ?? {};
  const sampleSize = output?.sampleSize ?? applicationCount;
  const nextAction = outcomeNextAction({
    applicationCount,
    explicitOutcomeCount: recentOutcomes.length,
    latestAnalysisAt: latestRun?.createdAt ?? null,
  });

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Outcome learning"
          title="Outcome Analytics"
          description="Use actual application outcomes to tune profiles, sources, and resume positioning. Recommendations stay advisory until you approve changes elsewhere."
          actions={<AnalyzeOutcomesButton />}
        />

        <Card sx={{ borderColor: nextAction.color === "success" ? "success.main" : "primary.main", bgcolor: nextAction.color === "success" ? "rgba(16, 185, 129, 0.08)" : "rgba(37, 99, 235, 0.08)" }}>
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
              <Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  <Chip size="small" color={nextAction.color} label="Next action" />
                  {typeof nextAction.count === "number" ? <Chip size="small" variant="outlined" label={nextAction.count} /> : null}
                </Stack>
                <Typography variant="h3">{nextAction.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{nextAction.detail}</Typography>
              </Box>
              {nextAction.kind === "analyze" ? (
                <AnalyzeOutcomesButton />
              ) : (
                <ActionButton href={nextAction.href} variant="contained" color={nextAction.color} startIcon={nextAction.icon}>
                  {nextAction.label}
                </ActionButton>
              )}
            </Stack>
          </CardContent>
        </Card>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
          <Metric label="Applications tracked" value={sampleSize.toString()} helper="Outcome sample size" />
          <Metric label="Applied" value={(statusCounts.applied ?? 0).toString()} helper="Submitted manually" />
          <Metric label="Screens/interviews" value={positiveCount(statusCounts).toString()} helper="Positive signals" />
          <Metric label="Analysis confidence" value={output?.confidence ? `${Math.round(output.confidence * 100)}` : "n/a"} helper={latestRun ? latestRun.createdAt.toLocaleString() : "Run analysis"} />
        </Box>

        {output?.warnings?.length ? (
          <Stack spacing={1}>
            {output.warnings.map((warning) => <Chip key={warning} color="warning" variant="outlined" label={warning} sx={{ alignSelf: "flex-start" }} />)}
          </Stack>
        ) : null}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 2 }}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <SectionHeader title="Recommendations" icon={<BarChartOutlinedIcon />} />
                {output?.recommendations?.length ? (
                  output.recommendations.map((recommendation) => (
                    <Box key={recommendation} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                      <Typography variant="body2">{recommendation}</Typography>
                    </Box>
                  ))
                ) : (
                  <EmptyState title="No outcome analysis yet" body="Click Analyze outcomes after applications are marked applied or updated." />
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <SectionHeader title="Status Mix" />
                {Object.entries(statusCounts).length === 0 ? (
                  <EmptyState title="No applications yet" body="Prepared and submitted applications will appear here." />
                ) : (
                  Object.entries(statusCounts).map(([status, count]) => (
                    <Box key={status}>
                      <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                        <StatusChip status={status} />
                        <Typography variant="body2" sx={{ fontWeight: 850, fontVariantNumeric: "tabular-nums" }}>{count}</Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={sampleSize ? Math.round((count / sampleSize) * 100) : 0} sx={{ mt: 1, height: 8, borderRadius: 999 }} />
                    </Box>
                  ))
                )}
              </Stack>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 2 }}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <SectionHeader title="Outcome Log" />
                {recentOutcomes.length === 0 ? (
                  <EmptyState title="No explicit outcomes yet" body="Open an application packet and record screens, rejections, ghosting, offers, or closed roles." />
                ) : (
                  recentOutcomes.map((outcome) => (
                    <Box key={outcome.id} sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
                      <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                        <Chip size="small" variant="outlined" label={formatOutcome(outcome.outcome)} />
                        <Typography variant="caption" color="text.secondary">{outcome.occurredAt.toLocaleString()}</Typography>
                      </Stack>
                      <Typography sx={{ mt: 0.75, fontWeight: 850 }}>{outcome.jobPosting.company} · {outcome.jobPosting.title}</Typography>
                      {outcome.notes ? <Typography variant="body2" color="text.secondary">{outcome.notes}</Typography> : null}
                    </Box>
                  ))
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <SectionHeader title="Explicit Outcomes" />
                {Object.entries(outcomeCounts).length === 0 ? (
                  <EmptyState title="No outcome counts yet" body="Run outcome analysis after recording outcome log entries." />
                ) : (
                  Object.entries(outcomeCounts).map(([outcome, count]) => (
                    <Box key={outcome}>
                      <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                        <Chip size="small" variant="outlined" label={formatOutcome(outcome)} />
                        <Typography variant="body2" sx={{ fontWeight: 850, fontVariantNumeric: "tabular-nums" }}>{count}</Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={sampleSize ? Math.round((count / sampleSize) * 100) : 0} sx={{ mt: 1, height: 8, borderRadius: 999 }} />
                    </Box>
                  ))
                )}
              </Stack>
            </CardContent>
          </Card>
        </Box>

        <TableSection
          title="Profile Performance"
          empty="Run outcome analysis to calculate profile performance."
          headers={["Profile", "Apps", "Applied", "Callbacks", "Avg score", "Confidence", "Recommendation"]}
          rows={(output?.profilePerformance ?? []).map((profile) => [
            profile.profileName,
            profile.applications,
            profile.applied,
            `${profile.callbackRate}%`,
            <ScoreChip key="score" score={profile.averageMatchScore} />,
            <Chip key="confidence" size="small" variant="outlined" label={profile.confidence} />,
            profile.recommendation,
          ])}
        />

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 2 }}>
          <TableSection
            title="Source Performance"
            empty="Sources will appear after outcome analysis."
            headers={["Source", "Apps", "Applied", "Callbacks", "Recommendation"]}
            rows={(output?.sourcePerformance ?? []).map((source) => [
              source.sourceName,
              source.applications,
              source.applied,
              `${source.callbackRate}%`,
              source.recommendation,
            ])}
          />
          <TableSection
            title="Resume Signals"
            empty="Resume strategy signals will appear after generated materials have outcomes."
            headers={["Signal", "Apps", "Positive", "Recommendation"]}
            rows={(output?.resumeSignals ?? []).map((signal) => [
              signal.signal,
              signal.applications,
              signal.positiveOutcomes,
              signal.recommendation,
            ])}
          />
        </Box>

        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          <ActionButton href="/applications" variant="outlined" endIcon={<OpenInNewIcon />}>Open applications</ActionButton>
          <ActionButton href="/profiles" variant="outlined" endIcon={<OpenInNewIcon />}>Tune profiles</ActionButton>
        </Stack>
      </Stack>
    </AppShell>
  );
}

function outcomeNextAction({
  applicationCount,
  explicitOutcomeCount,
  latestAnalysisAt,
}: {
  applicationCount: number;
  explicitOutcomeCount: number;
  latestAnalysisAt: Date | null;
}) {
  if (applicationCount === 0) {
    return {
      kind: "link",
      title: "Create applications first",
      detail: "Outcome learning needs submitted applications and status updates before it can recommend strategy changes.",
      label: "Open applications",
      href: "/applications",
      color: "primary" as const,
      icon: <EditNoteOutlinedIcon />,
      count: applicationCount,
    };
  }
  if (explicitOutcomeCount === 0) {
    return {
      kind: "link",
      title: "Record application outcomes",
      detail: "Open recent applications and record applied, screen, rejection, ghosted, offer, or closed outcomes.",
      label: "Open applications",
      href: "/applications",
      color: "primary" as const,
      icon: <EditNoteOutlinedIcon />,
      count: applicationCount,
    };
  }
  if (isOlderThanDays(latestAnalysisAt, 3)) {
    return {
      kind: "analyze",
      title: "Analyze outcomes",
      detail: "You have recorded outcomes. Run learning to identify which profiles, sources, and positioning are working.",
      label: "Analyze outcomes",
      color: "success" as const,
      icon: <InsightsOutlinedIcon />,
      count: explicitOutcomeCount,
    };
  }
  return {
    kind: "link",
    title: "Review recommendations",
    detail: "Outcome learning is current. Review recommendations and tune profiles or materials where useful.",
    label: "Tune profiles",
    href: "/profiles",
    color: "success" as const,
    icon: <InsightsOutlinedIcon />,
    count: explicitOutcomeCount,
  };
}

function isOlderThanDays(date: Date | null, days: number) {
  if (!date) return true;
  return Date.now() - date.getTime() > days * 86_400_000;
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

function SectionHeader({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      {icon}
      <Typography variant="h3">{title}</Typography>
    </Stack>
  );
}

function TableSection({ title, empty, headers, rows }: { title: string; empty: string; headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <TableContainer component={Card}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="h3">{title}</Typography>
      </Box>
      <Table sx={{ minWidth: 720 }}>
        <TableHead>
          <TableRow>
            {headers.map((header) => <TableCell key={header}>{header}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={headers.length}>
                <EmptyState title="No data yet" body={empty} />
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, rowIndex) => (
              <TableRow key={`${title}-${rowIndex}`} hover>
                {row.map((cell, cellIndex) => (
                  <TableCell key={`${title}-${rowIndex}-${cellIndex}`}>
                    {typeof cell === "string" || typeof cell === "number" ? (
                      <Typography variant="body2" color={cellIndex === 0 ? "text.primary" : "text.secondary"} sx={{ fontWeight: cellIndex === 0 ? 850 : 400 }}>
                        {cell}
                      </Typography>
                    ) : cell}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function outcomeOutput(value: unknown): OutcomeOutput | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as OutcomeOutput : null;
}

function positiveCount(statusCounts: Record<string, number>) {
  return (statusCounts.screening ?? 0) + (statusCounts.interviewing ?? 0) + (statusCounts.offer ?? 0);
}

function formatOutcome(outcome: string) {
  return outcome
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
