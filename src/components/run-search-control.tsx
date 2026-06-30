"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { StatusChip } from "@/components/ui/status-chip";

const SearchRunAnalyticsCharts = dynamic(
  () => import("@/components/search-run-analytics-charts").then((module) => module.SearchRunAnalyticsCharts),
  { ssr: false, loading: () => <Alert severity="info">Loading search analytics...</Alert> },
);

type ProgressEvent = {
  at: string;
  message: string;
  stats?: {
    jobsFetched: number;
    jobsAfterDedupe: number;
    jobsAfterFilters: number;
    jobsSaved: number;
    [key: string]: unknown;
  };
};

type Run = {
  id: string;
  status: string;
  jobsFetched: number;
  jobsAfterDedupe: number;
  jobsAfterFilters: number;
  jobsSaved: number;
  progress: ProgressEvent[];
};

export function RunSearchControl({ compact = false }: { compact?: boolean }) {
  const { refresh } = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const running = run?.status === "running";

  async function startRun() {
    setError("");
    const response = await fetch("/api/jobs/search/run", { method: "POST" });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Unable to start search.");
      return;
    }
    setRun(body.run);
  }

  useEffect(() => {
    if (!run?.id || !running) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/jobs/search/run/status?id=${run.id}`);
      const body = await response.json();
      if (response.ok) {
        setRun(body.run);
        if (body.run?.status && body.run.status !== "running") {
          refresh();
        }
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [refresh, run?.id, running]);

  const latest = run?.progress?.slice(-6).reverse() ?? [];

  return (
    <Stack spacing={1.5}>
      <Button variant="contained" startIcon={<PlayArrowIcon />} disabled={running} onClick={startRun}>
        {running ? "Search loop running..." : "Run search improvement loop"}
      </Button>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {run && !compact ? (
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Typography variant="h3">Current run</Typography>
                <StatusChip status={run.status} />
              </Stack>
              {running ? <LinearProgress /> : null}
              <SearchRunAnalyticsCharts run={run} compact />
              <Stack spacing={0.75}>
                {latest.map((event) => (
                  <Typography key={`${event.at}-${event.message}`} variant="body2" color="text.secondary">
                    {formatTime(event.at)} - {event.message}
                  </Typography>
                ))}
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ) : null}
      {run && compact ? (
        <Stack spacing={0.75}>
          <SearchRunAnalyticsCharts run={run} compact />
          <Typography variant="body2" color="text.secondary">
            {run.status}: {run.progress?.[run.progress.length - 1]?.message ?? "Search improvement loop started."}
          </Typography>
        </Stack>
      ) : null}
    </Stack>
  );
}

function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString();
}
