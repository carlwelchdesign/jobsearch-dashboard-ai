import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ActionButton } from "@/components/action-button";
import { ScoreChip } from "@/components/ui/score-chip";
import type { MarketIntelligenceOutput } from "@/lib/agents/market-intelligence";
import { MarketAnalysisTabs } from "./market-analysis-tabs";

export type SearchHealth = {
  latestManualSearchAt: Date | string | null;
  latestCronSearchAt: Date | string | null;
  cronExpression: string;
  scheduledProfileCount: number;
};

export type MarketTrendPoint = {
  generatedAt: string;
  label: string;
  topLane: string;
  topLaneJobs: number;
  topSkill: string;
  topSkillMentions: number;
  confidencePercent: number;
};

export function MarketAnalysisCard({
  latest,
  latestRunCreatedAt,
  searchHealth,
  trendSeries,
}: {
  latest: MarketIntelligenceOutput | null;
  latestRunCreatedAt: Date | null;
  searchHealth: SearchHealth;
  trendSeries: MarketTrendPoint[];
}) {
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
                {latest?.researchDigest.length ? <Chip size="small" variant="outlined" label={`${latest.researchDigest.length} article${latest.researchDigest.length === 1 ? "" : "s"}`} /> : null}
                {generatedAt ? <Chip size="small" variant="outlined" label={`Generated ${formatDateTime(generatedAt)}`} /> : null}
              </Stack>
              <Typography variant="h3">Market Analysis</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Centralized market brief with pipeline analytics, trend charts, source-backed research, and search-strategy actions.
              </Typography>
            </Box>
            <ActionButton postTo="/api/market-intelligence/run" variant="contained" color="info" startIcon={<InsightsOutlinedIcon />} loadingLabel="Researching...">
              Run market brief
            </ActionButton>
          </Stack>

          <MarketAnalysisTabs latest={latest} trendSeries={trendSeries} searchHealth={searchHealth} />
        </Stack>
      </CardContent>
    </Card>
  );
}

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString();
}
