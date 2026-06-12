import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ActionButton } from "@/components/action-button";
import { ScoreChip } from "@/components/ui/score-chip";
import type { MarketIntelligenceOutput } from "@/lib/agents/market-intelligence";

type SearchHealth = {
  latestManualSearchAt: Date | null;
  latestCronSearchAt: Date | null;
  cronExpression: string;
  scheduledProfileCount: number;
};

export function MarketAnalysisCard({
  latest,
  latestRunCreatedAt,
  searchHealth,
}: {
  latest: MarketIntelligenceOutput | null;
  latestRunCreatedAt: Date | null;
  searchHealth: SearchHealth;
}) {
  const topLane = latest?.marketTemperature?.[0] ?? null;
  const topSkills = latest?.skillSignals?.slice(0, 5) ?? [];
  const generatedAt = latest?.generatedAt ?? latestRunCreatedAt?.toISOString() ?? null;

  return (
    <Card sx={{ borderColor: "info.main", bgcolor: "rgba(2, 132, 199, 0.06)" }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                <Chip size="small" color="info" label="Market analysis" />
                {latest ? <Chip size="small" variant="outlined" label={`${latest.lookbackDays} day lookback`} /> : null}
                {latest ? <ScoreChip score={Math.round(latest.confidence * 100)} label={`${Math.round(latest.confidence * 100)} confidence`} /> : null}
              </Stack>
              <Typography variant="h3">Market Analysis</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Latest labor-market brief from your pipeline, search profiles, application outcomes, and cited external sources.
              </Typography>
            </Box>
            <ActionButton postTo="/api/market-intelligence/run" variant="contained" color="info" startIcon={<InsightsOutlinedIcon />} loadingLabel="Researching...">
              Run market brief
            </ActionButton>
          </Stack>

          {latest ? (
            <Stack spacing={1.5}>
              <Alert severity="info">{latest.summary}</Alert>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                {generatedAt ? <Chip size="small" variant="outlined" label={`Generated ${formatDateTime(generatedAt)}`} /> : null}
                <Chip size="small" variant="outlined" label={`${latest.dataFreshness.internalJobsAnalyzed} jobs analyzed`} />
                <Chip size="small" variant="outlined" label={`${latest.dataFreshness.externalSourcesChecked} sources checked`} />
              </Stack>

              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 1.5 }}>
                <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, bgcolor: "background.paper" }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>Top role lane</Typography>
                  {topLane ? (
                    <Stack spacing={1} sx={{ mt: 1 }}>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                        <Typography sx={{ fontWeight: 900 }}>{topLane.lane}</Typography>
                        <Chip size="small" color={temperatureColor(topLane.temperature)} label={topLane.temperature} />
                        <ScoreChip score={topLane.score} label={`${topLane.score} signal`} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">{topLane.rationale}</Typography>
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Not enough job data yet.</Typography>
                  )}
                </Box>

                <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, bgcolor: "background.paper" }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>Skill signals</Typography>
                  {topSkills.length ? (
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
                      {topSkills.map((skill) => (
                        <Chip key={skill.skill} size="small" label={`${skill.skill}: ${skill.status} (${skill.mentions})`} color={skill.status === "rising" ? "success" : skill.status === "stable" ? "primary" : "default"} />
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No repeatable skill signal yet.</Typography>
                  )}
                </Box>
              </Box>

              {latest.recommendedActions.length ? (
                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>Recommended actions</Typography>
                  {latest.recommendedActions.slice(0, 3).map((action) => (
                    <Box key={`${action.category}-${action.title}`} sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <Chip size="small" variant="outlined" label={`P${action.priority}`} />
                        <Typography variant="body2" sx={{ fontWeight: 850 }}>{action.title}</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">{action.detail}</Typography>
                    </Box>
                  ))}
                </Stack>
              ) : null}
            </Stack>
          ) : (
            <Alert severity="info">No market analysis report yet. Run search from Command Center or let the scheduled job-search cron complete; the market brief will run after search finishes.</Alert>
          )}

          <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>Search and cron health</Typography>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
              <Chip size="small" variant="outlined" label={`Manual search: ${formatOptionalDate(searchHealth.latestManualSearchAt)}`} />
              <Chip size="small" color={searchHealth.latestCronSearchAt ? "success" : "warning"} variant={searchHealth.latestCronSearchAt ? "outlined" : "filled"} label={`Cron search: ${formatOptionalDate(searchHealth.latestCronSearchAt)}`} />
              <Chip size="small" variant="outlined" label={`Schedule ${searchHealth.cronExpression}`} />
              <Chip size="small" variant="outlined" label={`${searchHealth.scheduledProfileCount} scheduled profile${searchHealth.scheduledProfileCount === 1 ? "" : "s"}`} />
            </Stack>
            {!searchHealth.latestCronSearchAt ? (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                The cron endpoint is configured, but this database has no recorded `triggeredBy: cron` search run yet.
              </Alert>
            ) : null}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function temperatureColor(temperature: string) {
  if (temperature === "hot") return "success";
  if (temperature === "warm") return "primary";
  if (temperature === "mixed") return "warning";
  return "default";
}

function formatOptionalDate(value: Date | null) {
  return value ? formatDateTime(value) : "never recorded";
}

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString();
}
