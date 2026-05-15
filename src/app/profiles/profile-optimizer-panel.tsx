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
import { ScoreChip } from "@/components/ui/score-chip";

export type OptimizerOutput = {
  profileHealthScores?: Array<{ profileId: string; name: string; healthScore: number; rationale: string }>;
  recommendedChanges?: Array<{ profileId: string; profileName: string; action: string; summary: string }>;
  profilesToMerge?: Array<{ profileIds: string[]; names: string[]; rationale: string }>;
  profilesToCreate?: Array<{ name: string; targetTitles: string[]; keywords: string[]; rationale: string }>;
  rationale?: string;
  confidence?: number;
};

export function ProfileOptimizerPanel({ latest }: { latest: OptimizerOutput | null }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function runOptimizer() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/profiles/optimize", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to optimize profiles.");
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to optimize profiles.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Typography variant="h3">Search Profile Optimizer</Typography>
              <Typography variant="body2" color="text.secondary">
                Reviews profile overlap, score quality, approval/rejection patterns, and campaign specificity. Recommendations are review-only.
              </Typography>
            </Box>
            <Button variant="contained" startIcon={<PsychologyOutlinedIcon />} disabled={running} onClick={() => void runOptimizer()}>
              {running ? "Analyzing..." : "Analyze profiles"}
            </Button>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {latest?.rationale ? <Alert severity="info">{latest.rationale}</Alert> : null}

          {latest?.profileHealthScores?.length ? (
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              {latest.profileHealthScores.map((profile) => (
                <Chip key={profile.profileId} label={`${profile.name}: ${profile.healthScore}`} color={profile.healthScore >= 70 ? "success" : profile.healthScore >= 50 ? "warning" : "default"} />
              ))}
            </Stack>
          ) : null}

          {latest?.recommendedChanges?.length ? (
            <Stack spacing={1}>
              {latest.recommendedChanges.slice(0, 6).map((change) => (
                <Box key={`${change.profileId}-${change.action}`} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Typography sx={{ fontWeight: 850 }}>{change.profileName}</Typography>
                    <Chip size="small" variant="outlined" label={formatAction(change.action)} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{change.summary}</Typography>
                </Box>
              ))}
            </Stack>
          ) : null}

          {latest?.profilesToMerge?.length ? (
            <Alert severity="warning">
              Merge candidates: {latest.profilesToMerge.map((item) => item.names.join(" + ")).join("; ")}
            </Alert>
          ) : null}

          {latest?.profilesToCreate?.length ? (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>Suggested new campaigns</Typography>
              {latest.profilesToCreate.map((profile) => (
                <Box key={profile.name} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Typography sx={{ fontWeight: 850 }}>{profile.name}</Typography>
                    <ScoreChip score={Math.round((latest.confidence ?? 0.6) * 100)} label="confidence" />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{profile.rationale}</Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
                    {profile.keywords.slice(0, 6).map((keyword) => <Chip key={`${profile.name}-${keyword}`} size="small" variant="outlined" label={keyword} />)}
                  </Stack>
                </Box>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function formatAction(action: string) {
  return action.charAt(0).toUpperCase() + action.slice(1).toLowerCase();
}
