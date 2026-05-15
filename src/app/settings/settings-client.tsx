"use client";

import Link from "next/link";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import GitHubIcon from "@mui/icons-material/GitHub";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import SourceOutlinedIcon from "@mui/icons-material/SourceOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { ScoreChip } from "@/components/ui/score-chip";
import { StatusChip } from "@/components/ui/status-chip";

type SettingsClientProps = {
  initialSettings: {
    emailEnabled: boolean;
    emailAddress: string;
    pushoverEnabled: boolean;
    pushoverUserKey: string;
    pushoverAppToken: string;
    minimumScoreForPush: number;
    digestMode: "every_run" | "daily_summary" | "strong_matches_only";
  };
  aiSettings: {
    configured: boolean;
    model: string;
  };
  sourceSettings: {
    companySourceEnabled: boolean;
    companyCount: number;
    priorityMax: number;
    maxCompanies: number;
    maxFetch: number;
  };
  profileSettings: {
    linkedinUrl: string;
    githubUrl: string;
    raceAnswer: string;
    genderAnswer: string;
    veteranStatusAnswer: string;
    disabilityAnswer: string;
    githubRepositoryCount: number;
    latestGithubSync: string | null;
  };
  latestGithubReview: {
    overallReadinessScore?: number;
    reviewedRepositoryCount?: number;
    priorityActions?: string[];
    warnings?: string[];
    repositoryReviews?: Array<{
      repositoryId: string;
      name: string;
      url: string;
      readinessScore: number;
      targetTracks: string[];
      gaps: string[];
      recommendedEdits: string[];
    }>;
  } | null;
  cronSettings: {
    enabled: boolean;
    cronExpression: string;
    scheduleLabel: string;
    endpoint: string;
    cronSecretConfigured: boolean;
    profiles: Array<{
      id: string;
      name: string;
      enabled: boolean;
      scheduleEnabled: boolean;
      cronExpression: string | null;
    }>;
  };
};

export function SettingsClient({ initialSettings, aiSettings, sourceSettings, profileSettings, latestGithubReview, cronSettings }: SettingsClientProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [profile, setProfile] = useState(profileSettings);
  const [cron, setCron] = useState(cronSettings);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncingGithub, setSyncingGithub] = useState(false);
  const [reviewingGithub, setReviewingGithub] = useState(false);
  const [githubReview, setGithubReview] = useState(latestGithubReview);
  const [runningCron, setRunningCron] = useState(false);
  const [cronDirty, setCronDirty] = useState(false);

  async function save() {
    setSaving(true);
    setNotice("");
    setError("");
    const [profileResponse, response, cronResponse] = await Promise.all([
      fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          githubUrl: profile.githubUrl,
          linkedinUrl: profile.linkedinUrl,
          raceAnswer: profile.raceAnswer,
          genderAnswer: profile.genderAnswer,
          veteranStatusAnswer: profile.veteranStatusAnswer,
          disabilityAnswer: profile.disabilityAnswer,
        }),
      }),
      fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      }),
      fetch("/api/settings/job-search-cron", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: cron.enabled,
          cronExpression: cron.cronExpression,
          profiles: cron.profiles.map((cronProfile) => ({
            id: cronProfile.id,
            scheduleEnabled: cronProfile.scheduleEnabled,
          })),
        }),
      }),
    ]);
    const body = await response.json();
    const profileBody = await profileResponse.json();
    const cronBody = await cronResponse.json();
    setSaving(false);

    if (!profileResponse.ok || !response.ok || !cronResponse.ok) {
      setError(profileBody.error ?? body.error ?? cronBody.error ?? "Unable to save settings.");
      return;
    }

    setCron((current) => ({
      ...current,
      enabled: cronBody.enabled,
      cronExpression: cronBody.cronExpression,
      profiles: cronBody.profiles,
    }));
    setCronDirty(false);
    setNotice("Settings saved.");
  }

  async function syncGithub() {
    setSyncingGithub(true);
    setNotice("");
    setError("");
    const profileResponse = await fetch("/api/settings/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ githubUrl: profile.githubUrl, linkedinUrl: profile.linkedinUrl }),
    });
    const profileBody = await profileResponse.json();

    if (!profileResponse.ok) {
      setSyncingGithub(false);
      setError(profileBody.error ?? "Unable to save GitHub profile URL.");
      return;
    }

    const response = await fetch("/api/settings/github/sync", { method: "POST" });
    const body = await response.json();
    setSyncingGithub(false);

    if (!response.ok) {
      setError(body.error ?? "Unable to sync GitHub repositories.");
      return;
    }

    setProfile({
      ...profile,
      githubRepositoryCount: body.count,
      latestGithubSync: new Date().toLocaleString(),
    });
    setNotice(body.message);
  }

  async function reviewGithub() {
    setReviewingGithub(true);
    setNotice("");
    setError("");
    const response = await fetch("/api/settings/github/review", { method: "POST" });
    const body = await response.json();
    setReviewingGithub(false);

    if (!response.ok) {
      setError(body.error ?? "Unable to review GitHub portfolio.");
      return;
    }

    setGithubReview(body);
    setNotice("GitHub portfolio review updated.");
  }

  async function sendTest() {
    setTesting(true);
    setNotice("");
    setError("");
    const saveResponse = await fetch("/api/settings/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    });
    const saveBody = await saveResponse.json();

    if (!saveResponse.ok) {
      setTesting(false);
      setError(saveBody.error ?? "Unable to save notification settings.");
      return;
    }

    const response = await fetch("/api/notifications/test", { method: "POST" });
    const body = await response.json();
    setTesting(false);

    if (!response.ok) {
      setError(body.error ?? "Unable to test notifications.");
      return;
    }

    setNotice(body.message);
  }

  async function runScheduledSearchNow() {
    setRunningCron(true);
    setNotice("");
    setError("");

    const response = await fetch(cron.endpoint, { method: "GET" });
    const body = await response.json();
    setRunningCron(false);

    if (!response.ok) {
      setError(body.error ?? "Unable to start the scheduled search.");
      return;
    }

    setNotice(body.skipped ? body.reason : "Scheduled search queued.");
  }

  function toggleCronEnabled(enabled: boolean) {
    setCronDirty(true);
    setCron((current) => ({
      ...current,
      enabled,
      profiles: current.profiles.map((cronProfile) => ({
        ...cronProfile,
        scheduleEnabled: enabled ? cronProfile.enabled : false,
      })),
    }));
  }

  function toggleCronProfile(id: string, scheduleEnabled: boolean) {
    setCronDirty(true);
    setCron((current) => {
      const profiles = current.profiles.map((cronProfile) =>
        cronProfile.id === id ? { ...cronProfile, scheduleEnabled } : cronProfile,
      );
      return {
        ...current,
        enabled: profiles.some((cronProfile) => cronProfile.enabled && cronProfile.scheduleEnabled),
        profiles,
      };
    });
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <AutoAwesomeOutlinedIcon color="primary" />
                <Typography variant="h3">AI provider</Typography>
              </Stack>
              <StatusChip status={aiSettings.configured ? "configured" : "provider_missing"} />
            </Stack>
            <Alert severity={aiSettings.configured ? "success" : "warning"}>
              {aiSettings.configured
                ? `OpenAI is configured. Resume parsing, scoring, tailored resumes, and cover letters use ${aiSettings.model}.`
                : "OpenAI is not configured yet. Add OPENAI_API_KEY to .env, keep OPENAI_MODEL set, then restart the dev server."}
            </Alert>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 2 }}>
              <TextField fullWidth label="Environment variable" value="OPENAI_API_KEY" disabled />
              <TextField fullWidth label="Model" value={aiSettings.model} disabled />
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <SourceOutlinedIcon color="primary" />
                <Typography variant="h3">Company source list</Typography>
              </Stack>
              <StatusChip status={sourceSettings.companySourceEnabled ? "configured" : "provider_missing"} />
            </Stack>
            <Alert severity={sourceSettings.companySourceEnabled ? "success" : "warning"}>
              {sourceSettings.companySourceEnabled
                ? "Company career-page discovery is active. Search runs will probe curated company ATS feeds before scoring roles."
                : "Company career-page discovery is seeded but disabled."}
            </Alert>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(4, 1fr)" }, gap: 2 }}>
              <TextField fullWidth label="Seeded companies" value={sourceSettings.companyCount} disabled />
              <TextField fullWidth label="Priority ceiling" value={sourceSettings.priorityMax} disabled />
              <TextField fullWidth label="Companies per run" value={sourceSettings.maxCompanies} disabled />
              <TextField fullWidth label="Max fetched roles" value={sourceSettings.maxFetch} disabled />
            </Box>
            <Typography variant="body2" color="text.secondary">
              This is a source list, not a claim that every company is currently hiring. The app checks careers/ATS feeds and then scores matching roles against your profiles.
            </Typography>
            <Button component={Link} href="/sources" variant="outlined" sx={{ alignSelf: "flex-start" }}>
              Manage company sources
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <ScheduleOutlinedIcon color="primary" />
                <Typography variant="h3">Scheduled job search</Typography>
              </Stack>
              <StatusChip status={cron.enabled ? "configured" : "provider_missing"} />
            </Stack>
            <Alert severity={cron.enabled ? "success" : "info"}>
              {cron.enabled
                ? `Scheduled search is active. Vercel calls ${cron.endpoint} ${cron.scheduleLabel.toLowerCase()}.`
                : "Scheduled search is paused. The cron endpoint can still be run manually."}
            </Alert>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 2 }}>
              <TextField fullWidth label="Deployment schedule" value={cron.scheduleLabel} disabled />
              <TextField fullWidth label="Cron expression" value={cron.cronExpression} disabled />
            </Box>
            <FormControlLabel
              control={<Switch checked={cron.enabled} onChange={(event) => toggleCronEnabled(event.target.checked)} />}
              label="Run scheduled searches"
            />
            <Stack
              spacing={1}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
                p: 1,
              }}
            >
              {cron.profiles.length ? (
                cron.profiles.map((cronProfile) => (
                  <Stack
                    key={cronProfile.id}
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", px: 1, py: 0.5 }}
                  >
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{cronProfile.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {cronProfile.enabled ? "Enabled search profile" : "Disabled search profile"}
                      </Typography>
                    </Box>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={cronProfile.enabled && cronProfile.scheduleEnabled}
                          disabled={!cron.enabled || !cronProfile.enabled}
                          onChange={(event) => toggleCronProfile(cronProfile.id, event.target.checked)}
                        />
                      }
                      label="Include"
                    />
                  </Stack>
                ))
              ) : (
                <Typography color="text.secondary">Create a search profile before enabling scheduled searches.</Typography>
              )}
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
              <Button
                variant="outlined"
                disabled={saving || runningCron || cron.cronSecretConfigured || !cron.enabled || cronDirty}
                onClick={runScheduledSearchNow}
              >
                {runningCron ? "Starting..." : "Run scheduled search now"}
              </Button>
              <Typography variant="body2" color="text.secondary">
                {cronDirty
                  ? "Save schedule changes before running now."
                  : cron.cronSecretConfigured
                  ? "Manual browser runs are disabled because CRON_SECRET is configured."
                  : cron.enabled
                  ? "Runs now with the same profile selection used by cron."
                  : "Turn on scheduled searches before running this cron path."}
              </Typography>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <LinkOutlinedIcon color="primary" />
                <Typography variant="h3">Repeated application answers</Typography>
              </Stack>
              <StatusChip status={profile.raceAnswer || profile.genderAnswer || profile.veteranStatusAnswer || profile.disabilityAnswer ? "configured" : "provider_missing"} />
            </Stack>
            <Alert severity="info">
              These are optional user-provided answers. The assistant uses them only to match visible application fields and logs what it filled.
            </Alert>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 2 }}>
              <TextField
                fullWidth
                label="Race / ethnicity answer"
                placeholder="Example: Prefer not to answer"
                value={profile.raceAnswer}
                onChange={(event) => setProfile({ ...profile, raceAnswer: event.target.value })}
              />
              <TextField
                fullWidth
                label="Gender answer"
                placeholder="Example: Prefer not to answer"
                value={profile.genderAnswer}
                onChange={(event) => setProfile({ ...profile, genderAnswer: event.target.value })}
              />
              <TextField
                fullWidth
                label="Veteran status answer"
                placeholder="Example: I am not a protected veteran"
                value={profile.veteranStatusAnswer}
                onChange={(event) => setProfile({ ...profile, veteranStatusAnswer: event.target.value })}
              />
              <TextField
                fullWidth
                label="Disability status answer"
                placeholder="Example: No, I do not have a disability"
                value={profile.disabilityAnswer}
                onChange={(event) => setProfile({ ...profile, disabilityAnswer: event.target.value })}
              />
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <LinkOutlinedIcon color="primary" />
                <Typography variant="h3">Application profile links</Typography>
              </Stack>
              <StatusChip status={profile.linkedinUrl ? "configured" : "provider_missing"} />
            </Stack>
            <Typography color="text.secondary">
              These URLs are used by the local application assistant when it fills employer forms.
            </Typography>
            <TextField
              fullWidth
              label="LinkedIn profile URL"
              placeholder="https://www.linkedin.com/in/your-profile"
              value={profile.linkedinUrl}
              onChange={(event) => setProfile({ ...profile, linkedinUrl: event.target.value })}
            />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <GitHubIcon color="primary" />
                <Typography variant="h3">GitHub work context</Typography>
              </Stack>
              <StatusChip status={profile.githubRepositoryCount > 0 ? "configured" : "provider_missing"} />
            </Stack>
            <Typography color="text.secondary">
              Synced repositories become project context for role-specific resumes and cover letters when relevant.
            </Typography>
            <TextField
              fullWidth
              label="GitHub profile URL"
              value={profile.githubUrl}
              onChange={(event) => setProfile({ ...profile, githubUrl: event.target.value })}
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
              <Button variant="outlined" disabled={saving || syncingGithub} onClick={syncGithub}>
                {syncingGithub ? "Syncing..." : "Sync GitHub context"}
              </Button>
              <Button variant="outlined" disabled={saving || reviewingGithub || profile.githubRepositoryCount === 0} onClick={reviewGithub}>
                {reviewingGithub ? "Reviewing..." : "Review portfolio"}
              </Button>
              <Typography variant="body2" color="text.secondary">
                {profile.githubRepositoryCount} repositories synced{profile.latestGithubSync ? ` · latest sync ${profile.latestGithubSync}` : ""}
              </Typography>
            </Stack>
            {githubReview ? (
              <Stack spacing={1.5} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                  <Box>
                    <Typography sx={{ fontWeight: 850 }}>Portfolio readiness</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {githubReview.reviewedRepositoryCount ?? 0} repositories reviewed from synced GitHub metadata.
                    </Typography>
                  </Box>
                  <ScoreChip score={githubReview.overallReadinessScore ?? 0} />
                </Stack>
                {githubReview.warnings?.length ? <Alert severity="warning">{githubReview.warnings.join(" ")}</Alert> : null}
                {githubReview.priorityActions?.length ? (
                  <Stack spacing={0.75}>
                    {githubReview.priorityActions.slice(0, 4).map((action) => (
                      <Typography key={action} variant="body2" color="text.secondary">{action}</Typography>
                    ))}
                  </Stack>
                ) : null}
                {githubReview.repositoryReviews?.length ? (
                  <Stack spacing={1}>
                    {githubReview.repositoryReviews.slice(0, 4).map((review) => (
                      <Box key={review.repositoryId} sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                          <Typography component="a" href={review.url} target="_blank" rel="noreferrer" sx={{ fontWeight: 800, color: "primary.main", textDecoration: "none" }}>
                            {review.name}
                          </Typography>
                          <ScoreChip score={review.readinessScore} />
                        </Stack>
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 0.75 }}>
                          {review.targetTracks.slice(0, 3).map((track) => <Chip key={`${review.repositoryId}-${track}`} size="small" variant="outlined" label={track} />)}
                        </Stack>
                        {review.recommendedEdits[0] ? (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{review.recommendedEdits[0]}</Typography>
                        ) : null}
                      </Box>
                    ))}
                  </Stack>
                ) : null}
              </Stack>
            ) : null}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={3}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <NotificationsActiveOutlinedIcon color="primary" />
              <Typography variant="h3">Notifications</Typography>
            </Stack>
            {notice ? <Alert severity="success">{notice}</Alert> : null}
            {error ? <Alert severity="error">{error}</Alert> : null}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 2 }}>
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.emailEnabled}
                      onChange={(event) => setSettings({ ...settings, emailEnabled: event.target.checked })}
                    />
                  }
                  label="Email digest enabled"
                />
              </Box>
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.pushoverEnabled}
                      onChange={(event) => setSettings({ ...settings, pushoverEnabled: event.target.checked })}
                    />
                  }
                  label="Pushover enabled when configured"
                />
              </Box>
              <TextField
                fullWidth
                label="Email address"
                value={settings.emailAddress}
                onChange={(event) => setSettings({ ...settings, emailAddress: event.target.value })}
              />
              <TextField
                fullWidth
                label="Push score threshold"
                type="number"
                value={settings.minimumScoreForPush}
                onChange={(event) => setSettings({ ...settings, minimumScoreForPush: Number(event.target.value) })}
              />
              <TextField
                fullWidth
                label="Pushover user key"
                type="password"
                value={settings.pushoverUserKey}
                onChange={(event) => setSettings({ ...settings, pushoverUserKey: event.target.value })}
              />
              <TextField
                fullWidth
                label="Pushover app token"
                type="password"
                value={settings.pushoverAppToken}
                onChange={(event) => setSettings({ ...settings, pushoverAppToken: event.target.value })}
              />
              <TextField
                select
                fullWidth
                label="Digest mode"
                value={settings.digestMode}
                onChange={(event) => setSettings({ ...settings, digestMode: event.target.value as SettingsClientProps["initialSettings"]["digestMode"] })}
              >
                <MenuItem value="every_run">Every run</MenuItem>
                <MenuItem value="daily_summary">Daily summary</MenuItem>
                <MenuItem value="strong_matches_only">Strong matches only</MenuItem>
              </TextField>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" disabled={saving || testing} onClick={save}>
                {saving ? "Saving..." : "Save settings"}
              </Button>
              <Button variant="contained" disabled={saving || testing} onClick={sendTest}>
                {testing ? "Testing..." : "Send test notification"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
