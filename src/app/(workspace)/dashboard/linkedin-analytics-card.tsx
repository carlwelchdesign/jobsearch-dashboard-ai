"use client";

import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

export type LinkedInAnalyticsSummaryView = {
  range: "7d" | "30d" | "90d" | "365d";
  connection: {
    configured: boolean;
    connected: boolean;
    status: string | null;
    scopes: string[];
    lastSyncedAt: string | null;
    lastError: string | null;
  };
  freshness: {
    latestCapturedAt: string | null;
    sources: string[];
  };
  kpis: {
    impressions: number;
    membersReached: number;
    reactions: number;
    comments: number;
    reshares: number;
    postSaves: number;
    postSends: number;
    linkClicks: number;
    premiumCtaClicks: number;
    followersGainedFromContent: number;
    profileViewsFromContent: number;
    engagement: number;
    engagementRate: number;
  };
  trend: Array<{
    label: string;
    impressions: number;
    membersReached: number;
    reactions: number;
    comments: number;
    reshares: number;
    postSaves: number;
    postSends: number;
    linkClicks: number;
  }>;
  mix: Array<{ label: string; value: number }>;
  topPosts: Array<{
    draftId: string | null;
    postUrn: string;
    title: string;
    pillar: string;
    source: string;
    impressions: number;
    membersReached: number;
    engagement: number;
    engagementRate: number;
  }>;
};

const metricOptions = [
  { value: "impressions", label: "Impressions" },
  { value: "membersReached", label: "Members reached" },
  { value: "reactions", label: "Reactions" },
  { value: "comments", label: "Comments" },
  { value: "reshares", label: "Reposts" },
  { value: "postSaves", label: "Saves" },
  { value: "postSends", label: "Sends" },
  { value: "linkClicks", label: "Link clicks" },
] as const;

const rangeOptions = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "365d", label: "365 days" },
] as const;

const csvPlaceholder = `postUrn,date,impressions,membersReached,reactions,comments,reshares,postSaves,postSends,linkClicks,followersGainedFromContent,profileViewsFromContent
urn:li:ugcPost:123,2026-06-13,1200,840,32,6,3,5,2,14,4,9`;

export function LinkedInAnalyticsCard({ initialSummary }: { initialSummary: LinkedInAnalyticsSummaryView | null }) {
  const [summary, setSummary] = useState(initialSummary);
  const [range, setRange] = useState<LinkedInAnalyticsSummaryView["range"]>(initialSummary?.range ?? "30d");
  const [metric, setMetric] = useState<typeof metricOptions[number]["value"]>("impressions");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refresh(nextRange = range) {
    const body = await fetch(`/api/linkedin-analytics/summary?range=${nextRange}`).then((response) => response.json());
    setSummary(body);
  }

  async function changeRange(nextRange: LinkedInAnalyticsSummaryView["range"]) {
    setRange(nextRange);
    setBusy("summary");
    setError("");
    try {
      await refresh(nextRange);
    } catch {
      setError("Unable to refresh LinkedIn analytics summary.");
    } finally {
      setBusy("");
    }
  }

  async function syncAnalytics() {
    setBusy("sync");
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/linkedin-analytics/sync", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to sync LinkedIn analytics.");
      await refresh();
      setNotice(`LinkedIn analytics synced: ${body.snapshots ?? 0} snapshots.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sync LinkedIn analytics.");
    } finally {
      setBusy("");
    }
  }

  async function importCsv() {
    setBusy("import");
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/linkedin-analytics/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to import LinkedIn analytics CSV.");
      await refresh();
      setCsv("");
      setNotice(`Imported ${body.imported ?? 0} LinkedIn analytics rows.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to import LinkedIn analytics CSV.");
    } finally {
      setBusy("");
    }
  }

  const filteredPosts = useMemo(() => {
    const posts = summary?.topPosts ?? [];
    return sourceFilter === "all" ? posts : posts.filter((post) => post.source === sourceFilter);
  }, [summary, sourceFilter]);

  const scatterData = filteredPosts.map((post) => ({
    title: post.title,
    impressions: post.impressions,
    engagementRate: Math.round(post.engagementRate * 1000) / 10,
    engagement: post.engagement,
  }));

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { lg: "flex-start" } }}>
            <Box>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                <Chip size="small" color="primary" icon={<LinkedInIcon />} label="LinkedIn analytics" />
                <Chip size="small" variant="outlined" label={summary?.connection.connected ? "API connected" : "CSV fallback ready"} />
                {summary?.freshness.latestCapturedAt ? <Chip size="small" variant="outlined" label={`Updated ${new Date(summary.freshness.latestCapturedAt).toLocaleString()}`} /> : null}
              </Stack>
              <Typography variant="h3">Post performance</Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                Executive KPIs from approved LinkedIn posts, API syncs, and CSV imports. Metrics stay aggregate-only.
              </Typography>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap sx={{ flexWrap: "wrap", minWidth: { lg: 520 } }}>
              <TextField select size="small" label="Range" value={range} onChange={(event) => changeRange(event.target.value as LinkedInAnalyticsSummaryView["range"])} sx={{ minWidth: 130 }}>
                {rangeOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Metric" value={metric} onChange={(event) => setMetric(event.target.value as typeof metric)} sx={{ minWidth: 170 }}>
                {metricOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Source" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} sx={{ minWidth: 120 }}>
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="API">API</MenuItem>
                <MenuItem value="CSV">CSV</MenuItem>
              </TextField>
              <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} disabled={busy === "sync" || !summary?.connection.connected} onClick={syncAnalytics}>
                {busy === "sync" ? "Syncing..." : "Refresh"}
              </Button>
              <Button component={Link} href="/api/auth/linkedin/analytics/start" variant={summary?.connection.connected ? "outlined" : "contained"} startIcon={<LinkedInIcon />} disabled={!summary?.connection.configured}>
                {summary?.connection.connected ? "Reconnect" : "Connect"}
              </Button>
            </Stack>
          </Stack>

          {notice ? <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert> : null}
          {error ? <Alert severity="error" onClose={() => setError("")}>{error}</Alert> : null}
          {summary?.connection.lastError ? <Alert severity="warning">Latest LinkedIn API sync warning: {summary.connection.lastError}</Alert> : null}
          {!summary?.connection.connected ? (
            <Alert severity="info">
              LinkedIn analytics requires `r_member_postAnalytics`. If the product is not approved yet, paste exported or manually copied post metrics below.
            </Alert>
          ) : null}

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))", xl: "repeat(6, minmax(0, 1fr))" }, gap: 1 }}>
            {kpiItems(summary).map((item) => (
              <Box key={item.label} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25, bgcolor: "background.paper", minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>{item.label}</Typography>
                <Typography sx={{ fontSize: 24, fontWeight: 950, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>{item.value}</Typography>
                <Typography variant="caption" color="text.secondary">{item.helper}</Typography>
              </Box>
            ))}
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1.2fr 0.8fr" }, gap: 1.5 }}>
            <ChartPanel title={`${metricLabel(metric)} Trend`} helper="Daily imported/API metric snapshots">
              <TrendChart data={summary?.trend ?? []} metric={metric} />
            </ChartPanel>
            <ChartPanel title="Engagement Mix" helper="Part-to-whole engagement and action signals">
              <MixChart data={summary?.mix ?? []} />
            </ChartPanel>
            <ChartPanel title="Top Posts" helper="Best performing published posts by impressions">
              <TopPosts posts={filteredPosts} />
            </ChartPanel>
            <ChartPanel title="Reach vs Engagement" helper="Post-level engagement rate against impression volume">
              <ReachScatter data={scatterData} />
            </ChartPanel>
          </Box>

          <Box sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}>
            <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} sx={{ alignItems: { lg: "flex-start" } }}>
              <TextField
                label="Paste LinkedIn analytics CSV"
                value={csv}
                onChange={(event) => setCsv(event.target.value)}
                multiline
                minRows={4}
                placeholder={csvPlaceholder}
                fullWidth
              />
              <Button variant="contained" startIcon={<UploadFileOutlinedIcon />} disabled={busy === "import" || !csv.trim()} onClick={importCsv} sx={{ minWidth: 150 }}>
                {busy === "import" ? "Importing..." : "Import CSV"}
              </Button>
            </Stack>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function ChartPanel({ title, helper, children }: { title: string; helper: string; children: React.ReactNode }) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>{title}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{helper}</Typography>
      <Box sx={{ height: 260, mt: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

function TrendChart({ data, metric }: { data: LinkedInAnalyticsSummaryView["trend"]; metric: typeof metricOptions[number]["value"] }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing chart..." />;
  if (data.length < 2) return <EmptyChart label="Import or sync daily rows to see a trend." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Line type="monotone" dataKey={metric} name={metricLabel(metric)} stroke={theme.palette.primary.main} strokeWidth={3} dot />
      </LineChart>
    </ResponsiveContainer>
  );
}

function MixChart({ data }: { data: LinkedInAnalyticsSummaryView["mix"] }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing chart..." />;
  if (!data.length) return <EmptyChart label="No engagement mix yet." />;
  const colors = [theme.palette.primary.main, theme.palette.info.main, theme.palette.success.main, theme.palette.warning.main, theme.palette.secondary.main, theme.palette.error.main];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip />
        <Pie data={data} dataKey="value" nameKey="label" innerRadius={48} outerRadius={88} paddingAngle={2} label>
          {data.map((entry, index) => <Cell key={entry.label} fill={colors[index % colors.length]} />)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function TopPosts({ posts }: { posts: LinkedInAnalyticsSummaryView["topPosts"] }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing chart..." />;
  if (!posts.length) return <EmptyChart label="No post metrics yet." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={posts.slice(0, 6)} layout="vertical" margin={{ top: 8, right: 24, left: 12, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="title" width={138} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="impressions" fill={theme.palette.info.main} radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ReachScatter({ data }: { data: Array<{ title: string; impressions: number; engagementRate: number; engagement: number }> }) {
  const theme = useTheme();
  const mounted = useMounted();
  if (!mounted) return <EmptyChart label="Preparing chart..." />;
  if (!data.length) return <EmptyChart label="No post-level performance yet." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" dataKey="impressions" name="Impressions" allowDecimals={false} />
        <YAxis type="number" dataKey="engagementRate" name="Engagement rate %" />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} />
        <Scatter name="Posts" data={data} fill={theme.palette.success.main} />
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

function kpiItems(summary: LinkedInAnalyticsSummaryView | null) {
  const kpis = summary?.kpis;
  return [
    { label: "Impressions", value: formatCount(kpis?.impressions ?? 0), helper: "Content views" },
    { label: "Reach", value: formatCount(kpis?.membersReached ?? 0), helper: "Unique members" },
    { label: "Reactions", value: formatCount(kpis?.reactions ?? 0), helper: "Social proof" },
    { label: "Comments", value: formatCount(kpis?.comments ?? 0), helper: "Conversation" },
    { label: "Reposts", value: formatCount(kpis?.reshares ?? 0), helper: "Amplification" },
    { label: "Saves", value: formatCount(kpis?.postSaves ?? 0), helper: "Return intent" },
    { label: "Sends", value: formatCount(kpis?.postSends ?? 0), helper: "DM shares" },
    { label: "Link clicks", value: formatCount(kpis?.linkClicks ?? 0), helper: "Traffic intent" },
    { label: "CTA clicks", value: formatCount(kpis?.premiumCtaClicks ?? 0), helper: "Premium actions" },
    { label: "Followers", value: formatCount(kpis?.followersGainedFromContent ?? 0), helper: "Audience growth" },
    { label: "Profile views", value: formatCount(kpis?.profileViewsFromContent ?? 0), helper: "Creator interest" },
    { label: "Eng. rate", value: `${Math.round((kpis?.engagementRate ?? 0) * 1000) / 10}%`, helper: "Reactions + comments + reposts" },
  ];
}

function metricLabel(metric: string) {
  return metricOptions.find((option) => option.value === metric)?.label ?? metric;
}

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
}

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
