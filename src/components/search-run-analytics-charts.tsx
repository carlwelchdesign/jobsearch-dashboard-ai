"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme, type Theme } from "@mui/material/styles";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { buildSearchRunAnalytics, buildSearchRunTrend, type SearchRunAnalyticsInput, type SearchRunTrendInput } from "@/lib/job-search/run-analytics";

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
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 1.5 }}>
        <ChartPanel title="Run Outcome Mix" helper="Where the latest search landed after scoring and handoff checks">
          <OutcomeMixChart data={analytics.outcomeMix} />
        </ChartPanel>
        <ChartPanel title="Blocker Priority" helper="Largest reasons jobs did not become application-ready matches">
          <BlockerBar data={analytics.drops} empty="No blocker pattern recorded yet." />
        </ChartPanel>
        <ChartPanel title="Profile Yield" helper="Ranked profile output: qualified, saved, and capped matches">
          <ProfileYieldBar data={analytics.profileYield} />
        </ChartPanel>
        <ChartPanel title="Source Yield Map" helper="Raw source volume versus qualified and saved opportunity yield">
          <SourceYieldScatter data={analytics.sourceYield} />
        </ChartPanel>
        <ChartPanel title="Quality Bands" helper="Below threshold, near-miss, qualified, and high-confidence jobs">
          <QualityBandChart data={analytics.qualityBands} />
        </ChartPanel>
        <ChartPanel title="Recent Search Trend" helper="Run-over-run qualified, saved, and agency eligible counts">
          <TrendLine data={trend} />
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

function CompactSearchRunAnalytics({ analytics }: { analytics: ReturnType<typeof buildSearchRunAnalytics> }) {
  const theme = useTheme();
  const kpis = [
    metric("Fetched", analytics.stats.jobsFetched, "raw", theme.palette.info.main),
    metric("Qualified", analytics.stats.jobsAfterFilters, "matched", theme.palette.success.main),
    metric("Saved", analytics.stats.jobsSaved, "matches", theme.palette.primary.main),
    metric("Agency", analytics.stats.agencyEligible ?? 0, "eligible", theme.palette.warning.main),
  ];
  const topDrops = analytics.drops.slice(0, 2);

  return (
    <Box sx={{
      border: 1,
      borderColor: "divider",
      borderRadius: 1,
      bgcolor: "background.paper",
      overflow: "hidden",
    }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" } }}>
        {kpis.map((item, index) => (
          <Box
            key={item.label}
            sx={{
              p: 1.1,
              borderLeft: { xs: index % 2 === 0 ? 0 : 1, lg: index === 0 ? 0 : 1 },
              borderTop: { xs: index > 1 ? 1 : 0, lg: 0 },
              borderColor: "divider",
              minWidth: 0,
            }}
          >
            <Stack spacing={0.45}>
              <Stack direction="row" spacing={0.65} sx={{ alignItems: "center", minWidth: 0 }}>
                <Box sx={{ width: 7, height: 7, borderRadius: 99, bgcolor: item.color, flex: "0 0 auto" }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.label}
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: 24, fontWeight: 950, lineHeight: 1, letterSpacing: 0, fontVariantNumeric: "tabular-nums" }}>
                {formatCount(item.value)}
              </Typography>
              <Typography variant="caption" color="text.secondary">{item.helper}</Typography>
            </Stack>
          </Box>
        ))}
      </Box>

      <Box sx={{ px: 1.25, py: 1, borderTop: 1, borderColor: "divider" }}>
        <CompactOutcomeChart analytics={analytics} />
      </Box>

      <Box sx={{ px: 1.25, py: 1, borderTop: 1, borderColor: "divider", bgcolor: "rgba(15, 23, 42, 0.02)" }}>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          {analytics.bestSource ? <Chip size="small" color="success" variant="outlined" label={`Best source: ${analytics.bestSource.label}`} /> : null}
          {analytics.bestProfile ? <Chip size="small" color="primary" variant="outlined" label={`Best profile: ${analytics.bestProfile.label}`} /> : null}
          {topDrops.length ? topDrops.map((drop) => (
            <Chip key={drop.label} size="small" color="warning" variant="outlined" label={`${drop.label}: ${formatCount(drop.value)}`} />
          )) : <Typography variant="caption" color="text.secondary">No blocker pattern recorded yet.</Typography>}
        </Stack>
      </Box>
    </Box>
  );
}

function SearchRunInsightBoard({ analytics }: { analytics: ReturnType<typeof buildSearchRunAnalytics> }) {
  const theme = useTheme();
  const fetched = analytics.stats.jobsFetched;
  const qualifiedRate = percentLabel(analytics.stats.jobsAfterFilters, fetched);
  const saveRate = percentLabel(analytics.stats.jobsSaved, fetched);
  const cards = [
    metric("Fetched", analytics.stats.jobsFetched, "raw results", theme.palette.info.main),
    metric("Qualified", analytics.stats.jobsAfterFilters, `${qualifiedRate} of raw`, theme.palette.success.main),
    metric("Saved", analytics.stats.jobsSaved, `${saveRate} of raw`, theme.palette.primary.main),
    metric("Agency eligible", analytics.stats.agencyEligible ?? 0, "ready for Apply Sprint", theme.palette.warning.main),
  ];

  return (
    <Card variant="outlined" sx={{ boxShadow: "none", overflow: "hidden" }}>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={1.25} sx={{ alignItems: { lg: "stretch" } }}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" }, gap: 1, flex: 1 }}>
              {cards.map((item) => (
                <Box key={item.label} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25, minWidth: 0 }}>
                  <Stack spacing={0.65}>
                    <Stack direction="row" spacing={0.7} sx={{ alignItems: "center", minWidth: 0 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: 99, bgcolor: item.color, flex: "0 0 auto" }} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.label}
                      </Typography>
                    </Stack>
                    <Typography sx={{ fontSize: 28, fontWeight: 950, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{formatCount(item.value)}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.helper}</Typography>
                  </Stack>
                </Box>
              ))}
            </Box>
            <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25, minWidth: { lg: 320 }, flex: "0 0 34%" }}>
              <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>Run readout</Typography>
                <OutcomeSegmentBar data={analytics.outcomeMix} />
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {analytics.topBlocker ? <SignalChip tone="warning" label="Top blocker" value={`${analytics.topBlocker.label}: ${formatCount(analytics.topBlocker.value)}`} /> : null}
                  {analytics.bestSource ? <SignalChip tone="success" label="Best source" value={analytics.bestSource.label} /> : null}
                  {analytics.bestProfile ? <SignalChip tone="primary" label="Best profile" value={analytics.bestProfile.label} /> : null}
                </Stack>
              </Stack>
            </Box>
          </Stack>
          {analytics.topBlocker ? (
            <Box sx={{ borderLeft: 3, borderColor: "warning.main", pl: 1.25 }}>
              <Typography sx={{ fontWeight: 850 }}>{analytics.topBlocker.helper}</Typography>
              <Typography variant="caption" color="text.secondary">{formatCount(analytics.topBlocker.value)} affected item{analytics.topBlocker.value === 1 ? "" : "s"} in the latest run.</Typography>
            </Box>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function ChartPanel({ title, helper, children }: { title: string; helper: string; children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ boxShadow: "none", minWidth: 0 }}>
      <CardContent>
        <Stack spacing={0.75}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">{helper}</Typography>
          <Box sx={{ height: 220 }}>{children}</Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function BlockerBar({ data, empty }: { data: Array<{ label: string; value: number }>; empty: string }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing chart..." />;
  if (!data.length) return <EmptyChart label={empty} />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data.slice(0, 8)} layout="vertical" margin={{ top: 8, right: 24, left: 16, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={138} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={theme.palette.warning.main} name="Affected" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ProfileYieldBar({ data }: { data: Array<{ label: string; qualified: number; saved: number; capped: number; yieldRate: number }> }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing chart..." />;
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

function SourceYieldScatter({ data }: { data: Array<{ label: string; fetched: number; qualified: number; saved: number; qualifiedRate: number; saveRate: number }> }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing chart..." />;
  if (!data.length) return <EmptyChart label="No per-source diagnostics recorded yet." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 12, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" dataKey="fetched" name="Fetched" allowDecimals={false} />
        <YAxis type="number" dataKey="qualified" name="Qualified" allowDecimals={false} />
        <ZAxis type="number" dataKey="saved" range={[70, 420]} name="Saved" />
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

function OutcomeMixChart({ data }: { data: Array<{ label: string; value: number; helper: string }> }) {
  if (!data.length) return <EmptyChart label="No run outcome data yet." />;
  return (
    <Stack spacing={1.25} sx={{ height: "100%", justifyContent: "center" }}>
      <OutcomeSegmentBar data={data} />
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
        {data.slice(0, 6).map((item) => (
          <Chip key={item.label} size="small" variant="outlined" label={`${item.label}: ${formatCount(item.value)}`} />
        ))}
      </Stack>
    </Stack>
  );
}

function QualityBandChart({ data }: { data: Array<{ label: string; value: number; helper: string }> }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing chart..." />;
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
          <Bar key={item.label} dataKey={item.label} stackId="quality" fill={qualityColor(item.label, theme, index)} radius={index === data.length - 1 ? [0, 8, 8, 0] : [0, 0, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function CompactOutcomeChart({ analytics }: { analytics: ReturnType<typeof buildSearchRunAnalytics> }) {
  return (
    <Stack spacing={0.8}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>Run outcome</Typography>
        <Typography variant="caption" color="text.secondary">{percentLabel(analytics.stats.jobsSaved, analytics.stats.jobsFetched)} saved</Typography>
      </Stack>
      <OutcomeSegmentBar data={analytics.outcomeMix} />
    </Stack>
  );
}

function OutcomeSegmentBar({ data }: { data: Array<{ label: string; value: number }> }) {
  const theme = useTheme();
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return <EmptyChart label="No run data yet." />;
  return (
    <Box sx={{ display: "flex", height: 18, overflow: "hidden", borderRadius: 1, bgcolor: "action.hover" }}>
      {data.map((item, index) => (
        <Box
          key={item.label}
          title={`${item.label}: ${formatCount(item.value)}`}
          sx={{
            width: `${Math.max(2, (item.value / total) * 100)}%`,
            bgcolor: outcomeColor(item.label, theme, index),
          }}
        />
      ))}
    </Box>
  );
}

function TrendLine({ data }: { data: Array<{ label: string; fetched: number; qualified: number; saved: number; agencyEligible: number }> }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing chart..." />;
  if (data.length < 2) return <EmptyChart label="Run at least two searches to see trend lines." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="qualified" stroke={theme.palette.success.main} strokeWidth={2} />
        <Line type="monotone" dataKey="saved" stroke={theme.palette.primary.main} strokeWidth={2} />
        <Line type="monotone" dataKey="agencyEligible" stroke={theme.palette.warning.main} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <Box sx={{ height: "100%", display: "grid", placeItems: "center", border: 1, borderColor: "divider", borderRadius: 1, color: "text.secondary" }}>
      <Typography variant="body2">{label}</Typography>
    </Box>
  );
}

function metric(label: string, value: number, helper: string, color: string) {
  return { label, value, helper, color };
}

function SignalChip({ tone, label, value }: { tone: "warning" | "success" | "primary"; label: string; value: string }) {
  return <Chip size="small" color={tone} variant="outlined" label={`${label}: ${value}`} />;
}

function outcomeColor(label: string, theme: Theme, index: number) {
  if (label === "Saved") return theme.palette.primary.main;
  if (label === "Agency eligible") return theme.palette.warning.main;
  if (label === "Review-only") return theme.palette.info.main;
  if (label === "Missing URL") return theme.palette.error.main;
  if (label === "Existing match") return theme.palette.secondary.main;
  if (label === "Below threshold") return theme.palette.grey[500];
  if (label === "Suppressed/listing") return theme.palette.grey[700];
  return chartPalette(theme)[index % chartPalette(theme).length];
}

function qualityColor(label: string, theme: Theme, index: number) {
  if (label === "Below") return theme.palette.grey[500];
  if (label === "Near miss") return theme.palette.warning.main;
  if (label === "Qualified") return theme.palette.success.main;
  if (label === "High confidence") return theme.palette.primary.main;
  return chartPalette(theme)[index % chartPalette(theme).length];
}

function chartPalette(theme: Theme) {
  return [
    theme.palette.primary.main,
    theme.palette.success.main,
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
