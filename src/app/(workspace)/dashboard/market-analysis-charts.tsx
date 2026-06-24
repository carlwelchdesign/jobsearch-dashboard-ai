"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme, type Theme } from "@mui/material/styles";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MarketIntelligenceOutput } from "@/lib/agents/market-intelligence";
import type { MarketTrendPoint } from "./market-analysis-card";

export function MarketAnalysisCharts({ latest, trendSeries }: { latest: MarketIntelligenceOutput; trendSeries: MarketTrendPoint[] }) {
  const chartData = latest.chartData;
  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 1.5 }}>
        <ChartPanel title="Role Lane Demand" helper="Category comparison by recent matching jobs">
          <BarChartBlock data={(chartData.laneDemand ?? []).slice(0, 8)} colorIndex={0} />
        </ChartPanel>
        <ChartPanel title="Skill Signals" helper="Category comparison by matched posting mentions">
          <BarChartBlock data={(chartData.skillDemand ?? []).slice(0, 10)} colorIndex={1} />
        </ChartPanel>
        <ChartPanel title="Market Trend" helper="Trend over time from completed market intelligence runs">
          <TrendChartBlock data={trendSeries} />
        </ChartPanel>
        <ChartPanel title="Profile Health" helper="Search profile health comparison">
          <BarChartBlock data={(chartData.profileHealth ?? []).slice(0, 8)} colorIndex={2} />
        </ChartPanel>
        <ChartPanel title="Action Mix" helper="Part-to-whole recommended action distribution">
          <PieChartBlock data={chartData.actionMix ?? []} />
        </ChartPanel>
        <ChartPanel title="Match Quality Distribution" helper="Fit score by opportunity score for recent matches">
          <ScatterChartBlock data={chartData.matchQualityDistribution ?? []} />
        </ChartPanel>
      </Box>
    </Stack>
  );
}

function ChartPanel({ title, helper, children }: { title: string; helper: string; children: React.ReactNode }) {
  return (
    <Panel title={title}>
      <Typography variant="caption" color="text.secondary">{helper}</Typography>
      <Box sx={{ height: 280, mt: 1, minWidth: 0, width: "100%" }}>
        {children}
      </Box>
    </Panel>
  );
}

function BarChartBlock({ data, colorIndex }: { data: Array<{ label: string; value: number }>; colorIndex: number }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing chart..." />;
  if (!data.length) return <EmptyChart label="No data available yet." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={chartColors(theme)[colorIndex]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TrendChartBlock({ data }: { data: MarketTrendPoint[] }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing chart..." />;
  if (data.length < 2) return <EmptyChart label="Run at least two market briefs to see trends." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Line type="monotone" dataKey="topLaneJobs" name="Top lane jobs" stroke={theme.palette.info.main} strokeWidth={3} dot />
        <Line type="monotone" dataKey="confidencePercent" name="Confidence %" stroke={theme.palette.success.main} strokeWidth={2} dot />
      </LineChart>
    </ResponsiveContainer>
  );
}

function PieChartBlock({ data }: { data: Array<{ label: string; value: number }> }) {
  const theme = useTheme();
  const colors = chartColors(theme);
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing chart..." />;
  if (!data.length) return <EmptyChart label="No action mix available yet." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip />
        <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={52} outerRadius={92} paddingAngle={2} label>
          {data.map((entry, index) => <Cell key={entry.label} fill={colors[index % colors.length]} />)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function ScatterChartBlock({ data }: { data: MarketIntelligenceOutput["chartData"]["matchQualityDistribution"] }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing chart..." />;
  if (!data.length) return <EmptyChart label="No scored matches available yet." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" dataKey="fitScore" name="Fit" domain={[0, 100]} />
        <YAxis type="number" dataKey="opportunityScore" name="Opportunity" domain={[0, 100]} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} />
        <Scatter name="Matches" data={data} fill={theme.palette.info.main} />
      </ScatterChart>
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ boxShadow: "none", minWidth: 0 }}>
      <CardContent>
        <Stack spacing={1} sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>{title}</Typography>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

function chartColors(theme: Theme) {
  return [
    theme.palette.info.main,
    theme.palette.primary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.secondary.main,
    theme.palette.error.main,
  ];
}

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
