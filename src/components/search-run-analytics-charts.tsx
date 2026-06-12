"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 1.5 }}>
        <ChartPanel title="Search Funnel" helper="Raw discovery volume through application-ready handoff">
          <ConversionFlow data={analytics.funnel} />
        </ChartPanel>
        <ChartPanel title="What Held Jobs Back" helper="Largest reasons fetched jobs did not become Apply Sprint candidates">
          <SimpleBar data={analytics.drops} empty="No drop-off reasons recorded yet." />
        </ChartPanel>
        <ChartPanel title="Profile Yield" helper="Per-profile volume, qualification, and caps">
          <ProfileBar data={analytics.byProfile} />
        </ChartPanel>
        <ChartPanel title="Source Yield" helper="Provider/source raw volume versus qualified matches">
          <SourceBar data={analytics.bySource} />
        </ChartPanel>
        <ChartPanel title="Score Distribution" helper="Below threshold, near-miss, qualified, and high-confidence jobs">
          <SimpleBar data={analytics.scoreDistribution} empty="No score bucket data recorded yet." />
        </ChartPanel>
        <ChartPanel title="Recent Search Trend" helper="Run-over-run fetched, qualified, saved, and agency eligible counts">
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
  const funnel = analytics.funnel;
  const fetched = analytics.stats.jobsFetched;
  const kpis = [
    metric("Fetched", analytics.stats.jobsFetched, "raw", theme.palette.info.main),
    metric("New jobs", analytics.stats.jobsAfterDedupe, "deduped", theme.palette.info.dark),
    metric("Scored", analytics.stats.jobsScored ?? analytics.stats.detailCandidates ?? 0, "evaluated", theme.palette.secondary.main),
    metric("Qualified", analytics.stats.jobsAfterFilters, "matched", theme.palette.success.main),
    metric("New matches", analytics.stats.jobsSaved, "saved", theme.palette.primary.main),
    metric("Agency", analytics.stats.agencyEligible ?? 0, "eligible", theme.palette.warning.main),
  ];
  const topDrops = analytics.drops.slice(0, 4);

  return (
    <Box sx={{
      border: 1,
      borderColor: "divider",
      borderRadius: 1,
      bgcolor: "background.paper",
      overflow: "hidden",
    }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))", lg: "repeat(6, minmax(0, 1fr))" } }}>
        {kpis.map((item, index) => (
          <Box
            key={item.label}
            sx={{
              p: 1.1,
              borderLeft: { xs: index % 2 === 0 ? 0 : 1, sm: index % 3 === 0 ? 0 : 1, lg: index === 0 ? 0 : 1 },
              borderTop: { xs: index > 1 ? 1 : 0, sm: index > 2 ? 1 : 0, lg: 0 },
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
        <Stack spacing={0.8}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>
              Live conversion
            </Typography>
            {fetched > 0 ? (
              <Typography variant="caption" color="text.secondary">
                {conversionRate(analytics.stats.jobsSaved, fetched)} saved from raw
              </Typography>
            ) : null}
          </Stack>
          <ConversionFlow data={funnel} dense />
        </Stack>
      </Box>

      <Box sx={{ px: 1.25, py: 1, borderTop: 1, borderColor: "divider", bgcolor: "rgba(15, 23, 42, 0.02)" }}>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          {topDrops.length ? topDrops.map((drop) => (
            <Chip key={drop.label} size="small" variant="outlined" label={`${drop.label}: ${formatCount(drop.value)}`} />
          )) : <Typography variant="caption" color="text.secondary">No blocker pattern recorded yet.</Typography>}
          {analytics.explanations[0] ? <Chip size="small" color="warning" variant="outlined" label={analytics.explanations[0]} /> : null}
        </Stack>
      </Box>
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
          <Box sx={{ height: 220 }}>{children}</Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function ConversionFlow({ data, dense = false }: { data: Array<{ label: string; value: number; helper: string }>; dense?: boolean }) {
  const theme = useTheme();
  if (!data.some((item) => item.value > 0)) return <EmptyChart label="No run data yet." />;
  const transitions = data.slice(0, -1).map((step, index) => {
    const next = data[index + 1];
    const retained = next?.value ?? 0;
    const dropped = Math.max(0, step.value - retained);
    const retainedPercent = step.value > 0 ? Math.max(0, Math.min(100, (retained / step.value) * 100)) : 0;
    return { from: step, to: next, retained, dropped, retainedPercent };
  });

  return (
    <Stack spacing={dense ? 0.75 : 1} sx={{ height: dense ? "auto" : "100%", justifyContent: "center" }}>
      {transitions.map((item) => (
        <Box key={`${item.from.label}-${item.to?.label}`} sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", justifyContent: "space-between", mb: 0.35 }}>
            <Typography variant="caption" sx={{ fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.from.label} → {item.to?.label}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums", flex: "0 0 auto" }}>
              {Math.round(item.retainedPercent)}% kept · {formatCount(item.dropped)} dropped
            </Typography>
          </Stack>
          <Box sx={{ display: "flex", height: dense ? 9 : 12, borderRadius: 99, overflow: "hidden", bgcolor: "action.hover" }}>
            <Box
              sx={{
                width: `${item.retainedPercent}%`,
                minWidth: item.retained > 0 ? 4 : 0,
                bgcolor: item.retainedPercent >= 50 ? theme.palette.success.main : theme.palette.warning.main,
              }}
            />
            <Box sx={{ flex: 1, bgcolor: item.dropped > 0 ? "rgba(239, 68, 68, 0.22)" : "transparent" }} />
          </Box>
          {!dense ? (
            <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", mt: 0.25 }}>
              <Typography variant="caption" color="text.secondary">{formatCount(item.from.value)} {item.from.helper.toLowerCase()}</Typography>
              <Typography variant="caption" color="text.secondary">{formatCount(item.retained)} continue</Typography>
            </Stack>
          ) : null}
        </Box>
      ))}
    </Stack>
  );
}

function SimpleBar({ data, empty }: { data: Array<{ label: string; value: number }>; empty: string }) {
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
        <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={theme.palette.warning.main} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ProfileBar({ data }: { data: Array<{ label: string; fetched: number; scored: number; qualified: number; saved: number; capped: number }> }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing chart..." />;
  if (!data.length) return <EmptyChart label="No per-profile diagnostics recorded yet." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={58} />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Bar dataKey="qualified" stackId="profile" fill={theme.palette.success.main} />
        <Bar dataKey="saved" stackId="profile" fill={theme.palette.primary.main} />
        <Bar dataKey="capped" stackId="profile" fill={theme.palette.error.main} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function SourceBar({ data }: { data: Array<{ label: string; fetched: number; scored: number; qualified: number; saved: number }> }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing chart..." />;
  if (!data.length) return <EmptyChart label="No per-source diagnostics recorded yet." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={58} />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Bar dataKey="fetched" fill={theme.palette.info.main} />
        <Bar dataKey="qualified" fill={theme.palette.success.main} />
        <Bar dataKey="saved" fill={theme.palette.primary.main} />
      </BarChart>
    </ResponsiveContainer>
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
        <Line type="monotone" dataKey="fetched" stroke={theme.palette.info.main} strokeWidth={2} dot={false} />
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

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
}

function conversionRate(value: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((value / total) * 1000) / 10}%`;
}

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
