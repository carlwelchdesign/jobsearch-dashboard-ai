"use client";

import { useRouter } from "next/navigation";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import BuildCircleOutlinedIcon from "@mui/icons-material/BuildCircleOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";
import { SearchRunAnalyticsCharts } from "@/components/search-run-analytics-charts";
import { StatusChip } from "@/components/ui/status-chip";

type ProgressEvent = {
  at: string;
  message: string;
  stats?: {
    jobsFetched?: number;
    jobsAfterDedupe?: number;
    jobsAfterFilters?: number;
    jobsSaved?: number;
    [key: string]: unknown;
  };
  agencyHandoff?: AgencyHandoff;
  profileOptimizer?: ProfileOptimizer;
};

type AgencyHandoff = {
  status: "started" | "running" | "completed" | "failed" | "skipped";
  reason: "started" | "search_not_successful" | "no_eligible_matches" | "agency_already_running" | "agency_failed";
  agentRunId?: string;
  result?: {
    approved: number;
    prepared: number;
    failed: number;
    skipped: number;
  };
  error?: string;
};

type ProfileOptimizer = {
  status: "completed" | "failed" | "skipped";
  reason: "started" | "search_not_successful" | "review_gate_open" | "application_gate_open" | "profile_optimizer_failed";
  agentRunId?: string;
  result?: {
    healthScores: number;
    recommendedChanges: number;
    profilesToCreate: number;
  };
  gates?: {
    needsReview: number;
    pendingApplications: number;
  };
  error?: string;
};

type AgencyRunStatus = {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  error: string | null;
  currentNode: string | null;
  workflowVersion: string | null;
  startedAt: string;
  updatedAt: string;
  totals: {
    found: number;
    processed: number;
    approved: number;
    prepared: number;
    failed: number;
    skipped: number;
  };
  current: { type: string; message: string; payload: unknown } | null;
  events: Array<{
    id: string;
    type: string;
    message: string;
    payload: unknown;
    createdAt: string;
  }>;
};

type SearchRun = {
  id: string;
  status: string;
  triggeredBy: string;
  startedAt: string;
  finishedAt: string | null;
  jobsFetched: number;
  jobsAfterDedupe: number;
  jobsAfterFilters: number;
  jobsSaved: number;
  progress: ProgressEvent[];
};

export function SearchRunCommandCenter({ initialRun }: { initialRun: SearchRun | null }) {
  const { refresh } = useRouter();
  const [run, setRun] = useState<SearchRun | null>(initialRun);
  const [agencyRun, setAgencyRun] = useState<AgencyRunStatus | null>(null);
  const [error, setError] = useState("");
  const running = run?.status === "running";
  const latest = run?.progress?.[run.progress.length - 1] ?? null;
  const timeline = useMemo(() => run?.progress?.slice(-10).reverse() ?? [], [run?.progress]);
  const agencyHandoff = useMemo(() => latestAgencyHandoff(run?.progress ?? []), [run?.progress]);
  const profileOptimizer = useMemo(() => latestProfileOptimizer(run?.progress ?? []), [run?.progress]);
  const linkedAgencyRunId = agencyHandoff?.agentRunId ?? null;
  const visibleAgencyRun = linkedAgencyRunId && agencyRun?.id === linkedAgencyRunId ? agencyRun : null;
  const agencyRunning = visibleAgencyRun?.status === "PENDING" || visibleAgencyRun?.status === "RUNNING";
  const agencyStale = Boolean(visibleAgencyRun && agencyRunning && Date.now() - new Date(visibleAgencyRun.updatedAt).getTime() > 10 * 60 * 1000);

  async function refreshLatest() {
    const response = await fetch("/api/jobs/search/run/status");
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      setRun(body.run);
      return body.run as SearchRun | null;
    }
    return null;
  }

  async function startRun() {
    setError("");
    const response = await fetch("/api/jobs/search/run", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "Unable to start search.");
      return;
    }
    setRun(normalizeRun(body.run));
  }

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const nextRun = await refreshLatest();
      if (run?.status === "running" && nextRun?.status && nextRun.status !== "running") {
        refresh();
      }
    }, running ? 1200 : 5000);

    return () => window.clearInterval(timer);
  }, [refresh, run?.status, running]);

  useEffect(() => {
    if (!linkedAgencyRunId) return;
    void refreshAgencyRun(linkedAgencyRunId);
  }, [linkedAgencyRunId]);

  useEffect(() => {
    if (!linkedAgencyRunId || !agencyRunning) return;
    const timer = window.setInterval(() => void refreshAgencyRun(linkedAgencyRunId), 1500);
    return () => window.clearInterval(timer);
  }, [agencyRunning, linkedAgencyRunId]);

  async function refreshAgencyRun(runId: string) {
    const response = await fetch(`/api/applications/agency/run/status?runId=${encodeURIComponent(runId)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (response.ok) setAgencyRun(body.run ?? null);
  }

  async function controlAgencyRun(action: "repair" | "retry") {
    if (!visibleAgencyRun) return;
    setError("");
    const response = await fetch(`/api/agents/runs/${visibleAgencyRun.id}/control`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "Unable to update agency run.");
      return;
    }
    await refreshAgencyRun(body.childRunId ?? visibleAgencyRun.id);
    refresh();
  }

  return (
    <Card sx={{ borderColor: running ? "primary.main" : "divider", bgcolor: running ? "rgba(37, 99, 235, 0.06)" : "background.paper" }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                <Chip size="small" color={running ? "primary" : "default"} label="Live search" />
                {run ? <StatusChip status={run.status} /> : null}
                {run?.triggeredBy ? <Chip size="small" variant="outlined" label={run.triggeredBy} /> : null}
              </Stack>
              <Typography variant="h3">{running ? "Search is running" : run ? "Latest search run" : "No search run yet"}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {latest?.message ?? "Start the gated loop to discover jobs, prepare eligible matches, refresh profile health, and rerun market intelligence when review gates are clear."}
              </Typography>
            </Box>
            <Button variant="contained" startIcon={<PlayArrowIcon />} disabled={running} onClick={startRun}>
              {running ? "Running..." : "Run search improvement loop"}
            </Button>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {running ? <LinearProgress /> : null}

          <SearchRunAnalyticsCharts run={run} compact />

          {agencyHandoff ? (
            <AgencyHandoffPanel
              handoff={agencyHandoff}
              agencyRun={visibleAgencyRun}
              stale={agencyStale}
              onRepair={() => void controlAgencyRun("repair")}
              onRetry={() => void controlAgencyRun("retry")}
            />
          ) : null}

          {profileOptimizer ? <ProfileOptimizerPanel optimizer={profileOptimizer} /> : null}

          {timeline.length ? (
            <Stack spacing={0.75}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, textTransform: "uppercase" }}>
                Live event stream
              </Typography>
              <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
                {timeline.map((event, index) => (
                  <Box
                    key={`${event.at}-${event.message}`}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "92px 1fr" },
                      gap: 1,
                      px: 1.25,
                      py: 0.9,
                      borderTop: index === 0 ? 0 : 1,
                      borderColor: "divider",
                      bgcolor: index === 0 && running ? "rgba(37, 99, 235, 0.08)" : "background.paper",
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatTime(event.at)}
                    </Typography>
                    <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                      {event.message}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function normalizeRun(value: unknown): SearchRun | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const run = value as Record<string, unknown>;
  return {
    id: String(run.id ?? ""),
    status: String(run.status ?? "running"),
    triggeredBy: String(run.triggeredBy ?? "manual"),
    startedAt: String(run.startedAt ?? new Date().toISOString()),
    finishedAt: typeof run.finishedAt === "string" ? run.finishedAt : null,
    jobsFetched: Number(run.jobsFetched ?? 0),
    jobsAfterDedupe: Number(run.jobsAfterDedupe ?? 0),
    jobsAfterFilters: Number(run.jobsAfterFilters ?? 0),
    jobsSaved: Number(run.jobsSaved ?? 0),
    progress: Array.isArray(run.progress) ? run.progress as ProgressEvent[] : [],
  };
}

function latestAgencyHandoff(progress: ProgressEvent[]) {
  return [...progress].reverse().find((event) => event.agencyHandoff)?.agencyHandoff ?? null;
}

function latestProfileOptimizer(progress: ProgressEvent[]) {
  return [...progress].reverse().find((event) => event.profileOptimizer)?.profileOptimizer ?? null;
}

function AgencyHandoffPanel({
  handoff,
  agencyRun,
  stale,
  onRepair,
  onRetry,
}: {
  handoff: AgencyHandoff;
  agencyRun: AgencyRunStatus | null;
  stale: boolean;
  onRepair: () => void;
  onRetry: () => void;
}) {
  const failed = handoff.status === "failed" || agencyRun?.status === "FAILED";
  const running = agencyRun?.status === "PENDING" || agencyRun?.status === "RUNNING";
  const currentMessage = agencyRun?.current?.message ?? agencyHandoffMessage(handoff);
  const totals = agencyRun
    ? agencyRun.totals
    : handoff.result
      ? { found: null, processed: null, ...handoff.result }
      : null;
  const recentEvents = agencyRun?.events.filter((event) => event.type !== "run_started").slice(-4).reverse() ?? [];

  return (
    <Box sx={{ border: 1, borderColor: failed ? "error.main" : "divider", borderRadius: 1, p: 1.5, bgcolor: failed ? "rgba(239, 68, 68, 0.06)" : "background.paper" }}>
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Chip size="small" color={handoffChipColor(handoff.status, agencyRun?.status)} label="Agency handoff" />
          <Chip size="small" variant="outlined" label={(agencyRun?.status ?? handoff.status).toLowerCase()} />
          {handoff.agentRunId ? <Chip size="small" variant="outlined" label={`run ${handoff.agentRunId.slice(-6)}`} /> : null}
          {stale ? <Chip size="small" color="warning" variant="outlined" label="stale" /> : null}
        </Stack>
        {running ? <LinearProgress /> : null}
        <Box>
          <Typography sx={{ fontWeight: 850 }}>{currentMessage}</Typography>
          <Typography variant="caption" color="text.secondary">
            {agencyRun ? `Updated ${formatTime(agencyRun.updatedAt)}` : agencyHandoffDetail(handoff)}
          </Typography>
          {agencyRun?.currentNode || agencyRun?.workflowVersion ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Node {workflowNodeLabel(agencyRun.currentNode)} · {agencyRun.workflowVersion ?? "graph workflow"}
            </Typography>
          ) : null}
        </Box>
        {totals ? (
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
            {typeof totals.found === "number" ? <MetricChip label="Found" value={totals.found} /> : null}
            {typeof totals.processed === "number" ? <MetricChip label="Processed" value={totals.processed} /> : null}
            <MetricChip label="Approved" value={totals.approved} />
            <MetricChip label="Packets" value={totals.prepared} />
            <MetricChip label="Skipped" value={totals.skipped} />
            <MetricChip label="Failed" value={totals.failed} color={totals.failed > 0 ? "error" : "default"} />
          </Stack>
        ) : null}
        {(stale || failed) ? (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            {stale ? (
              <Button size="small" color="warning" variant="outlined" startIcon={<BuildCircleOutlinedIcon />} onClick={onRepair}>
                Repair stale run
              </Button>
            ) : null}
            <Button size="small" color="primary" variant="outlined" startIcon={<ReplayOutlinedIcon />} onClick={onRetry} disabled={!agencyRun}>
              Retry agency
            </Button>
          </Stack>
        ) : null}
        {handoff.error || agencyRun?.error ? <Alert severity="error">{handoff.error ?? agencyRun?.error}</Alert> : null}
        {recentEvents.length ? (
          <Stack spacing={0.6}>
            {recentEvents.map((event) => (
              <Box key={event.id} sx={{ display: "grid", gridTemplateColumns: "92px minmax(0, 1fr)", gap: 1 }}>
                <Typography variant="caption" color="text.secondary">{formatTime(event.createdAt)}</Typography>
                <Typography variant="body2">{event.message}</Typography>
              </Box>
            ))}
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
}

function agencyHandoffMessage(handoff: AgencyHandoff) {
  if (handoff.status === "completed") return "Recruiting agency completed the search handoff.";
  if (handoff.status === "failed") return "Recruiting agency failed during the search handoff.";
  if (handoff.status === "running") return "Recruiting agency was already running for another handoff.";
  if (handoff.status === "started") return "Recruiting agency started from this search.";
  return "Recruiting agency skipped this search handoff.";
}

function agencyHandoffDetail(handoff: AgencyHandoff) {
  if (handoff.reason === "search_not_successful") return "Search did not complete successfully.";
  if (handoff.reason === "no_eligible_matches") return "No application-ready matches were eligible.";
  if (handoff.reason === "agency_already_running") return "Another agency run is already active.";
  if (handoff.reason === "agency_failed") return handoff.error ?? "Agency run failed.";
  return "Eligible matches were handed to the recruiting agency for Apply Sprint preparation.";
}

function ProfileOptimizerPanel({ optimizer }: { optimizer: ProfileOptimizer }) {
  const failed = optimizer.status === "failed";
  const blocked = optimizer.status === "skipped" && (optimizer.reason === "review_gate_open" || optimizer.reason === "application_gate_open");
  return (
    <Box sx={{ border: 1, borderColor: failed ? "error.main" : blocked ? "warning.main" : "divider", borderRadius: 1, p: 1.5, bgcolor: blocked ? "rgba(245, 158, 11, 0.08)" : "background.paper" }}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Chip size="small" color={profileOptimizerChipColor(optimizer)} label="Profile health gate" />
          <Chip size="small" variant="outlined" label={profileOptimizerLabel(optimizer)} />
          {optimizer.agentRunId ? <Chip size="small" variant="outlined" label={`run ${optimizer.agentRunId.slice(-6)}`} /> : null}
        </Stack>
        <Typography sx={{ fontWeight: 850 }}>{profileOptimizerMessage(optimizer)}</Typography>
        <Typography variant="caption" color="text.secondary">{profileOptimizerDetail(optimizer)}</Typography>
        {optimizer.result ? (
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
            <MetricChip label="Health scores" value={optimizer.result.healthScores} />
            <MetricChip label="Recommendations" value={optimizer.result.recommendedChanges} />
            <MetricChip label="New campaigns" value={optimizer.result.profilesToCreate} />
          </Stack>
        ) : null}
        {optimizer.error ? <Alert severity="error">{optimizer.error}</Alert> : null}
      </Stack>
    </Box>
  );
}

function profileOptimizerMessage(optimizer: ProfileOptimizer) {
  if (optimizer.status === "completed") return "Profile optimizer refreshed the health snapshots used by Market Analysis.";
  if (optimizer.reason === "review_gate_open") return "Profile optimizer paused for job review.";
  if (optimizer.reason === "application_gate_open") return "Profile optimizer paused for Apply Sprint.";
  if (optimizer.status === "failed") return "Profile optimizer failed.";
  return "Profile optimizer skipped.";
}

function profileOptimizerDetail(optimizer: ProfileOptimizer) {
  if (optimizer.reason === "review_gate_open") return `${optimizer.gates?.needsReview ?? 0} job(s) still need approve/reject decisions before profile health is recalculated.`;
  if (optimizer.reason === "application_gate_open") return `${optimizer.gates?.pendingApplications ?? 0} prepared application(s) still need Apply Sprint or outcome tracking.`;
  if (optimizer.reason === "search_not_successful") return "Search did not complete successfully.";
  if (optimizer.reason === "profile_optimizer_failed") return optimizer.error ?? "The optimizer could not write fresh profile-health snapshots.";
  return "Market Intelligence can now use fresh profile-health data for the dashboard charts.";
}

function profileOptimizerLabel(optimizer: ProfileOptimizer) {
  return optimizer.status === "skipped" ? optimizer.reason.replaceAll("_", " ") : optimizer.status;
}

function profileOptimizerChipColor(optimizer: ProfileOptimizer) {
  if (optimizer.status === "failed") return "error";
  if (optimizer.status === "completed") return "success";
  if (optimizer.reason === "review_gate_open" || optimizer.reason === "application_gate_open") return "warning";
  return "default";
}

function handoffChipColor(status: AgencyHandoff["status"], runStatus?: AgencyRunStatus["status"]) {
  if (status === "failed" || runStatus === "FAILED") return "error";
  if (status === "completed" || runStatus === "COMPLETED") return "success";
  if (status === "skipped") return "default";
  return "primary";
}

function workflowNodeLabel(value: string | null) {
  if (!value) return "graph";
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase();
}

function MetricChip({ label, value, color = "default" }: { label: string; value: number; color?: "default" | "error" }) {
  return <Chip size="small" color={color} variant="outlined" label={`${label}: ${value}`} />;
}

function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString();
}
