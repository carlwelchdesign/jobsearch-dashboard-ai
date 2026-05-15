"use client";

import TravelExploreOutlinedIcon from "@mui/icons-material/TravelExploreOutlined";
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

export type SearchExpansionPanelOutput = {
  categoryCoverage?: Array<{
    category: string;
    sourceCompanyCount: number;
    coveredByProfiles: string[];
    priorityCompanies: string[];
    status: string;
  }>;
  profilesToCreate?: Array<{
    name: string;
    rationale: string;
    targetTitles: string[];
    includedKeywords: string[];
    industries: string[];
    exampleCompanies: string[];
    priority: number;
  }>;
  profilesToExpand?: Array<{
    profileId: string;
    profileName: string;
    suggestedKeywords: string[];
    suggestedCompanies: string[];
    rationale: string;
  }>;
  warnings?: string[];
  rationale?: string;
  confidence?: number;
};

export function SearchExpansionPanel({ latest }: { latest: SearchExpansionPanelOutput | null }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function runExpansion() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/profiles/expand", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to expand search profiles.");
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to expand search profiles.");
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
              <Typography variant="h3">Search Expansion</Typography>
              <Typography variant="body2" color="text.secondary">
                Compares active profiles against the curated company-source list and suggests focused campaigns or careful keyword expansion.
              </Typography>
            </Box>
            <Button variant="outlined" startIcon={<TravelExploreOutlinedIcon />} disabled={running} onClick={() => void runExpansion()}>
              {running ? "Scanning..." : "Find gaps"}
            </Button>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {latest?.warnings?.length ? <Alert severity="warning">{latest.warnings.join(" ")}</Alert> : null}
          {latest?.rationale ? <Alert severity="info">{latest.rationale}</Alert> : null}

          {latest?.categoryCoverage?.length ? (
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              {latest.categoryCoverage.map((coverage) => (
                <Chip
                  key={coverage.category}
                  label={`${formatLabel(coverage.category)}: ${formatLabel(coverage.status)}`}
                  color={coverage.status === "covered" ? "success" : coverage.status === "undercovered" ? "warning" : "default"}
                  variant={coverage.status === "covered" ? "filled" : "outlined"}
                />
              ))}
            </Stack>
          ) : null}

          {latest?.profilesToCreate?.length ? (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>Suggested focused campaigns</Typography>
              {latest.profilesToCreate.map((profile) => (
                <Box key={profile.name} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Typography sx={{ fontWeight: 850 }}>{profile.name}</Typography>
                    <Stack direction="row" spacing={0.75}>
                      <Chip size="small" variant="outlined" label={`P${profile.priority}`} />
                      <ScoreChip score={Math.round((latest.confidence ?? 0.55) * 100)} label="confidence" />
                    </Stack>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{profile.rationale}</Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
                    {profile.includedKeywords.slice(0, 7).map((keyword) => <Chip key={`${profile.name}-${keyword}`} size="small" variant="outlined" label={keyword} />)}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                    Example companies: {profile.exampleCompanies.slice(0, 6).join(", ") || "n/a"}
                  </Typography>
                </Box>
              ))}
            </Stack>
          ) : null}

          {latest?.profilesToExpand?.length ? (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>Expansion candidates</Typography>
              {latest.profilesToExpand.map((profile) => (
                <Box key={profile.profileId} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                  <Typography sx={{ fontWeight: 850 }}>{profile.profileName}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{profile.rationale}</Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
                    {[...profile.suggestedKeywords, ...profile.suggestedCompanies].slice(0, 10).map((item) => <Chip key={`${profile.profileId}-${item}`} size="small" variant="outlined" label={item} />)}
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

function formatLabel(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
