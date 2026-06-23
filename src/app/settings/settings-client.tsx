"use client";

import Link from "next/link";
import { ServiceHealthPanel } from "./service-health-panel";
import type { ServiceHealthSettings } from "./service-health-panel";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
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
  group: "system" | "search" | "application" | "admin";
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
    linkedinContentModel: string;
    linkedinDiagramImageModel: string;
  };
  langSmithSettings: {
    configured: boolean;
    tracing: boolean;
    project: string;
    redactionMode: string;
  };
  emailSyncSettings: {
    configured: boolean;
    provider: string;
    mailbox: string;
    limit: number;
    sinceDays: number;
    endpoint: string;
    secretConfigured: boolean;
    gmailConfigured: boolean;
    outlookConfigured: boolean;
    gmailMissing: string[];
    outlookMissing: string[];
    gmailCallbackUrl: string;
    outlookCallbackUrl: string;
    oauthConnections: Array<{
      id: string;
      provider: string;
      emailAddress: string | null;
      status: string;
      lastSyncAt: string | null;
      updatedAt: string;
    }>;
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
    linkedinSubject: string | null;
    linkedinPictureUrl: string | null;
    linkedinLocale: string | null;
    linkedinEmailVerified: boolean | null;
    linkedinConnectedAt: string | null;
    linkedinOidcConfigured: boolean;
    linkedinShareConnected: boolean;
    linkedinShareStatus: string | null;
    linkedinShareLastPublishedAt: string | null;
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
  automationSettings: {
    autoSubmitEnabled: boolean;
    requireApprovedPacket: boolean;
    requireNoOpenUserRequests: boolean;
    requireFreshAssistantRun: boolean;
    maxRunAgeMinutes: number;
    allowDemographicSubmission: boolean;
  };
  companyAutomationPolicies: Array<{
    id: string;
    company: string;
    autoSubmitMode: "INHERIT" | "ALLOW" | "BLOCK";
    notes: string | null;
  }>;
  serviceHealthSettings: ServiceHealthSettings;
};

export function SettingsClient({ group, initialSettings, aiSettings, langSmithSettings, emailSyncSettings, sourceSettings, profileSettings, latestGithubReview, cronSettings, automationSettings, companyAutomationPolicies: initialCompanyAutomationPolicies, serviceHealthSettings }: SettingsClientProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [linkedinContentModelDraft, setLinkedinContentModelDraft] = useState("");
  const [linkedinDiagramImageModelDraft, setLinkedinDiagramImageModelDraft] = useState("");
  const [profile, setProfile] = useState(profileSettings);
  const [cron, setCron] = useState(cronSettings);
  const [automation, setAutomation] = useState(automationSettings);
  const [companyPolicies, setCompanyPolicies] = useState(initialCompanyAutomationPolicies);
  const [companyPolicyDraft, setCompanyPolicyDraft] = useState({
    company: "",
    autoSubmitMode: "BLOCK" as "INHERIT" | "ALLOW" | "BLOCK",
    notes: "",
  });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingProfileLinks, setSavingProfileLinks] = useState(false);
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
    const requests: Array<Promise<Response>> = [];
    if (showApplication) {
      requests.push(
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
      );
    }
    if (showSystem) {
      requests.push(
      fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      }),
      fetch("/api/settings/ai", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ linkedinContentModel: linkedinContentModel, linkedinDiagramImageModel: linkedinDiagramImageModel }),
      }),
      );
    }
    if (showSearch) {
      requests.push(
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
      );
    }
    if (showApplication) {
      requests.push(
      fetch("/api/settings/application-automation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(automation),
      }),
      );
    }
    const responses = await Promise.all(requests);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    setSaving(false);

    const failedIndex = responses.findIndex((response) => !response.ok);
    if (failedIndex >= 0) {
      setError(bodies[failedIndex]?.error ?? "Unable to save settings.");
      return;
    }

    if (showSearch) {
      const cronBody = bodies.find((body) => Array.isArray(body?.profiles));
      if (cronBody) {
        setCron((current) => ({
          ...current,
          enabled: cronBody.enabled,
          cronExpression: cronBody.cronExpression,
          profiles: cronBody.profiles,
        }));
        setCronDirty(false);
      }
    }
    if (showSystem) {
      const aiBody = bodies.find((body) => body?.settings?.linkedinContentModel);
      if (aiBody?.settings?.linkedinContentModel) {
        setLinkedinContentModelDraft(aiBody.settings.linkedinContentModel);
      }
      if (aiBody?.settings?.linkedinDiagramImageModel) {
        setLinkedinDiagramImageModelDraft(aiBody.settings.linkedinDiagramImageModel);
      }
    }
    if (showApplication) {
      const automationBody = bodies.find((body) => body?.settings);
      if (automationBody?.settings) {
        setAutomation({
          autoSubmitEnabled: automationBody.settings.autoSubmitEnabled,
          requireApprovedPacket: automationBody.settings.requireApprovedPacket,
          requireNoOpenUserRequests: automationBody.settings.requireNoOpenUserRequests,
          requireFreshAssistantRun: automationBody.settings.requireFreshAssistantRun,
          maxRunAgeMinutes: automationBody.settings.maxRunAgeMinutes,
          allowDemographicSubmission: automationBody.settings.allowDemographicSubmission,
        });
      }
    }
    setNotice("Settings saved.");
  }

  async function saveProfileLinks() {
    setSavingProfileLinks(true);
    setNotice("");
    setError("");
    const response = await fetch("/api/settings/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        githubUrl: profile.githubUrl,
        linkedinUrl: profile.linkedinUrl,
      }),
    });
    const body = await response.json();
    setSavingProfileLinks(false);

    if (!response.ok) {
      setError(body.error ?? "Unable to save profile links.");
      return;
    }

    if (body.profile) {
      setProfile((previous) => ({
        ...previous,
        githubUrl: body.profile.githubUrl ?? "",
        linkedinUrl: body.profile.linkedinUrl ?? "",
      }));
    }
    setNotice("Application profile links saved.");
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

    setProfile((previous) => ({
      ...previous,
      githubRepositoryCount: body.count,
      latestGithubSync: new Date().toLocaleString(),
    }));
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

  async function saveCompanyPolicy() {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/settings/company-automation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(companyPolicyDraft),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save company policy.");

      setCompanyPolicies((current) => {
        const withoutExisting = current.filter((policy) => policy.id !== body.policy.id);
        return [...withoutExisting, body.policy].sort((left, right) => left.company.localeCompare(right.company));
      });
      setCompanyPolicyDraft({ company: "", autoSubmitMode: "BLOCK", notes: "" });
      setNotice(body.message ?? "Company automation policy saved.");
    } catch (policyError) {
      setError(policyError instanceof Error ? policyError.message : "Unable to save company policy.");
    } finally {
      setSaving(false);
    }
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

  const showSystem = group === "system";
  const showSearch = group === "search";
  const showApplication = group === "application";
  const showAdmin = group === "admin";
  const linkedinContentModel = linkedinContentModelDraft || aiSettings.linkedinContentModel;
  const linkedinDiagramImageModel = linkedinDiagramImageModelDraft || aiSettings.linkedinDiagramImageModel;

  return (
    <Stack spacing={2}>
      {notice ? <Alert severity="success">{notice}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      {showSystem ? (
      <Card id="settings-ai">
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
                ? `OpenAI is configured. General app generation uses ${aiSettings.model}. LinkedIn content drafts use ${linkedinContentModel}. LinkedIn diagram polish uses ${linkedinDiagramImageModel}.`
                : "OpenAI is not configured yet. Add OPENAI_API_KEY to .env, keep OPENAI_MODEL set, then restart the dev server."}
            </Alert>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 2 }}>
              <TextField fullWidth label="Environment variable" value="OPENAI_API_KEY" disabled />
              <TextField fullWidth label="App-wide model" value={aiSettings.model} disabled helperText="Used by general app features that do not have a dedicated model setting." />
              <TextField
                fullWidth
                label="LinkedIn content model"
                value={linkedinContentModel}
                onChange={(event) => setLinkedinContentModelDraft(event.target.value)}
                helperText="Used only for public LinkedIn draft generation, where higher-quality writing is worth the extra cost."
              />
              <TextField
                fullWidth
                label="LinkedIn diagram image model"
                value={linkedinDiagramImageModel}
                onChange={(event) => setLinkedinDiagramImageModelDraft(event.target.value)}
                helperText="Used only for optional non-authoritative visual polish; exact technical diagram text is rendered deterministically."
              />
            </Box>
            <Alert severity={langSmithSettings.configured ? "success" : "info"}>
              {langSmithSettings.configured
                ? `LangSmith tracing is enabled for ${langSmithSettings.project} with ${langSmithSettings.redactionMode} redaction.`
                : "LangSmith tracing is optional. Set LANGSMITH_TRACING=true and LANGSMITH_API_KEY to trace redacted agent metadata."}
            </Alert>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 2 }}>
              <TextField fullWidth label="LangSmith tracing" value={langSmithSettings.tracing ? "enabled" : "disabled"} disabled />
              <TextField fullWidth label="LangSmith project" value={langSmithSettings.project} disabled />
            </Box>
          </Stack>
        </CardContent>
      </Card>
      ) : null}

      {showSystem ? <ServiceHealthPanel serviceHealthSettings={serviceHealthSettings} /> : null}

      {showAdmin ? (
      <Card id="settings-tools">
        <CardContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h3">Admin and supporting tools</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                These pages support the agent workflow but no longer need to be in the primary navigation.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              {[
                { href: "/profiles", label: "Search profiles" },
                { href: "/evidence", label: "Evidence library" },
                { href: "/sources", label: "Company sources" },
                { href: "/agents", label: "Agent board" },
                { href: "/linkedin-content", label: "LinkedIn content" },
                { href: "/resumes", label: "Materials workspace" },
                { href: "/resumes/generated", label: "Generated materials" },
                { href: "/networking", label: "Networking" },
                { href: "/outcomes", label: "Outcome analytics" },
                { href: "/runs", label: "Search runs" },
                { href: "/guide", label: "User guide" },
              ].map((tool) => (
                <Button key={tool.href} component={Link} href={tool.href} variant="outlined" size="small">
                  {tool.label}
                </Button>
              ))}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      ) : null}

      {showSystem ? (
      <Card id="settings-email-sync">
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <MarkEmailReadOutlinedIcon color="primary" />
                <Typography variant="h3">Inbound email sync</Typography>
              </Stack>
              <StatusChip status={emailSyncSettings.configured ? "configured" : "provider_missing"} />
            </Stack>
            <Alert severity={emailSyncSettings.configured ? "success" : "info"}>
              {emailSyncSettings.configured
                ? "IMAP email sync is configured. Synced job responses update outcomes and create Needs Me items when action is required."
                : "IMAP email sync is not configured. Add JOB_EMAIL_IMAP_HOST, JOB_EMAIL_IMAP_USER, and JOB_EMAIL_IMAP_PASSWORD to enable it."}
            </Alert>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(4, 1fr)" }, gap: 2 }}>
              <TextField fullWidth label="Provider" value={emailSyncSettings.provider} disabled />
              <TextField fullWidth label="Mailbox" value={emailSyncSettings.mailbox} disabled />
              <TextField fullWidth label="Limit" value={emailSyncSettings.limit} disabled />
              <TextField fullWidth label="Since days" value={emailSyncSettings.sinceDays} disabled />
            </Box>
            <Typography variant="body2" color="text.secondary">
              Endpoint: {emailSyncSettings.endpoint}. {emailSyncSettings.secretConfigured ? "EMAIL_SYNC_SECRET is required for requests." : "No EMAIL_SYNC_SECRET is configured, so local calls do not require a bearer token."}
            </Typography>
            <Stack spacing={1.5} sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}>
              <Box>
                <Typography sx={{ fontWeight: 850 }}>Gmail / Outlook OAuth</Typography>
                <Typography variant="body2" color="text.secondary">
                  OAuth is approved for this app. These connectors use read-only mailbox access and feed the same email response agent as IMAP.
                </Typography>
              </Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button
                  component={Link}
                  href="/api/email/oauth/gmail/start"
                  variant="outlined"
                  disabled={!emailSyncSettings.gmailConfigured}
                >
                  Connect Gmail
                </Button>
                <Button
                  component={Link}
                  href="/api/email/oauth/outlook/start"
                  variant="outlined"
                  disabled={!emailSyncSettings.outlookConfigured}
                >
                  Connect Outlook
                </Button>
              </Stack>
              {emailSyncSettings.gmailMissing.length || emailSyncSettings.outlookMissing.length ? (
                <Alert severity="info">
                  {emailSyncSettings.gmailMissing.length ? `Gmail needs ${emailSyncSettings.gmailMissing.join(", ")}. ` : "Gmail is ready to connect. "}
                  {emailSyncSettings.outlookMissing.length ? `Outlook needs ${emailSyncSettings.outlookMissing.join(", ")}.` : "Outlook is ready to connect."}
                </Alert>
              ) : null}
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 1 }}>
                <TextField fullWidth label="Gmail callback URL" value={emailSyncSettings.gmailCallbackUrl} disabled />
                <TextField fullWidth label="Outlook callback URL" value={emailSyncSettings.outlookCallbackUrl} disabled />
              </Box>
              {emailSyncSettings.oauthConnections.length ? (
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {emailSyncSettings.oauthConnections.map((connection) => (
                    <Chip
                      key={connection.id}
                      color={connection.status === "CONNECTED" ? "success" : "warning"}
                      variant="outlined"
                      label={`${connection.provider}: ${connection.status.toLowerCase()}`}
                    />
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">No OAuth mailbox is connected yet.</Typography>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      ) : null}

      {showApplication ? (
      <Card id="settings-automation">
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <AutoAwesomeOutlinedIcon color="primary" />
                <Typography variant="h3">Application automation</Typography>
              </Stack>
              <StatusChip status={automation.autoSubmitEnabled ? "configured" : "provider_missing"} />
            </Stack>
            <Alert severity={automation.autoSubmitEnabled ? "warning" : "info"}>
              {automation.autoSubmitEnabled
                ? "Auto-submit is enabled but still gated by packet approval, open questions, fresh assistant state, and page safety checks."
                : "Auto-submit is disabled. The assistant can fill forms and stop for review."}
            </Alert>
            <FormControlLabel
              control={
                <Switch
                  checked={automation.autoSubmitEnabled}
                  onChange={(event) => setAutomation((previous) => ({ ...previous, autoSubmitEnabled: event.target.checked }))}
                />
              }
              label="Allow gated auto-submit"
            />
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={automation.requireApprovedPacket}
                    onChange={(event) => setAutomation((previous) => ({ ...previous, requireApprovedPacket: event.target.checked }))}
                  />
                }
                label="Require approved packet"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={automation.requireNoOpenUserRequests}
                    onChange={(event) => setAutomation((previous) => ({ ...previous, requireNoOpenUserRequests: event.target.checked }))}
                  />
                }
                label="Require no open Needs Me items"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={automation.requireFreshAssistantRun}
                    onChange={(event) => setAutomation((previous) => ({ ...previous, requireFreshAssistantRun: event.target.checked }))}
                  />
                }
                label="Require fresh assistant run"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={automation.allowDemographicSubmission}
                    onChange={(event) => setAutomation((previous) => ({ ...previous, allowDemographicSubmission: event.target.checked }))}
                  />
                }
                label="Allow submit with configured demographic answers"
              />
              <TextField
                fullWidth
                label="Fresh run window"
                type="number"
                value={automation.maxRunAgeMinutes}
                onChange={(event) => setAutomation((previous) => ({ ...previous, maxRunAgeMinutes: Number(event.target.value) }))}
                helperText="Minutes. Used only when fresh assistant run is required."
              />
            </Box>
            <Typography variant="body2" color="text.secondary">
              Even when enabled, the local assistant skips submit if it sees CAPTCHA, unresolved required fields, unknown custom answers, or a blocked automation run.
            </Typography>
            <Stack spacing={1.5} sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}>
              <Box>
                <Typography sx={{ fontWeight: 850 }}>Company auto-submit policies</Typography>
                <Typography variant="body2" color="text.secondary">
                  Application-specific overrides still win. Company policies are for known employers where you always want to allow or block gated auto-submit.
                </Typography>
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.4fr 0.8fr 1.4fr auto" }, gap: 1 }}>
                <TextField
                  fullWidth
                  label="Company"
                  value={companyPolicyDraft.company}
                  onChange={(event) => setCompanyPolicyDraft((previous) => ({ ...previous, company: event.target.value }))}
                />
                <TextField
                  select
                  fullWidth
                  label="Mode"
                  value={companyPolicyDraft.autoSubmitMode}
                  onChange={(event) => setCompanyPolicyDraft((previous) => ({ ...previous, autoSubmitMode: event.target.value as "INHERIT" | "ALLOW" | "BLOCK" }))}
                >
                  <MenuItem value="BLOCK">Block</MenuItem>
                  <MenuItem value="ALLOW">Allow</MenuItem>
                  <MenuItem value="INHERIT">Inherit</MenuItem>
                </TextField>
                <TextField
                  fullWidth
                  label="Notes"
                  value={companyPolicyDraft.notes}
                  onChange={(event) => setCompanyPolicyDraft((previous) => ({ ...previous, notes: event.target.value }))}
                />
                <Button variant="outlined" disabled={saving || !companyPolicyDraft.company.trim()} onClick={saveCompanyPolicy}>
                  Save
                </Button>
              </Box>
              {companyPolicies.length ? (
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {companyPolicies.map((policy) => (
                    <Chip
                      key={policy.id}
                      color={policy.autoSubmitMode === "ALLOW" ? "success" : policy.autoSubmitMode === "BLOCK" ? "error" : "default"}
                      variant="outlined"
                      label={`${policy.company}: ${policy.autoSubmitMode.toLowerCase()}`}
                    />
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">No company policies yet.</Typography>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      ) : null}

      {showSearch ? (
      <Card id="settings-company-sources">
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
      ) : null}

      {showSearch ? (
      <Card id="settings-cron">
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
            <Button variant="outlined" disabled={saving} onClick={save} sx={{ alignSelf: "flex-start" }}>
              {saving ? "Saving..." : "Save schedule"}
            </Button>
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
      ) : null}

      {showApplication ? (
      <Card id="settings-demographics">
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
                onChange={(event) => setProfile((previous) => ({ ...previous, raceAnswer: event.target.value }))}
              />
              <TextField
                fullWidth
                label="Gender answer"
                placeholder="Example: Prefer not to answer"
                value={profile.genderAnswer}
                onChange={(event) => setProfile((previous) => ({ ...previous, genderAnswer: event.target.value }))}
              />
              <TextField
                fullWidth
                label="Veteran status answer"
                placeholder="Example: I am not a protected veteran"
                value={profile.veteranStatusAnswer}
                onChange={(event) => setProfile((previous) => ({ ...previous, veteranStatusAnswer: event.target.value }))}
              />
              <TextField
                fullWidth
                label="Disability status answer"
                placeholder="Example: No, I do not have a disability"
                value={profile.disabilityAnswer}
                onChange={(event) => setProfile((previous) => ({ ...previous, disabilityAnswer: event.target.value }))}
              />
            </Box>
          </Stack>
        </CardContent>
      </Card>
      ) : null}

      {showApplication ? (
      <Card id="settings-profile-links">
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <LinkOutlinedIcon color="primary" />
                <Typography variant="h3">Application profile links</Typography>
              </Stack>
              <StatusChip status={profile.linkedinSubject ? "configured" : profile.linkedinOidcConfigured ? "provider_missing" : "disabled"} />
            </Stack>
            <Typography color="text.secondary">
              These URLs are used by the local application assistant when it fills employer forms. LinkedIn connection imports identity basics only; it does not grant job-search, saved-jobs, or auto-apply access.
            </Typography>
            <TextField
              fullWidth
              label="LinkedIn profile URL"
              placeholder="https://www.linkedin.com/in/your-profile"
              value={profile.linkedinUrl}
              onChange={(event) => setProfile((previous) => ({ ...previous, linkedinUrl: event.target.value }))}
              helperText="Save this URL before reconnecting LinkedIn. Reconnect imports identity basics only."
            />
            <Box>
              <Button variant="contained" disabled={saving || savingProfileLinks} onClick={saveProfileLinks}>
                {savingProfileLinks ? "Saving..." : "Save profile links"}
              </Button>
            </Box>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{ alignItems: { sm: "center" }, border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}
            >
              {profile.linkedinPictureUrl ? (
                <Box
                  component="img"
                  src={profile.linkedinPictureUrl}
                  alt=""
                  sx={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: 1, borderColor: "divider" }}
                />
              ) : null}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 850 }}>
                  {profile.linkedinSubject ? "LinkedIn connected" : "LinkedIn identity connection"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {profile.linkedinSubject
                    ? `Connected${profile.linkedinConnectedAt ? ` ${profile.linkedinConnectedAt}` : ""}${profile.linkedinLocale ? ` · locale ${profile.linkedinLocale}` : ""}${profile.linkedinEmailVerified ? " · email verified" : ""}`
                    : profile.linkedinOidcConfigured
                      ? "Connect to import LinkedIn OIDC name, email, photo, and locale as profile enrichment context."
                      : "Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to enable this connection."}
                </Typography>
              </Box>
              <Button
                component={Link}
                href="/api/auth/linkedin/start"
                variant={profile.linkedinSubject ? "outlined" : "contained"}
                disabled={!profile.linkedinOidcConfigured}
              >
                {profile.linkedinSubject ? "Reconnect LinkedIn" : "Connect LinkedIn"}
              </Button>
            </Stack>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{ alignItems: { sm: "center" }, border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 850 }}>
                  {profile.linkedinShareConnected ? "LinkedIn publishing connected" : "LinkedIn publishing connection"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {profile.linkedinShareConnected
                    ? `Share on LinkedIn is enabled for approved content drafts${profile.linkedinShareLastPublishedAt ? ` · last published ${profile.linkedinShareLastPublishedAt}` : ""}.`
                    : profile.linkedinOidcConfigured
                      ? "Connect publishing to grant w_member_social. Approved LinkedIn content drafts will publish immediately after privacy and provenance gates pass."
                      : "Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to enable Share on LinkedIn publishing."}
                </Typography>
              </Box>
              <StatusChip status={profile.linkedinShareConnected ? "configured" : profile.linkedinOidcConfigured ? "provider_missing" : "disabled"} />
              <Button
                component={Link}
                href="/api/auth/linkedin/share/start"
                variant={profile.linkedinShareConnected ? "outlined" : "contained"}
                disabled={!profile.linkedinOidcConfigured}
              >
                {profile.linkedinShareConnected ? "Reconnect publishing" : "Connect publishing"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      ) : null}

      {showApplication ? (
      <Card id="settings-github">
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
              onChange={(event) => setProfile((previous) => ({ ...previous, githubUrl: event.target.value }))}
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
      ) : null}

      {showSystem ? (
      <Card id="settings-notifications">
        <CardContent>
          <Stack spacing={3}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <NotificationsActiveOutlinedIcon color="primary" />
              <Typography variant="h3">Notifications</Typography>
            </Stack>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 2 }}>
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.emailEnabled}
                      onChange={(event) => setSettings((previous) => ({ ...previous, emailEnabled: event.target.checked }))}
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
                      onChange={(event) => setSettings((previous) => ({ ...previous, pushoverEnabled: event.target.checked }))}
                    />
                  }
                  label="Pushover enabled when configured"
                />
              </Box>
              <TextField
                fullWidth
                label="Email address"
                value={settings.emailAddress}
                onChange={(event) => setSettings((previous) => ({ ...previous, emailAddress: event.target.value }))}
              />
              <TextField
                fullWidth
                label="Push score threshold"
                type="number"
                value={settings.minimumScoreForPush}
                onChange={(event) => setSettings((previous) => ({ ...previous, minimumScoreForPush: Number(event.target.value) }))}
              />
              <TextField
                fullWidth
                label="Pushover user key"
                type="password"
                value={settings.pushoverUserKey}
                onChange={(event) => setSettings((previous) => ({ ...previous, pushoverUserKey: event.target.value }))}
              />
              <TextField
                fullWidth
                label="Pushover app token"
                type="password"
                value={settings.pushoverAppToken}
                onChange={(event) => setSettings((previous) => ({ ...previous, pushoverAppToken: event.target.value }))}
              />
              <TextField
                select
                fullWidth
                label="Digest mode"
                value={settings.digestMode}
                onChange={(event) => setSettings((previous) => ({ ...previous, digestMode: event.target.value as SettingsClientProps["initialSettings"]["digestMode"] }))}
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
      ) : null}
      {showApplication ? (
        <Button variant="outlined" disabled={saving} onClick={save} sx={{ alignSelf: "flex-start" }}>
          {saving ? "Saving..." : "Save application settings"}
        </Button>
      ) : null}
    </Stack>
  );
}
