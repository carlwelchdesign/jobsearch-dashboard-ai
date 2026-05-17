"use client";

import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type AgencyRunStatus = {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  error: string | null;
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

type AgencyRunControlProps = {
  label?: string;
  minimumScore?: number;
  limit?: number;
  color?: "primary" | "success";
  variant?: "contained" | "outlined";
  showLatestOnMount?: boolean;
};

export function AgencyRunControl({
  label = "Run recruiting agency",
  minimumScore = 90,
  limit = 10,
  color = "primary",
  variant = "contained",
  showLatestOnMount = true,
}: AgencyRunControlProps) {
  const router = useRouter();
  const [run, setRun] = useState<AgencyRunStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [notice, setNotice] = useState("");
  const runIdRef = useRef<string | null>(null);

  const running = starting || run?.status === "RUNNING" || run?.status === "PENDING";
  const meaningfulEvents = useMemo(
    () => (run?.events ?? []).filter((event) => event.type !== "run_started").slice(-8).reverse(),
    [run?.events],
  );

  useEffect(() => {
    if (!showLatestOnMount) return;
    void refreshStatus();
  }, [showLatestOnMount]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void refreshStatus(runIdRef.current), 1500);
    return () => window.clearInterval(timer);
  }, [running]);

  async function refreshStatus(runId = runIdRef.current) {
    setPolling(true);
    try {
      const suffix = runId ? `?runId=${encodeURIComponent(runId)}` : "";
      const response = await fetch(`/api/applications/agency/run/status${suffix}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to load agency activity.");
      if (payload.run) {
        setRun(payload.run);
        runIdRef.current = payload.run.id;
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load agency activity.");
    } finally {
      setPolling(false);
    }
  }

  async function startAgency() {
    setStarting(true);
    setNotice("");
    runIdRef.current = null;
    try {
      const request = fetch("/api/applications/agency/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ minimumScore, limit, triggeredBy: "manual" }),
      });
      window.setTimeout(() => void refreshStatus(), 500);
      const response = await request;
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Recruiting agency failed.");
      if (payload.agentRunId) {
        runIdRef.current = payload.agentRunId;
        await refreshStatus(payload.agentRunId);
      }
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Recruiting agency failed.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Stack spacing={1.5} sx={{ width: "100%" }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
        <Button
          variant={variant}
          color={running ? "warning" : color}
          startIcon={running ? <CircularProgress color="inherit" size={16} thickness={5} /> : <AutoAwesomeOutlinedIcon />}
          disabled={running}
          onClick={() => void startAgency()}
        >
          {running ? "Agency running..." : label}
        </Button>
        {run ? <Chip size="small" color={run.status === "FAILED" ? "error" : run.status === "COMPLETED" ? "success" : "primary"} label={run.status.toLowerCase()} /> : null}
        {polling && !running ? <Typography variant="caption" color="text.secondary">Refreshing activity...</Typography> : null}
      </Stack>

      {notice ? <Alert severity="warning" onClose={() => setNotice("")}>{notice}</Alert> : null}

      {run ? (
        <Box sx={{ border: 1, borderColor: run.status === "FAILED" ? "error.main" : "divider", borderRadius: 1, p: 1.5, bgcolor: "background.paper" }}>
          <Stack spacing={1.25}>
            {running ? <LinearProgress /> : null}
            <Box>
              <Typography sx={{ fontWeight: 850 }}>{run.current?.message ?? statusMessage(run)}</Typography>
              <Typography variant="caption" color="text.secondary">
                Started {new Date(run.startedAt).toLocaleString()} · Updated {new Date(run.updatedAt).toLocaleTimeString()}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
              <MetricChip label="Found" value={run.totals.found} />
              <MetricChip label="Processed" value={run.totals.processed} />
              <MetricChip label="Approved" value={run.totals.approved} />
              <MetricChip label="Packets" value={run.totals.prepared} />
              <MetricChip label="Skipped" value={run.totals.skipped} />
              <MetricChip label="Failed" value={run.totals.failed} color={run.totals.failed > 0 ? "error" : "default"} />
            </Stack>
            {run.error ? <Alert severity="error">{run.error}</Alert> : null}
            <Stack spacing={0.75}>
              {meaningfulEvents.length ? meaningfulEvents.map((event) => (
                <Box key={event.id} sx={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr)", gap: 1, alignItems: "baseline" }}>
                  <Typography variant="caption" color="text.secondary">{new Date(event.createdAt).toLocaleTimeString()}</Typography>
                  <Typography variant="body2">{event.message}</Typography>
                </Box>
              )) : (
                <Typography variant="body2" color="text.secondary">No agency decisions recorded yet.</Typography>
              )}
            </Stack>
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}

function MetricChip({ label, value, color = "default" }: { label: string; value: number; color?: "default" | "error" }) {
  return <Chip size="small" color={color} variant="outlined" label={`${label}: ${value}`} />;
}

function statusMessage(run: AgencyRunStatus) {
  if (run.status === "FAILED") return "Recruiting agency failed.";
  if (run.status === "COMPLETED") return "Recruiting agency completed.";
  return "Recruiting agency is checking matches and preparing packets.";
}
