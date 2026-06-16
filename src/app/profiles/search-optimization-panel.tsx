"use client";

import ManageSearchOutlinedIcon from "@mui/icons-material/ManageSearchOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type SearchOptimizationPanelData = {
  id: string;
  summary: string;
  mode: string;
  targetMetric: string;
  metricsJson: {
    qualifiedYield?: number;
    topBlocker?: { label?: string; value?: number } | null;
    jobsFetched?: number;
    jobsAfterFilters?: number;
    jobsSaved?: number;
  };
  changes: Array<{
    id: string;
    action: string;
    status: string;
    riskLevel: string;
    rationale: string;
    searchProfile: { name: string };
  }>;
};

export function SearchOptimizationPanel({ latest }: { latest: SearchOptimizationPanelData | null }) {
  const { refresh } = useRouter();
  const [running, setRunning] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function runTeam() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/search-optimization/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "active" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to run recruiting search team.");
      refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to run recruiting search team.");
    } finally {
      setRunning(false);
    }
  }

  async function mutateChange(changeId: string, action: "apply" | "rollback") {
    setPendingId(changeId);
    setError("");
    try {
      const response = await fetch(`/api/search-optimization/changes/${changeId}/${action}`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? `Unable to ${action} change.`);
      refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : `Unable to ${action} change.`);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Typography variant="h3">Recruiting Search Team</Typography>
              <Typography variant="body2" color="text.secondary">
                Jolene-orchestrated profile management focused on raising Qualified yield through bounded local edits and review-only structural recommendations.
              </Typography>
            </Box>
            <Button variant="contained" startIcon={<ManageSearchOutlinedIcon />} disabled={running} onClick={() => void runTeam()}>
              {running ? "Optimizing..." : "Run search team"}
            </Button>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}

          {latest ? (
            <Stack spacing={1.5}>
              <Alert severity="info">{latest.summary}</Alert>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Chip size="small" color="primary" label={`${latest.targetMetric.replaceAll("_", " ")} ${latest.metricsJson.qualifiedYield ?? 0}%`} />
                <Chip size="small" variant="outlined" label={`${latest.metricsJson.jobsAfterFilters ?? 0} qualified`} />
                <Chip size="small" variant="outlined" label={`${latest.metricsJson.jobsFetched ?? 0} fetched`} />
                {latest.metricsJson.topBlocker?.label ? <Chip size="small" color="warning" variant="outlined" label={`Blocker: ${latest.metricsJson.topBlocker.label}`} /> : null}
              </Stack>

              {latest.changes.length ? (
                <Stack spacing={1}>
                  {latest.changes.slice(0, 6).map((change) => (
                    <Box key={change.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
                        <Box>
                          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 0.5 }}>
                            <Chip size="small" label={change.searchProfile.name} />
                            <Chip size="small" variant="outlined" label={formatAction(change.action)} />
                            <Chip size="small" color={statusColor(change.status)} variant="outlined" label={formatAction(change.status)} />
                            <Chip size="small" color={change.riskLevel === "HIGH" ? "warning" : "success"} variant="outlined" label={`${change.riskLevel.toLowerCase()} risk`} />
                          </Stack>
                          <Typography variant="body2" color="text.secondary">{change.rationale}</Typography>
                        </Box>
                        <Stack direction="row" spacing={1}>
                          {change.status === "REVIEW_ONLY" && change.riskLevel === "LOW" ? (
                            <Button size="small" disabled={pendingId === change.id} onClick={() => void mutateChange(change.id, "apply")}>Apply</Button>
                          ) : null}
                          {change.status === "APPLIED" ? (
                            <Button size="small" color="warning" startIcon={<RestartAltOutlinedIcon />} disabled={pendingId === change.id} onClick={() => void mutateChange(change.id, "rollback")}>Rollback</Button>
                          ) : null}
                        </Stack>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Alert severity="success">No profile changes were needed from the latest optimization run.</Alert>
              )}
            </Stack>
          ) : (
            <Alert severity="warning">No Recruiting Search Team run has been recorded yet. Run it after a completed search to tune profiles from real metrics.</Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function formatAction(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function statusColor(status: string) {
  if (status === "APPLIED") return "success";
  if (status === "ROLLED_BACK") return "default";
  if (status === "REVIEW_ONLY") return "warning";
  return "info";
}
