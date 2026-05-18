"use client";

import { useRouter } from "next/navigation";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { StatusChip } from "@/components/ui/status-chip";

type ProgressEvent = {
  at: string;
  message: string;
  stats?: {
    jobsFetched: number;
    jobsAfterDedupe: number;
    jobsAfterFilters: number;
    jobsSaved: number;
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
        {running ? "Search running..." : "Run search"}
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
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }, gap: 1 }}>
                <Stat label="Fetched" value={run.jobsFetched} />
                <Stat label="New" value={run.jobsAfterDedupe} />
                <Stat label="Matched" value={run.jobsAfterFilters} />
                <Stat label="Saved" value={run.jobsSaved} />
              </Box>
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
        <Typography variant="body2" color="text.secondary">
          {run.status}: {run.progress?.[run.progress.length - 1]?.message ?? "Search started."}
        </Typography>
      ) : null}
    </Stack>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography sx={{ fontWeight: 850, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
    </Box>
  );
}

function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString();
}
