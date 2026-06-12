"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
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

  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: compact ? "1fr" : "1fr 1fr" }, gap: 1.5 }}>
        <ChartPanel title="Search Funnel" helper="Raw discovery volume through application-ready handoff">
          <FunnelBar data={analytics.funnel} />
        </ChartPanel>
        <ChartPanel title="What Held Jobs Back" helper="Largest reasons fetched jobs did not become Apply Sprint candidates">
          <SimpleBar data={analytics.drops} empty="No drop-off reasons recorded yet." />
        </ChartPanel>
        {!compact ? (
          <>
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
          </>
        ) : null}
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

function ChartPanel({ title, helper, children }: { title: string; helper: string; children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ boxShadow: "none", minWidth: 0 }}>
      <CardContent>
        <Stack spacing={0.75}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">{helper}</Typography>
          <Box sx={{ height: 280 }}>{children}</Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function FunnelBar({ data }: { data: Array<{ label: string; value: number; helper: string }> }) {
  const theme = useTheme();
  if (!data.some((item) => item.value > 0)) return <EmptyChart label="No run data yet." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 16, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={112} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(value, _name, props) => [value, props.payload?.helper ?? "Count"]} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={theme.palette.primary.main} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function SimpleBar({ data, empty }: { data: Array<{ label: string; value: number }>; empty: string }) {
  const theme = useTheme();
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
