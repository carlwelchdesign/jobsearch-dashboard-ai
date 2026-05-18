"use client";

import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
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

export type NetworkingStrategyPanelOutput = {
  actionItems?: Array<{
    type: string;
    priority: number;
    company: string;
    role?: string;
    jobId?: string;
    contactId?: string;
    outreachId?: string;
    summary: string;
    rationale: string;
  }>;
  contactGaps?: Array<{
    company: string;
    openApplications: number;
    highestOpportunityScore: number;
    suggestedSearch: string;
  }>;
  followUpsDue?: Array<{
    outreachId: string;
    company: string;
    contactName: string | null;
    followUpAt: string;
    summary: string;
  }>;
  messagingWarnings?: string[];
  confidence?: number;
  reasoningSummary?: string;
};

export function NetworkingStrategyPanel({ latest }: { latest: NetworkingStrategyPanelOutput | null }) {
  const { refresh } = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function runStrategy() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/networking/strategy", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to build networking strategy.");
      refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to build networking strategy.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}>
            <Box>
              <Typography variant="h3">Networking Strategy</Typography>
              <Typography variant="body2" color="text.secondary">
                Prioritizes follow-ups, contact gaps, and recruiter drafts from approved jobs and saved outreach. Nothing is sent automatically.
              </Typography>
            </Box>
            <Button variant="contained" startIcon={<PsychologyOutlinedIcon />} disabled={running} onClick={() => void runStrategy()}>
              {running ? "Planning..." : "Plan networking"}
            </Button>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {latest?.messagingWarnings?.length ? <Alert severity="warning">{latest.messagingWarnings.join(" ")}</Alert> : null}
          {latest?.reasoningSummary ? <Alert severity="info">{latest.reasoningSummary}</Alert> : null}

          {latest?.actionItems?.length ? (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>Priority actions</Typography>
              {latest.actionItems.slice(0, 6).map((item) => (
                <Box key={`${item.type}-${item.company}-${item.jobId ?? item.outreachId ?? item.summary}`} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Box>
                      <Typography sx={{ fontWeight: 850 }}>{item.company}{item.role ? ` · ${item.role}` : ""}</Typography>
                      <Typography variant="body2" color="text.secondary">{item.summary}</Typography>
                    </Box>
                    <Stack direction="row" spacing={0.75}>
                      <Chip size="small" color={item.priority === 1 ? "success" : item.priority === 2 ? "warning" : "default"} label={`P${item.priority}`} />
                      <Chip size="small" variant="outlined" label={formatLabel(item.type)} />
                    </Stack>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{item.rationale}</Typography>
                </Box>
              ))}
            </Stack>
          ) : null}

          {latest?.contactGaps?.length ? (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>Contact gaps</Typography>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                {latest.contactGaps.slice(0, 8).map((gap) => (
                  <Chip key={gap.company} variant="outlined" label={`${gap.company}: ${gap.highestOpportunityScore}`} />
                ))}
              </Stack>
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
