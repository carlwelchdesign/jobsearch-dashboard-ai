"use client";

import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import dynamic from "next/dynamic";
import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { ScoreChip } from "@/components/ui/score-chip";
import type { MarketIntelligenceOutput } from "@/lib/agents/market-intelligence";
import type { MarketTrendPoint, SearchHealth } from "./market-analysis-card";

type TabKey = "overview" | "charts" | "research" | "actions";

const MarketAnalysisCharts = dynamic(
  () => import("./market-analysis-charts").then((module) => module.MarketAnalysisCharts),
  { ssr: false, loading: () => <Alert severity="info">Loading analytical graphs...</Alert> },
);

export function MarketAnalysisTabs({
  latest,
  trendSeries,
  searchHealth,
}: {
  latest: MarketIntelligenceOutput | null;
  trendSeries: MarketTrendPoint[];
  searchHealth: SearchHealth;
}) {
  const [tab, setTab] = useState<TabKey>("overview");

  if (!latest) {
    return (
      <Alert severity="info">
        No market analysis report yet. Run search from Command Center or let the scheduled job-search cron complete; the market brief will run after search finishes.
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      <Tabs
        value={tab}
        onChange={(_, value) => setTab(value)}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Tab value="overview" label="Overview" />
        <Tab value="charts" label="Charts" />
        <Tab value="research" label={`Research (${latest.researchDigest.length})`} />
        <Tab value="actions" label={`Actions (${latest.recommendedActions.length})`} />
      </Tabs>

      {tab === "overview" ? <OverviewTab latest={latest} searchHealth={searchHealth} /> : null}
      {tab === "charts" ? <MarketAnalysisCharts latest={latest} trendSeries={trendSeries} /> : null}
      {tab === "research" ? <ResearchTab latest={latest} /> : null}
      {tab === "actions" ? <ActionsTab latest={latest} /> : null}
    </Stack>
  );
}

function OverviewTab({ latest, searchHealth }: { latest: MarketIntelligenceOutput; searchHealth: SearchHealth }) {
  const topLane = latest.marketTemperature[0] ?? null;
  const topSkills = latest.skillSignals.slice(0, 6);
  const generatedAt = latest.generatedAt;
  const sourceCoverage = latest.chartData.sourceCoverage ?? [];
  const checkedSources = sourceCoverage.find((item) => item.label === "Checked sources")?.value ?? 0;
  const articleCount = latest.researchDigest.length;

  return (
    <Stack spacing={1.5}>
      <Alert severity="info">{latest.summary}</Alert>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
        <Metric title="Jobs analyzed" value={latest.dataFreshness.internalJobsAnalyzed} helper={`${latest.lookbackDays} day lookback`} />
        <Metric title="Confidence" value={`${Math.round(latest.confidence * 100)}%`} helper="Blends local data and sources" />
        <Metric title="Fresh articles" value={articleCount} helper={`${checkedSources} checked source(s)`} />
        <Metric title="Generated" value={formatDate(generatedAt)} helper={formatTime(generatedAt)} />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 1.5 }}>
        <Panel title="Top role lane">
          {topLane ? (
            <Stack spacing={1}>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                <Typography sx={{ fontWeight: 900 }}>{topLane.lane}</Typography>
                <Chip size="small" color={temperatureColor(topLane.temperature)} label={topLane.temperature} />
                <ScoreChip score={topLane.score} label={`${topLane.score} signal`} />
              </Stack>
              <Typography variant="body2" color="text.secondary">{topLane.rationale}</Typography>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                {topLane.topCompanies.slice(0, 5).map((company) => <Chip key={company} size="small" variant="outlined" label={company} />)}
              </Stack>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">Not enough job data yet.</Typography>
          )}
        </Panel>

        <Panel title="Skill signals">
          {topSkills.length ? (
            <Stack spacing={1}>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                {topSkills.map((skill) => (
                  <Chip key={skill.skill} size="small" label={`${skill.skill}: ${skill.status} (${skill.mentions})`} color={skill.status === "rising" ? "success" : skill.status === "stable" ? "primary" : "default"} />
                ))}
              </Stack>
              {topSkills[0] ? <Typography variant="body2" color="text.secondary">{topSkills[0].guidance}</Typography> : null}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">No repeatable skill signal yet.</Typography>
          )}
        </Panel>
      </Box>

      <Panel title="Search and cron health">
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
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
      </Panel>
    </Stack>
  );
}

function ResearchTab({ latest }: { latest: MarketIntelligenceOutput }) {
  if (!latest.researchDigest.length) {
    return <Alert severity="warning">No fresh article content was available. This brief is using local pipeline data and curated source metadata.</Alert>;
  }

  return (
    <Stack spacing={1.5}>
      <Panel title="Research synthesis">
        <Typography variant="body2" color="text.secondary">{latest.researchSynthesis.narrative}</Typography>
        {latest.researchSynthesis.warnings.length ? <Alert severity="warning" sx={{ mt: 1.5 }}>{latest.researchSynthesis.warnings.join(" ")}</Alert> : null}
      </Panel>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 1.5 }}>
        {latest.researchDigest.slice(0, 6).map((article) => (
          <Panel key={article.url} title={article.title}>
            <Stack spacing={1}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between" }}>
                <Typography variant="caption" color="text.secondary">
                  {article.publisher}{article.publishedAt ? ` · ${formatDate(article.publishedAt)}` : ""}
                </Typography>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  <ScoreChip score={article.relevanceScore} label={`${article.relevanceScore} relevance`} />
                  <ScoreChip score={Math.round(article.confidence * 100)} label={`${Math.round(article.confidence * 100)} confidence`} />
                </Stack>
              </Stack>
              {article.claims[0] ? <Typography variant="body2" color="text.secondary">{article.claims[0]}</Typography> : null}
              {article.implications[0] ? <Typography variant="body2">{article.implications[0]}</Typography> : null}
              {article.excerpts[0] ? (
                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>{article.excerpts[0]}</Typography>
              ) : null}
              <Link href={article.url} target="_blank" rel="noreferrer" underline="hover" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontWeight: 800 }}>
                Read source <OpenInNewIcon fontSize="inherit" />
              </Link>
            </Stack>
          </Panel>
        ))}
      </Box>

      <Panel title="Source coverage">
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          {latest.sourceDigest.map((source) => (
            <Chip
              key={source.url}
              component={Link}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              clickable
              icon={<OpenInNewIcon />}
              label={`${source.publisher}: ${source.status}`}
              variant="outlined"
            />
          ))}
        </Stack>
      </Panel>
    </Stack>
  );
}

function ActionsTab({ latest }: { latest: MarketIntelligenceOutput }) {
  return (
    <Stack spacing={1.5}>
      {latest.recommendedActions.length ? (
        <Panel title="Recommended actions">
          <Stack spacing={1}>
            {latest.recommendedActions.map((action) => (
              <Box key={`${action.category}-${action.title}`} sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                  <Typography sx={{ fontWeight: 850 }}>{action.title}</Typography>
                  <Chip size="small" variant="outlined" label={`P${action.priority}`} />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{action.detail}</Typography>
              </Box>
            ))}
          </Stack>
        </Panel>
      ) : <Alert severity="info">No recommended actions yet.</Alert>}

      {latest.searchAdaptations?.length ? (
        <Panel title="Search learning">
          <Stack spacing={1}>
            {latest.searchAdaptations.slice(0, 8).map((adaptation, index) => (
              <Box key={`${adaptation.action}-${adaptation.targetProfileId ?? "new"}-${index}`} sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                  <Chip size="small" color={adaptation.status === "applied" ? "success" : adaptation.status === "review_only" ? "warning" : "default"} label={adaptation.status.replace(/_/g, " ")} />
                  <Chip size="small" variant="outlined" label={adaptation.action.replace(/_/g, " ")} />
                  {adaptation.targetProfileName ? <Chip size="small" variant="outlined" label={adaptation.targetProfileName} /> : null}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                  {adaptation.values.length ? `${adaptation.values.join(", ")}. ` : ""}{adaptation.reason ?? adaptation.rationale}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
                  {adaptation.targetProfileId ? <ActionButton href="/profiles" size="small" variant="text">Open profile</ActionButton> : null}
                  {adaptation.status === "review_only" ? <ActionButton href="/settings/learning#settings-quality-proposals" size="small" variant="text">Review proposal</ActionButton> : null}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Panel>
      ) : null}
    </Stack>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ boxShadow: "none" }}>
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>{title}</Typography>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

function Metric({ title, value, helper }: { title: string; value: string | number; helper: string }) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25, bgcolor: "background.paper" }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>{title}</Typography>
      <Typography variant="h3" sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{helper}</Typography>
    </Box>
  );
}

function temperatureColor(temperature: string) {
  if (temperature === "hot") return "success";
  if (temperature === "warm") return "primary";
  if (temperature === "mixed") return "warning";
  return "default";
}

function formatOptionalDate(value: string | Date | null) {
  return value ? new Date(value).toLocaleString() : "never recorded";
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString();
}

function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString();
}
