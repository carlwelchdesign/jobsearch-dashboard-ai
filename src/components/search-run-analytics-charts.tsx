"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { buildSearchRunAnalytics, buildSearchRunTrend, type SearchRunAnalyticsInput, type SearchRunTrendInput } from "@/lib/job-search/run-analytics";

type SearchRunAnalytics = ReturnType<typeof buildSearchRunAnalytics>;

export function SearchRunAnalyticsCharts({
  run,
  runs = [],
  compact = false,
}: {
  run: SearchRunAnalyticsInput | null;
  runs?: SearchRunTrendInput[];
  compact?: boolean;
}) {
  const analytics = buildSearchRunAnalytics(run);
  const trend = runs.length ? buildSearchRunTrend(runs) : [];
  if (compact) return <CompactSearchRunAnalytics analytics={analytics} />;

  return (
    <Stack spacing={1.5}>
      <SearchRunInsightBoard analytics={analytics} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1.08fr 0.92fr" }, gap: 1.5 }}>
        <ChartPanel title="Opportunity Terrain" helper="The latest run broken into actionable territory, friction, and noise">
          <OpportunityTerrainChart analytics={analytics} />
        </ChartPanel>
        <ChartPanel title="Search Signal Profile" helper="Balanced view of quality, readiness, source mix, and blocker pressure">
          <SignalRadar data={analytics.signalProfile} />
        </ChartPanel>
        <ChartPanel title="Source Yield Map" helper="Raw source volume versus qualified and saved opportunity">
          <SourceYieldScatter data={analytics.sourceYield} />
        </ChartPanel>
        <ChartPanel title="Profile Lanes" helper="Which profiles produced qualified and saved matches">
          <ProfileYieldBar data={analytics.profileYield} />
        </ChartPanel>
        <ChartPanel title="Quality Bands" helper="Score distribution across low signal, near misses, qualified, and high-confidence jobs">
          <QualityBandChart data={analytics.qualityBands} />
        </ChartPanel>
        <ChartPanel title="Search Momentum" helper="Recent run trend for qualified, saved, and agency-ready matches">
          <TrendComposed data={trend} />
        </ChartPanel>
      </Box>
      {analytics.explanations.length ? (
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
          {analytics.explanations.map((explanation) => (
            <Chip key={explanation} size="small" variant="outlined" color={explanation.includes("missing") || explanation.includes("threshold") || explanation.includes("BRAVE") ? "warning" : "default"} label={explanation} />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

function CompactSearchRunAnalytics({ analytics }: { analytics: SearchRunAnalytics }) {
  const theme = useTheme();
  const kpis = [
    metric("Fetched", analytics.stats.jobsFetched, "raw", theme.palette.info.main),
    metric("Qualified", analytics.stats.jobsAfterFilters, percentLabel(analytics.stats.jobsAfterFilters, analytics.stats.jobsFetched), theme.palette.success.main),
    metric("Saved", analytics.stats.jobsSaved, percentLabel(analytics.stats.jobsSaved, analytics.stats.jobsFetched), theme.palette.primary.main),
    metric("Agency ready", analytics.stats.agencyEligible ?? 0, "handoff", theme.palette.warning.main),
    metric("Quality", analytics.runQuality.score, analytics.runQuality.label, qualityColorForScore(analytics.runQuality.score, theme)),
  ];

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        bgcolor: "background.paper",
        overflow: "hidden",
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
      }}
    >
      <Box sx={{ px: 1.25, py: 0.9, borderBottom: 1, borderColor: "divider", bgcolor: alpha(theme.palette.grey[900], 0.035) }}>
        <Stack direction={{ xs: "column", lg: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { lg: "center" } }}>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
            <Chip size="small" color="primary" label="Analyze" />
            <Chip size="small" variant="outlined" label="Opportunity sheet" />
            <Chip size="small" variant="outlined" label="Signal diagnostics" />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850 }}>
            {analytics.nextAction.label}: {analytics.nextAction.detail}
          </Typography>
        </Stack>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(5, minmax(0, 1fr))" }, borderBottom: 1, borderColor: "divider" }}>
        {kpis.map((item, index) => (
          <CompactKpi key={item.label} item={item} borderLeft={index > 0} />
        ))}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1fr) 232px" }, gap: 0, minHeight: { xs: 620, xl: 430 } }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 1, p: 1 }}>
          <MiniChartPanel title="Opportunity Terrain" helper="Weighted so action categories stay visible">
            <OpportunityTerrainChart analytics={analytics} />
          </MiniChartPanel>
          <MiniChartPanel title="Search Signal Profile" helper="Quality balance across the run">
            <SignalRadar data={analytics.signalProfile} />
          </MiniChartPanel>
          <MiniChartPanel title="Source Yield Map" helper="Volume versus qualified jobs">
            <SourceYieldScatter data={analytics.sourceYield} />
          </MiniChartPanel>
          <MiniChartPanel title="Quality Bands" helper="Score distribution and near misses">
            <QualityBandChart data={analytics.qualityBands} />
          </MiniChartPanel>
        </Box>

        <Box sx={{ borderLeft: { xl: 1 }, borderTop: { xs: 1, xl: 0 }, borderColor: "divider", bgcolor: alpha(theme.palette.grey[900], 0.025), p: 1 }}>
          <Stack spacing={1}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 950, textTransform: "uppercase" }}>Signal rail</Typography>
            <RailItem label="Best source" value={analytics.bestSource?.label ?? "No source signal"} helper={analytics.bestSource?.helper ?? "Source diagnostics unavailable."} />
            <RailItem label="Best profile" value={analytics.bestProfile?.label ?? "No profile signal"} helper={analytics.bestProfile?.helper ?? "Profile diagnostics unavailable."} />
            <RailItem label="Top blocker" value={analytics.topBlocker?.label ?? "No blocker"} helper={analytics.topBlocker ? `${formatCount(analytics.topBlocker.value)} affected` : "No dominant blocker recorded."} />
            <RailItem label="Apply handoff" value={`${formatCount(analytics.stats.agencyEligible ?? 0)} ready`} helper={`${formatCount(analytics.stats.jobsSaved)} saved matches`} />
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", pt: 0.25 }}>
              {analytics.drops.slice(0, 4).map((drop) => (
                <Chip key={drop.label} size="small" color="warning" variant="outlined" label={`${drop.label}: ${formatCount(drop.value)}`} />
              ))}
            </Stack>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}

function CompactKpi({ item, borderLeft }: { item: ReturnType<typeof metric>; borderLeft: boolean }) {
  return (
    <Box sx={{ p: 1, borderLeft: { xs: 0, md: borderLeft ? 1 : 0 }, borderTop: { xs: borderLeft ? 1 : 0, md: 0 }, borderColor: "divider", minWidth: 0 }}>
      <Stack spacing={0.35}>
        <Stack direction="row" spacing={0.55} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box sx={{ width: 7, height: 7, borderRadius: 99, bgcolor: item.color, flex: "0 0 auto" }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 950, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {item.label}
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: 22, lineHeight: 1, fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{formatCount(item.value)}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.helper}</Typography>
      </Stack>
    </Box>
  );
}

function MiniChartPanel({ title, helper, children }: { title: string; helper: string; children: React.ReactNode }) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, minWidth: 0, overflow: "hidden", bgcolor: "background.paper" }}>
      <Box sx={{ px: 1, py: 0.75, borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="caption" sx={{ display: "block", fontWeight: 950, textTransform: "uppercase" }}>{title}</Typography>
        <Typography variant="caption" color="text.secondary">{helper}</Typography>
      </Box>
      <Box sx={{ height: { xs: 210, sm: 230, lg: 190 } }}>{children}</Box>
    </Box>
  );
}

function RailItem({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "background.paper", p: 0.9 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 950, textTransform: "uppercase" }}>{label}</Typography>
      <Typography sx={{ fontWeight: 900, lineHeight: 1.15 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{helper}</Typography>
    </Box>
  );
}

function SearchRunInsightBoard({ analytics }: { analytics: SearchRunAnalytics }) {
  const theme = useTheme();
  const telemetry = [
    metric("Fetched", analytics.stats.jobsFetched, "raw results", theme.palette.info.main),
    metric("Qualified", analytics.stats.jobsAfterFilters, `${percentLabel(analytics.stats.jobsAfterFilters, analytics.stats.jobsFetched)} of raw`, theme.palette.success.main),
    metric("Saved", analytics.stats.jobsSaved, `${percentLabel(analytics.stats.jobsSaved, analytics.stats.jobsFetched)} of raw`, theme.palette.primary.main),
    metric("Agency ready", analytics.stats.agencyEligible ?? 0, "Apply Sprint candidates", theme.palette.warning.main),
  ];

  return (
    <Card variant="outlined" sx={{ boxShadow: "none", overflow: "hidden" }}>
      <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
        <Box sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "260px minmax(0, 1fr) 320px" },
          gap: 1.5,
          alignItems: "stretch",
        }}>
          <Box sx={{
            border: 1,
            borderColor: alpha(theme.palette.success.main, 0.35),
            borderRadius: 1,
            bgcolor: alpha(theme.palette.success.main, 0.08),
            minHeight: 220,
          }}>
            <RunQualityGauge quality={analytics.runQuality} />
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 1 }}>
            {telemetry.map((item) => (
              <TelemetryTile key={item.label} {...item} />
            ))}
            <Box sx={{ gridColumn: { xs: "1 / -1" }, border: 1, borderColor: "divider", borderRadius: 1, p: 1.25, minWidth: 0 }}>
              <Stack spacing={0.75}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
                  <Chip size="small" color={analytics.nextAction.tone === "success" ? "success" : analytics.nextAction.tone === "warning" ? "warning" : "info"} label="Next action" />
                  {analytics.topBlocker ? <Chip size="small" variant="outlined" label={`${analytics.topBlocker.label}: ${formatCount(analytics.topBlocker.value)}`} /> : null}
                </Stack>
                <Typography sx={{ fontSize: { xs: 20, md: 24 }, lineHeight: 1.12, fontWeight: 950, letterSpacing: 0 }}>{analytics.nextAction.label}</Typography>
                <Typography variant="body2" color="text.secondary">{analytics.nextAction.detail}</Typography>
              </Stack>
            </Box>
          </Box>

          <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25, minWidth: 0 }}>
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>Signal winners</Typography>
              <SignalReadout title="Best source" value={analytics.bestSource?.label ?? "No source signal yet"} helper={analytics.bestSource?.helper ?? "Run source diagnostics are not available yet."} tone="success" />
              <SignalReadout title="Best profile" value={analytics.bestProfile?.label ?? "No profile signal yet"} helper={analytics.bestProfile?.helper ?? "Run profile diagnostics are not available yet."} tone="primary" />
              <SignalReadout title="Top blocker" value={analytics.topBlocker?.label ?? "No dominant blocker"} helper={analytics.topBlocker?.helper ?? "No major friction pattern was recorded."} tone="warning" />
            </Stack>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function RunQualityGauge({ quality, compact = false }: { quality: SearchRunAnalytics["runQuality"]; compact?: boolean }) {
  const theme = useTheme();
  const mounted = useMounted();
  const data = [{ name: quality.label, score: quality.score, fill: qualityColorForScore(quality.score, theme) }];
  return (
    <Stack spacing={compact ? 0.25 : 0.75} sx={{ height: "100%", alignItems: "center", justifyContent: "center", p: compact ? 0 : 1.25, textAlign: "center" }}>
      <Box sx={{ width: "100%", height: compact ? 82 : 132 }}>
        {!mounted ? <EmptyChart label="Preparing gauge..." plain /> : (
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart innerRadius="68%" outerRadius="96%" data={data} startAngle={210} endAngle={-30}>
              <RadialBar background cornerRadius={8} dataKey="score" />
            </RadialBarChart>
          </ResponsiveContainer>
        )}
      </Box>
      <Typography sx={{ fontSize: compact ? 28 : 38, lineHeight: 1, fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{quality.score}</Typography>
      <Typography sx={{ fontWeight: 900, lineHeight: 1.1 }}>{quality.label}</Typography>
      {!compact ? <Typography variant="caption" color="text.secondary">{quality.helper}</Typography> : null}
    </Stack>
  );
}

function TelemetryTile({ label, value, helper, color }: ReturnType<typeof metric>) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.2, minWidth: 0 }}>
      <Stack spacing={0.65}>
        <Stack direction="row" spacing={0.7} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: 99, bgcolor: color, flex: "0 0 auto" }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {label}
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: 28, fontWeight: 950, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{formatCount(value)}</Typography>
        <Typography variant="caption" color="text.secondary">{helper}</Typography>
      </Stack>
    </Box>
  );
}

function SignalReadout({ title, value, helper, tone }: { title: string; value: string; helper: string; tone: "success" | "primary" | "warning" }) {
  return (
    <Box sx={{ borderLeft: 3, borderColor: `${tone}.main`, pl: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>{title}</Typography>
      <Typography sx={{ fontWeight: 850, lineHeight: 1.2 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{helper}</Typography>
    </Box>
  );
}

function ChartPanel({ title, helper, children }: { title: string; helper: string; children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ boxShadow: "none", minWidth: 0 }}>
      <CardContent>
        <Stack spacing={0.75}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">{helper}</Typography>
          <Box sx={{ height: 250 }}>{children}</Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function OpportunityTerrainChart({ analytics }: { analytics: SearchRunAnalytics }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing terrain..." />;
  if (!analytics.opportunityTerrain.length) return <EmptyChart label="No run terrain recorded yet." />;
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 190px" }, gap: 1, height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip formatter={(_value, _name, item) => [formatCount(item.payload.count), item.payload.name]} />
          <Pie
            data={analytics.opportunityTerrain}
            dataKey="size"
            nameKey="name"
            innerRadius="46%"
            outerRadius="82%"
            paddingAngle={2}
            stroke={theme.palette.background.paper}
            strokeWidth={3}
          >
            {analytics.opportunityTerrain.map((item, index) => (
              <Cell key={item.name} fill={outcomeColor(item.fillKey, theme, index)} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <Stack spacing={0.75} sx={{ overflow: "auto", pr: 0.5 }}>
        {analytics.opportunityTerrain.slice(0, 7).map((item, index) => (
          <Stack key={item.name} direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: outcomeColor(item.fillKey, theme, index), flex: "0 0 auto" }} />
            <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ fontWeight: 850 }}>{item.name}: {formatCount(item.count)}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{item.helper}</Typography>
            </Box>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

function SignalRadar({ data }: { data: SearchRunAnalytics["signalProfile"] }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing radar..." />;
  if (!data.length) return <EmptyChart label="No signal profile yet." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
        <Tooltip formatter={(value, _name, item) => [`${Math.round(Number(value))}/100`, item.payload.helper]} />
        <Radar name="Signal" dataKey="value" stroke={theme.palette.success.main} fill={theme.palette.success.main} fillOpacity={0.28} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function ProfileYieldBar({ data }: { data: SearchRunAnalytics["profileYield"] }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing profile lanes..." />;
  if (!data.length) return <EmptyChart label="No per-profile diagnostics recorded yet." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 12, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="qualified" fill={theme.palette.success.main} radius={[0, 5, 5, 0]} />
        <Bar dataKey="saved" fill={theme.palette.primary.main} radius={[0, 5, 5, 0]} />
        <Bar dataKey="capped" fill={theme.palette.error.main} radius={[0, 5, 5, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function SourceYieldScatter({ data }: { data: SearchRunAnalytics["sourceYield"] }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing source map..." />;
  if (!data.length) return <EmptyChart label="No per-source diagnostics recorded yet." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 12, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" dataKey="fetched" name="Fetched" allowDecimals={false} />
        <YAxis type="number" dataKey="qualified" name="Qualified" allowDecimals={false} />
        <ZAxis type="number" dataKey="saved" range={[80, 520]} name="Saved" />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} />
        <Scatter name="Sources" data={data} fill={theme.palette.primary.main}>
          {data.map((entry, index) => (
            <Cell key={entry.label} fill={index === 0 ? theme.palette.success.main : theme.palette.primary.main} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function QualityBandChart({ data }: { data: SearchRunAnalytics["qualityBands"] }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing quality bands..." />;
  if (!data.length) return <EmptyChart label="No score bucket data recorded yet." />;
  const row = data.reduce<Record<string, number | string>>((record, item) => {
    record[item.label] = item.value;
    return record;
  }, { name: "quality" });
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={[row]} layout="vertical" margin={{ top: 36, right: 24, left: 0, bottom: 24 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" hide />
        <Tooltip />
        <Legend />
        {data.map((item, index) => (
          <Bar key={item.label} dataKey={item.label} stackId="quality" fill={qualityBandColor(item.label, theme, index)} radius={index === data.length - 1 ? [0, 8, 8, 0] : [0, 0, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function TrendComposed({ data }: { data: Array<{ label: string; fetched: number; qualified: number; saved: number; agencyEligible: number }> }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing trend..." />;
  if (data.length < 2) return <EmptyChart label="Run at least two searches to see momentum." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Bar dataKey="agencyEligible" fill={alpha(theme.palette.warning.main, 0.45)} name="Agency ready" radius={[5, 5, 0, 0]} />
        <Line type="monotone" dataKey="qualified" stroke={theme.palette.success.main} strokeWidth={2.5} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="saved" stroke={theme.palette.primary.main} strokeWidth={2.5} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function EmptyChart({ label, plain = false }: { label: string; plain?: boolean }) {
  return (
    <Box sx={{ height: "100%", display: "grid", placeItems: "center", border: plain ? 0 : 1, borderColor: "divider", borderRadius: 1, color: "text.secondary" }}>
      <Typography variant="body2">{label}</Typography>
    </Box>
  );
}

function metric(label: string, value: number, helper: string, color: string) {
  return { label, value, helper, color };
}

function outcomeColor(label: string, theme: Theme, index: number) {
  if (label === "Saved") return theme.palette.primary.main;
  if (label === "Agency eligible") return theme.palette.warning.main;
  if (label === "Review-only") return theme.palette.info.main;
  if (label === "Missing URL") return theme.palette.error.main;
  if (label === "Existing match") return theme.palette.secondary.main;
  if (label === "Below threshold") return theme.palette.grey[600];
  if (label === "Suppressed/listing") return theme.palette.grey[800];
  return chartPalette(theme)[index % chartPalette(theme).length];
}

function qualityBandColor(label: string, theme: Theme, index: number) {
  if (label === "Below") return theme.palette.grey[500];
  if (label === "Near miss") return theme.palette.warning.main;
  if (label === "Qualified") return theme.palette.success.main;
  if (label === "High confidence") return theme.palette.primary.main;
  return chartPalette(theme)[index % chartPalette(theme).length];
}

function qualityColorForScore(score: number, theme: Theme) {
  if (score >= 70) return theme.palette.success.main;
  if (score >= 40) return theme.palette.warning.main;
  return theme.palette.error.main;
}

function chartPalette(theme: Theme) {
  return [
    theme.palette.success.main,
    theme.palette.primary.main,
    theme.palette.warning.main,
    theme.palette.info.main,
    theme.palette.secondary.main,
    theme.palette.error.main,
  ];
}

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
}

function percentLabel(value: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((value / total) * 1000) / 10}%`;
}

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
