"use client";

import Link from "next/link";
import PlayCircleOutlineOutlinedIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AgencyRunControl } from "@/components/agency-run-control";
import { RejectionReasonDialog, type RejectionReasonCode } from "@/components/job-reject-button";
import { SearchRunAnalyticsCharts } from "@/components/search-run-analytics-charts";
import { assessApplicationUrlQuality, type ApplicationUrlQuality } from "@/lib/applications/application-url-quality";
import type { AshbyRiskAssessment } from "@/lib/applications/ashby-risk";
import { summarizeApplicationJobDescription } from "@/lib/applications/job-summary";
import { copyTextToClipboard } from "@/lib/browser/clipboard";

type ReadyApplication = {
  id: string;
  jobPostingId: string;
  jobProfileMatchId: string | null;
  company: string;
  title: string;
  description: string | null;
  applicationUrl: string | null;
  atsProvider?: string | null;
  score: number | null;
  resumeId: string | null;
  coverLetterId: string | null;
  automationRun: {
    id: string;
    status: "RUNNING" | "BLOCKED" | "NEEDS_USER" | "READY_TO_SUBMIT" | "SUBMITTED" | "FAILED";
    blockerType: string | null;
    blockerMessage: string | null;
    currentNode: string | null;
    graphThreadId: string | null;
    workflowState: unknown;
    startedAt: string;
    finishedAt: string | null;
  } | null;
  blocker: {
    id: string;
    question: string;
  } | null;
  assistantLaunched: boolean;
  ashbyRisk?: AshbyRiskAssessment | null;
};

type ApplySprintReasonCode =
  | "below_profile_threshold"
  | "existing_match_not_new"
  | "profile_max_results_cap"
  | "no_application_url"
  | "unsupported_application_url"
  | "duplicate_or_suppressed"
  | "already_has_application"
  | "agency_already_running"
  | "packet_generation_failed"
  | "missing_resume_or_cover_letter"
  | "material_quality_needs_review"
  | "hidden_by_canonical_duplicate_reconciliation"
  | "review_only_broad_discovery";

type ApplySprintTrustFunnel = {
  latestSearchRun: {
    id: string;
    status: string;
    triggeredBy: string;
    startedAt: string;
    finishedAt: string | null;
    jobsFetched: number;
    jobsAfterDedupe: number;
    jobsAfterFilters: number;
    jobsSaved: number;
    progress: unknown;
  } | null;
  latestAgencyRun: {
    id: string;
    status: string;
    updatedAt: string;
  } | null;
  summary: {
    fetched: number;
    newAfterDedupe: number;
    matched: number;
    saved: number;
    eligibleForAgency: number;
    agencyPrepared: number;
    agencyFailedSkipped: number;
    visibleReady: number;
    belowProfileThreshold: number;
    suppressed: number;
    listingPagesSuppressed: number;
    agencyAlreadyRunning: boolean;
  };
  candidates: Array<{
    matchId: string;
    jobId: string;
    company: string;
    title: string;
    location: string | null;
    applicationUrl: string | null;
    profileName: string;
    score: number;
    updatedAt: string;
  reasons: ApplySprintReasonCode[];
  canPrepare: boolean;
  applicationUrlQuality?: ApplicationUrlQuality;
  }>;
  agencyResults: Array<{
    matchId?: string | null;
    jobId?: string | null;
    applicationId?: string | null;
    company: string;
    title: string;
    score?: number | null;
    status: "ready_to_apply" | "approved" | "skipped" | "failed";
    error?: string | null;
    reason?: string | null;
  }>;
  hidden: Array<{
    id: string;
    kind: "match" | "application" | "summary";
    company: string;
    title: string;
    location: string | null;
    applicationUrl: string | null;
    profileName?: string | null;
    score?: number | null;
    status?: string | null;
    reasons: ApplySprintReasonCode[];
    detail: string;
    applicationUrlQuality?: ApplicationUrlQuality;
  }>;
};

type LaunchResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  logPath?: string;
  automationRunId?: string;
  workflow?: WorkflowStatus | null;
  application?: {
    id: string;
    company: string;
    title: string;
    applicationUrl: string | null;
  };
};

type AssistantRunDiagnostics = {
  phase: string;
  severity: "info" | "success" | "warning" | "error";
  status: string;
  statusLabel: string;
  summary: string;
  reason: string | null;
  nextAction: string;
  currentAction: string;
  blockerType: string | null;
  lastEventType: string | null;
  lastEventMessage: string | null;
  counts: {
    detected: number | null;
    filled: number | null;
    learned: number | null;
    ignored: number | null;
    activeForAutofill: number | null;
    needsReview: number | null;
    uploaded: number | null;
    skipped: number | null;
    observed: number | null;
  };
  pid?: number | null;
  logPath?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationSeconds?: number | null;
};

type AssistantRunTimelineItem = {
  type: string;
  message: string;
  severity: "info" | "success" | "warning" | "error";
  at?: string | null;
  detail?: string | null;
};

type AssistantLogResponse = {
  log?: string;
  logPath?: string;
  pid?: number;
  automationRun?: ReadyApplication["automationRun"] & { workflowStateJson?: unknown };
  diagnostics?: AssistantRunDiagnostics;
  timeline?: AssistantRunTimelineItem[];
  message?: string;
  error?: string;
};

type RunFeedbackState = {
  applicationId: string;
  log: string;
  diagnostics: AssistantRunDiagnostics | null;
  timeline: AssistantRunTimelineItem[];
};

type WorkflowStatus = {
  graphThreadId: string | null;
  currentNode: string | null;
  status: string | null;
  automationRunId: string | null;
  pendingCommand: {
    type: string;
    reason: string;
    fieldId?: string | null;
  } | null;
  counts?: {
    detected: number;
    filled: number;
    skipped: number;
    blocked: number;
    observed: number;
  };
  fields?: Array<{
    fieldId: string;
    label: string;
    decision?: string | null;
    result?: string | null;
  }>;
  latestEvent: {
    type: string;
    message: string;
    at: string;
  } | null;
  events: Array<{
    type: string;
    message: string;
    at: string;
  }>;
};

type QuestionHelperResponse = {
  error?: string;
  generatedBy?: string;
  savedToPacket?: boolean;
  packetAnswerCount?: number | null;
  context?: {
    bulletsConsidered: number;
    projectsConsidered: number;
    githubRepositoriesConsidered: number;
  };
  options?: Array<{
    title: string;
    answer: string;
    evidence: string[];
    tone: string;
    cautions: string[];
  }>;
  answerMemory?: Array<{
    id: string;
    questionText: string;
    answer: string;
    sensitivity: string;
    reusePolicy: string;
    matchScore: number;
    autoUsable: boolean;
  }>;
};

type AtsBlockerSummary = {
  provider: string;
  totalRuns: number;
  blockedRuns: number;
  failedRuns: number;
  readyRuns: number;
  submittedRuns: number;
  blockerTypes: Array<{ type: string; count: number }>;
  examples: Array<{
    applicationId: string;
    company: string;
    title: string;
    blockerType: string | null;
    blockerMessage: string | null;
  }>;
};

export function AssistantWorkbench({
  applications,
  atsBlockers,
  trustFunnel,
  initialApplicationId,
}: {
  applications: ReadyApplication[];
  atsBlockers: AtsBlockerSummary[];
  trustFunnel: ApplySprintTrustFunnel;
  initialApplicationId?: string;
}) {
  const { refresh } = useRouter();
  const initialSelectedId = applications.some((application) => application.id === initialApplicationId)
    ? initialApplicationId!
    : applications[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [launch, setLaunch] = useState<LaunchResponse | null>(null);
  const [runFeedback, setRunFeedback] = useState<RunFeedbackState | null>(null);
  const [loading, setLoading] = useState(false);
  const [markingApplied, setMarkingApplied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [appliedIds, setAppliedIds] = useState<string[]>([]);
  const [queueProgressSearchId, setQueueProgressSearchId] = useState<string | null>(null);
  const [copyingCoverLetterId, setCopyingCoverLetterId] = useState<string | null>(null);
  const [pendingRejectionFeedback, setPendingRejectionFeedback] = useState<Pick<ReadyApplication, "id" | "company" | "title"> | null>(null);
  const [notice, setNotice] = useState("");
  const [funnelUi, setFunnelUi] = useState<{
    queueTab: "ready" | "candidates" | "agency" | "hidden";
    selectedCandidateIds: string[];
    preparingCandidates: boolean;
  }>({ queueTab: "ready", selectedCandidateIds: [], preparingCandidates: false });
  const visibleApplications = useMemo(
    () => applications.filter((application) => !deletedIds.includes(application.id) && !appliedIds.includes(application.id)),
    [applications, appliedIds, deletedIds],
  );
  const activeSelectedId = visibleApplications.some((application) => application.id === selectedId) ? selectedId : visibleApplications[0]?.id ?? "";
  const selected = useMemo(() => visibleApplications.find((application) => application.id === activeSelectedId), [activeSelectedId, visibleApplications]);
  const selectedBlocker = selected?.blocker ?? null;
  const selectedRunState = selected?.automationRun ? automationRunState(selected.automationRun) : null;
  const selectedWorkflow = workflowStatusForApplication(selected, launch);
  const selectedPrimaryAction = selected ? primarySprintAction(selected, Boolean(launch?.application?.id ?? activeSelectedId)) : null;
  const selectedFeedback = runFeedback?.applicationId === activeSelectedId ? runFeedback : null;
  const queueProgress = useMemo(() => visibleApplications.map((application) => ({
    ...application,
    progress: sprintProgressForApplication(application),
  })), [visibleApplications]);
  const queueProgressSearchSelection = useMemo(
    () => queueProgress.find((application) => application.id === queueProgressSearchId) ?? null,
    [queueProgress, queueProgressSearchId],
  );
  const visibleQueueProgress = queueProgressSearchSelection ? [queueProgressSearchSelection] : queueProgress;
  const selectedRunActive = selected?.automationRun?.status === "RUNNING" || isLearningWorkflow(selectedWorkflow);
  const visibleCandidateIds = useMemo(() => trustFunnel.candidates.reduce<string[]>((ids, candidate) => {
    if (candidate.canPrepare) ids.push(candidate.matchId);
    return ids;
  }, []), [trustFunnel.candidates]);

  async function launchSelected(next = false) {
    const endpoint = next ? "/api/applications/next-ready/launch-assistant" : `/api/applications/${activeSelectedId}/launch-assistant`;
    setLoading(true);
    setRunFeedback(null);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const payload = (await response.json()) as LaunchResponse;
      if (!response.ok) throw new Error(payload.error ?? "Assistant launch failed.");
      setLaunch(payload);
      setNotice(payload.message ?? "Assistant launched.");
      const appId = payload.application?.id ?? activeSelectedId;
      window.setTimeout(() => void refreshLog(appId), 1200);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Assistant launch failed.");
    } finally {
      setLoading(false);
    }
  }

  const refreshLog = useCallback(async (applicationId = activeSelectedId) => {
    if (!applicationId) return;
    const response = await fetch(`/api/applications/${applicationId}/assistant-log`);
    const payload = await response.json().catch(() => ({})) as AssistantLogResponse;
    if (response.ok) {
      setRunFeedback({
        applicationId,
        log: payload.log ?? "",
        diagnostics: payload.diagnostics ?? null,
        timeline: payload.timeline ?? [],
      });
    }
    if (response.ok && payload.automationRun?.workflowStateJson) refresh();
  }, [activeSelectedId, refresh]);

  useEffect(() => {
    if (!activeSelectedId || !selectedRunActive) return;
    void refreshLog(activeSelectedId);
    const timer = window.setInterval(() => void refreshLog(activeSelectedId), 5000);
    return () => window.clearInterval(timer);
  }, [activeSelectedId, refreshLog, selectedRunActive]);

  async function markApplied(applicationId = launch?.application?.id ?? activeSelectedId) {
    if (!applicationId) return;
    setMarkingApplied(true);
    try {
      const response = await fetch(`/api/applications/${applicationId}/mark-applied`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to mark application applied.");
      const currentIndex = visibleApplications.findIndex((application) => application.id === applicationId);
      const nextApplication = visibleApplications[currentIndex + 1] ?? visibleApplications.find((application) => application.id !== applicationId);
      setAppliedIds((current) => current.includes(applicationId) ? current : [...current, applicationId]);
      setSelectedId(nextApplication?.id ?? "");
      setLaunch(null);
      setRunFeedback(null);
      setNotice(payload.message ?? "Application marked applied.");
      refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to mark application applied.");
    } finally {
      setMarkingApplied(false);
    }
  }

  async function resetSelectedAssistant() {
    if (!selected) return;
    if (!window.confirm(`Reset assistant test state for ${selected.company} - ${selected.title}? This stops any tracked local assistant run and clears open assistant blockers for this application. It will not reject the job or delete learned memories.`)) return;

    setResetting(true);
    try {
      const response = await fetch(`/api/applications/${selected.id}/assistant-workflow/reset`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to reset assistant state.");
      setLaunch(null);
      setRunFeedback(null);
      setNotice(payload.message ?? "Assistant test state reset.");
      refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to reset assistant state.");
    } finally {
      setResetting(false);
    }
  }

  function openRejectDialog() {
    if (!selected) return;
    setPendingRejectionFeedback({
      id: selected.id,
      company: selected.company,
      title: selected.title,
    });
  }

  async function deleteApplication(application: Pick<ReadyApplication, "id" | "company" | "title">, reasons: RejectionReasonCode[] = [], note = "") {
    setDeleting(true);
    try {
      const response = await fetch(`/api/applications/${application.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reasons,
          note,
          source: "apply_sprint_rejection_reason_prompt",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to delete application.");
      const remaining = visibleApplications.filter((item) => item.id !== application.id);
      setDeletedIds((current) => [...current, application.id]);
      setPendingRejectionFeedback(null);
      setSelectedId(remaining[0]?.id ?? "");
      setLaunch(null);
      setRunFeedback(null);
      setNotice(
        reasons.length || note.trim()
          ? "Application removed, job rejected, and feedback saved for agent learning."
          : payload.message ?? "Application removed and job marked rejected.",
      );
      refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to delete application.");
    } finally {
      setDeleting(false);
    }
  }

  async function submitRejectionFeedback(reasons: RejectionReasonCode[], note: string) {
    if (!pendingRejectionFeedback) return;
    await deleteApplication(pendingRejectionFeedback, reasons, note);
  }

  async function copyCoverLetter(coverLetterId: string) {
    setCopyingCoverLetterId(coverLetterId);
    try {
      const response = await fetch(`/api/cover-letters/${coverLetterId}/plain-text`);
      const text = await response.text();
      if (!response.ok) throw new Error(text || "Unable to load cover letter.");
      await copyTextToClipboard(text);
      setNotice("Cover letter copied to clipboard.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to copy cover letter.");
    } finally {
      setCopyingCoverLetterId(null);
    }
  }

  async function prepareSelectedCandidates() {
    const matchIds = funnelUi.selectedCandidateIds.filter((id) => visibleCandidateIds.includes(id));
    if (!matchIds.length) {
      setNotice("Select at least one eligible candidate to prepare.");
      return;
    }
    setFunnelUi((current) => ({ ...current, preparingCandidates: true }));
    try {
      const response = await fetch("/api/applications/assistant/prepare-candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchIds }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to prepare selected candidates.");
      setFunnelUi((current) => ({ ...current, selectedCandidateIds: [] }));
      setNotice(`Prepared ${payload.prepared ?? 0} selected candidate${payload.prepared === 1 ? "" : "s"}${payload.failed ? `; ${payload.failed} failed` : ""}.`);
      refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to prepare selected candidates.");
    } finally {
      setFunnelUi((current) => ({ ...current, preparingCandidates: false }));
    }
  }

  async function copyRawLog() {
    try {
      await copyTextToClipboard(selectedFeedback?.log || "");
      setNotice("Assistant log copied.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to copy assistant log.");
    }
  }

  return (
    <>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 2 }}>
      <Card>
        <CardContent>
          <Stack spacing={2}>
              <Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  <Chip size="small" color="success" label={`Ready ${visibleApplications.length}`} />
                  {selected?.score ? <Chip size="small" variant="outlined" label={`${selected.score} score`} /> : null}
                </Stack>
                <Typography variant="h3">Next application</Typography>
                <Typography variant="body2" color="text.secondary">
                  Complete the selected application, submit it yourself, then mark it applied before moving to the next one.
                </Typography>
              </Box>
              <TextField
                select
                label="Ready application"
                value={activeSelectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                disabled={visibleApplications.length === 0}
              >
                {visibleApplications.map((application) => (
                  <MenuItem key={application.id} value={application.id}>
                    {application.score ?? "--"} · {application.company} · {application.title}
                    {application.assistantLaunched ? " · launched" : ""}
                  </MenuItem>
                ))}
              </TextField>
              {selected ? (
                <Stack spacing={1}>
                  <Typography sx={{ fontWeight: 850 }}>{selected.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{selected.company}</Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                    <Chip size="small" color="success" variant="outlined" label="Resume ready" />
                    <Chip size="small" color="secondary" variant="outlined" label="Cover letter ready" />
                    {selectedRunState ? <Chip size="small" color={selectedRunState.color} variant={selectedRunState.variant} label={selectedRunState.label} /> : null}
                    {isLearningWorkflow(selectedWorkflow) ? <Chip size="small" color="info" variant="filled" label="Learning mode" /> : null}
                    {selectedWorkflow?.currentNode ? <Chip size="small" color="info" variant="outlined" label={`Workflow: ${workflowNodeLabel(selectedWorkflow.currentNode)}`} /> : null}
                    {selectedWorkflow?.counts?.detected ? <Chip size="small" color="info" variant="outlined" label={`${selectedWorkflow.counts.filled}/${selectedWorkflow.counts.detected} fields`} /> : null}
                    {selectedWorkflow?.counts?.observed ? <Chip size="small" color="success" variant="outlined" label={`${selectedWorkflow.counts.observed} learned`} /> : null}
                    {selected.assistantLaunched ? <Chip size="small" color="warning" variant="outlined" label="Assistant launched" /> : null}
                    {selected.blocker ? <Chip size="small" color="warning" label="Blocked" /> : null}
                    {selected.score ? <Chip size="small" label={`${selected.score} score`} /> : null}
                    {selected.ashbyRisk?.enabled ? (
                      <Chip
                        size="small"
                        color={selected.ashbyRisk.riskLevel === "ready" ? "success" : selected.ashbyRisk.riskLevel === "high_risk" ? "error" : "warning"}
                        variant="outlined"
                        label={`Ashby: ${selected.ashbyRisk.riskLevel.replace(/_/g, " ")}`}
                      />
                    ) : null}
                  </Stack>
                  {selected.ashbyRisk?.enabled ? <AshbyRiskPanel assessment={selected.ashbyRisk} /> : null}
                  {selected.coverLetterId ? (
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ContentCopyOutlinedIcon />}
                        disabled={copyingCoverLetterId === selected.coverLetterId}
                        onClick={() => void copyCoverLetter(selected.coverLetterId!)}
                      >
                        {copyingCoverLetterId === selected.coverLetterId ? "Copying..." : "Copy cover letter"}
                      </Button>
                    </Stack>
                  ) : null}
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                    <Button
                      component={Link}
                      href={`/applications/${selected.id}`}
                      size="small"
                      variant="outlined"
                    >
                      Application profile
                    </Button>
                    <Button
                      component="a"
                      href={selected.applicationUrl ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      size="small"
                      variant="outlined"
                      startIcon={<OpenInNewOutlinedIcon />}
                      disabled={!selected.applicationUrl}
                    >
                      Actual application
                    </Button>
                  </Stack>
                </Stack>
              ) : (
                <Alert severity="info">No ready applications. Run search so eligible saved matches can be prepared for Apply Sprint automatically.</Alert>
              )}
              <Divider />
              {selectedBlocker ? (
                <Alert
                  severity="warning"
                  action={
                    <Button component={Link} href="/needs-me" color="inherit" size="small">
                      Open blocker
                    </Button>
                  }
                >
                  {selectedBlocker.question}
                </Alert>
              ) : null}
              {isLearningWorkflow(selectedWorkflow) ? (
                <Alert severity="info">
                  Learning mode is active. Complete the unknown field in the browser once; the assistant will save the answer, continue where safe, and reuse repeated low/medium-risk answers next time.
                </Alert>
              ) : null}
              {selectedRunState?.running ? (
                <Alert severity="info">
                  Assistant is running in the background. You can leave this page and return here to refresh the log.
                </Alert>
              ) : null}
              {selectedWorkflow?.pendingCommand ? (
                <Alert severity={selectedWorkflow.pendingCommand.type === "ask_user" ? "warning" : "info"}>
                  {selectedWorkflow.pendingCommand.type === "ask_user"
                    ? "Assistant is paused for a sensitive approval."
                    : selectedWorkflow.pendingCommand.type === "observe"
                      ? "Assistant is watching how you complete this field."
                    : `Next field action: ${workflowNodeLabel(selectedWorkflow.pendingCommand.type)}.`} {selectedWorkflow.pendingCommand.reason}
                </Alert>
              ) : null}
              {selectedPrimaryAction ? (
                <Stack spacing={1}>
                  {selectedPrimaryAction.kind !== "mark_applied" ? (
                    <Button
                      component={selectedPrimaryAction.href ? Link : "button"}
                      href={selectedPrimaryAction.href}
                      variant="contained"
                      color={selectedPrimaryAction.color}
                      startIcon={selectedPrimaryAction.kind === "launch" ? <PlayCircleOutlineOutlinedIcon /> : undefined}
                      disabled={selectedPrimaryAction.disabled || loading}
                      onClick={selectedPrimaryAction.kind === "launch" ? () => void launchSelected(false) : undefined}
                    >
                      {selectedPrimaryAction.loadingLabel && loading ? selectedPrimaryAction.loadingLabel : selectedPrimaryAction.label}
                    </Button>
                  ) : null}
                  <Button
                    variant={selectedPrimaryAction.kind === "mark_applied" ? "contained" : "outlined"}
                    color="primary"
                    startIcon={<CheckCircleOutlineOutlinedIcon />}
                    disabled={!selected || loading || markingApplied}
                    onClick={() => {
                      if (selected) void markApplied(selected.id);
                    }}
                  >
                    {markingApplied ? "Updating..." : "I applied"}
                  </Button>
                  <Typography variant="body2" color="text.secondary">{selectedPrimaryAction.detail}</Typography>
                </Stack>
              ) : null}
              <Accordion disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box>
                    <Typography sx={{ fontWeight: 850 }}>Details and recovery</Typography>
                    <Typography variant="caption" color="text.secondary">Queue progress, reset controls, and rejection feedback.</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, textTransform: "uppercase" }}>Secondary actions</Typography>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
                        <Button
                          variant="outlined"
                          startIcon={<PlayCircleOutlineOutlinedIcon />}
                          disabled={loading || resetting}
                          onClick={() => void launchSelected(true)}
                        >
                          Launch next unlaunched
                        </Button>
                        <Button
                          variant="outlined"
                          color="warning"
                          startIcon={<RefreshOutlinedIcon />}
                          disabled={!selected || loading || resetting}
                          onClick={() => void resetSelectedAssistant()}
                        >
                          {resetting ? "Resetting..." : "Reset assistant test state"}
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          startIcon={<DeleteOutlineOutlinedIcon />}
                          disabled={!selected || deleting || loading || resetting}
                          onClick={openRejectDialog}
                        >
                          {deleting ? "Rejecting..." : "Reject from queue"}
                        </Button>
                      </Stack>
                    </Box>
                    {queueProgress.length ? (
                      <QueueProgressTable
                        activeSelectedId={activeSelectedId}
                        applications={visibleQueueProgress}
                        searchOptions={queueProgress}
                        searchSelection={queueProgressSearchSelection}
                        onSearchChange={(application) => setQueueProgressSearchId(application?.id ?? null)}
                        onSelect={setSelectedId}
                      />
                    ) : null}
                  </Stack>
                </AccordionDetails>
              </Accordion>
              {selectedBlocker ? (
                <Alert severity="warning">Resolve the open blocker before launching this application again.</Alert>
              ) : null}
            </Stack>
          </CardContent>
        </Card>

      </Box>

      <Accordion disableGutters sx={{ mt: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box>
            <Typography sx={{ fontWeight: 850 }}>Assistant run details</Typography>
            <Typography variant="caption" color="text.secondary">Fill results, learning timeline, and raw log.</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
              <Box>
                <Typography variant="h3">Assistant run</Typography>
                <Typography variant="body2" color="text.secondary">
                  Live result from the local browser filler and learning session.
                </Typography>
              </Box>
              <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} onClick={() => void refreshLog()}>
                Refresh log
              </Button>
            </Stack>
            {loading || selectedRunActive ? <LinearProgress /> : null}
            {launch ? (
              <Alert severity="success">
                {launch.message}
                {launch.automationRunId ? <Box component="span" sx={{ display: "block", mt: 0.5 }}>Run: {launch.automationRunId}</Box> : null}
                {launch.logPath ? <Box component="span" sx={{ display: "block", mt: 0.5 }}>Log: {launch.logPath}</Box> : null}
              </Alert>
            ) : (
              <Alert severity="info">Launch an application to see fill, upload, learning, and blocker results here.</Alert>
            )}
            <AssistantRunPanel
              diagnostics={selectedFeedback?.diagnostics ?? null}
              timeline={selectedFeedback?.timeline ?? []}
              log={selectedFeedback?.log ?? ""}
              fieldLearningHref={selected ? fieldLearningHref(selected) : "/settings/learning#settings-field-learning"}
              onCopyLog={copyRawLog}
            />
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Accordion disableGutters sx={{ mt: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box>
            <Typography sx={{ fontWeight: 850 }}>Search-to-Apply visibility</Typography>
            <Typography variant="caption" color="text.secondary">Candidates, agency results, and hidden or suppressed rows.</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <ApplySprintFunnelPanel trustFunnel={trustFunnel} readyCount={visibleApplications.length} />
            <Card sx={{ mb: 2 }}>
              <CardContent sx={{ pb: "16px !important" }}>
                <Tabs
                  value={funnelUi.queueTab}
                  onChange={(_, value) => setFunnelUi((current) => ({ ...current, queueTab: value }))}
                  variant="scrollable"
                  scrollButtons="auto"
                  aria-label="Apply Sprint visibility tabs"
                >
                  <Tab value="ready" label={`Ready (${visibleApplications.length})`} />
                  <Tab value="candidates" label={`Candidates (${trustFunnel.candidates.length})`} />
                  <Tab value="agency" label={`Agency Results (${trustFunnel.agencyResults.length})`} />
                  <Tab value="hidden" label={`Hidden / Suppressed (${trustFunnel.hidden.length})`} />
                </Tabs>
              </CardContent>
            </Card>

      {funnelUi.queueTab === "candidates" ? (
        <CandidatesPanel
          candidates={trustFunnel.candidates}
          selectedCandidateIds={funnelUi.selectedCandidateIds}
          visibleCandidateIds={visibleCandidateIds}
          preparing={funnelUi.preparingCandidates}
          onToggle={(matchId) => setFunnelUi((current) => ({
            ...current,
            selectedCandidateIds: current.selectedCandidateIds.includes(matchId)
              ? current.selectedCandidateIds.filter((id) => id !== matchId)
              : [...current.selectedCandidateIds, matchId],
          }))}
          onToggleAll={() => setFunnelUi((current) => ({
            ...current,
            selectedCandidateIds: current.selectedCandidateIds.length === visibleCandidateIds.length ? [] : visibleCandidateIds,
          }))}
          onPrepareSelected={() => void prepareSelectedCandidates()}
        />
      ) : null}

      {funnelUi.queueTab === "agency" ? <AgencyResultsPanel results={trustFunnel.agencyResults} latestAgencyRun={trustFunnel.latestAgencyRun} /> : null}

      {funnelUi.queueTab === "hidden" ? <HiddenSuppressedPanel items={trustFunnel.hidden} /> : null}
          </Stack>
        </AccordionDetails>
      </Accordion>

      <ApplicationQuestionHelper applicationId={activeSelectedId || undefined} onNotice={setNotice} />
      {atsBlockers.length ? (
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="h3">ATS blocker signals</Typography>
                <Typography variant="body2" color="text.secondary">
                  Recent assistant runs grouped by ATS provider.
                </Typography>
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.5 }}>
                {atsBlockers.slice(0, 6).map((provider) => (
                  <Box key={provider.provider} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                        <Typography sx={{ fontWeight: 850 }}>{provider.provider}</Typography>
                        <Chip size="small" color={provider.blockedRuns || provider.failedRuns ? "warning" : "success"} label={`${provider.totalRuns} runs`} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {provider.blockedRuns} blocked · {provider.failedRuns} failed · {provider.readyRuns} ready · {provider.submittedRuns} submitted
                      </Typography>
                      {provider.blockerTypes.length ? (
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                          {provider.blockerTypes.slice(0, 3).map((item) => (
                            <Chip key={`${provider.provider}-${item.type}`} size="small" variant="outlined" label={`${item.type}: ${item.count}`} />
                          ))}
                        </Stack>
                      ) : null}
                      {provider.examples[0] ? (
                        <Typography variant="body2" color="text.secondary">
                          Latest: {provider.examples[0].company} · {provider.examples[0].blockerMessage ?? provider.examples[0].blockerType}
                        </Typography>
                      ) : null}
                    </Stack>
                  </Box>
                ))}
              </Box>
            </Stack>
          </CardContent>
        </Card>
      ) : null}
      <Snackbar open={Boolean(notice)} autoHideDuration={6000} onClose={() => setNotice("")}>
        <Alert severity={launch?.ok ? "success" : "info"} variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
      <RejectionReasonDialog
        open={Boolean(pendingRejectionFeedback)}
        title={pendingRejectionFeedback ? `Why reject ${pendingRejectionFeedback.company} - ${pendingRejectionFeedback.title}?` : "Why reject this job?"}
        onClose={() => setPendingRejectionFeedback(null)}
        onSkip={() => pendingRejectionFeedback ? deleteApplication(pendingRejectionFeedback, [], "") : undefined}
        onSubmit={submitRejectionFeedback}
        submitLabel="Reject application"
      />
    </>
  );
}

function QueueProgressTable({
  activeSelectedId,
  applications,
  searchOptions,
  searchSelection,
  onSearchChange,
  onSelect,
}: {
  activeSelectedId: string;
  applications: Array<ReadyApplication & { progress: ReturnType<typeof sprintProgressForApplication> }>;
  searchOptions: Array<ReadyApplication & { progress: ReturnType<typeof sprintProgressForApplication> }>;
  searchSelection: (ReadyApplication & { progress: ReturnType<typeof sprintProgressForApplication> }) | null;
  onSearchChange: (application: (ReadyApplication & { progress: ReturnType<typeof sprintProgressForApplication> }) | null) => void;
  onSelect: (applicationId: string) => void;
}) {
  return (
    <Box>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { md: "flex-end" }, mb: 1.5 }}>
        <Box>
          <Typography variant="h3">Queue progress</Typography>
          <Typography variant="body2" color="text.secondary">
            Search the queue and scan each application&apos;s next workflow state.
          </Typography>
        </Box>
        <Autocomplete
          size="small"
          options={searchOptions}
          value={searchSelection}
          onChange={(_, value) => onSearchChange(value)}
          getOptionLabel={(application) => `${application.company} - ${application.title}`}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          sx={{ width: { xs: "100%", md: 360 } }}
          renderInput={(params) => <TextField {...params} label="Search queue" placeholder="Company or role" />}
        />
      </Stack>
      <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 1, maxHeight: 360 }}>
        <Table size="small" stickyHeader aria-label="Queue progress table">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 132 }}>Status</TableCell>
              <TableCell>Company</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Next step</TableCell>
              <TableCell align="right" sx={{ width: 104 }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {applications.map((application) => {
              const selected = application.id === activeSelectedId;
              return (
                <TableRow key={application.id} selected={selected} hover>
                  <TableCell>
                    <Stack spacing={0.75}>
                      <Chip size="small" color={application.progress.color} label={application.progress.label} sx={{ alignSelf: "flex-start" }} />
                      <LinearProgress
                        variant="determinate"
                        value={application.progress.value}
                        color={application.progress.color}
                        sx={{ height: 5, borderRadius: 1, width: 96 }}
                      />
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 850, maxWidth: 180, overflowWrap: "anywhere" }}>{application.company}</TableCell>
                  <TableCell sx={{ maxWidth: 280, overflowWrap: "anywhere" }}>{application.title}</TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{application.progress.detail}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" variant={selected ? "contained" : "outlined"} onClick={() => onSelect(application.id)}>
                      Select
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {searchSelection ? (
        <Button size="small" variant="text" sx={{ mt: 1 }} onClick={() => onSearchChange(null)}>
          Show full queue
        </Button>
      ) : null}
    </Box>
  );
}

function ApplySprintFunnelPanel({ trustFunnel, readyCount }: { trustFunnel: ApplySprintTrustFunnel; readyCount: number }) {
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Typography variant="h3">Search-to-Apply Sprint funnel</Typography>
              <Typography variant="body2" color="text.secondary">
                Latest search and agency decisions, including candidates that are not yet ready.
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
              {trustFunnel.latestSearchRun ? (
                <Chip size="small" variant="outlined" label={`Search ${trustFunnel.latestSearchRun.status}`} />
              ) : null}
              {trustFunnel.latestAgencyRun ? (
                <Chip
                  size="small"
                  color={trustFunnel.summary.agencyAlreadyRunning ? "warning" : "default"}
                  variant="outlined"
                  label={`Agency ${trustFunnel.latestAgencyRun.status.toLowerCase()}`}
                />
              ) : null}
            </Stack>
          </Stack>

          <SearchRunAnalyticsCharts run={trustFunnel.latestSearchRun} compact />

          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Chip size="small" label={`Agency eligible: ${trustFunnel.summary.eligibleForAgency}`} />
            <Chip size="small" label={`Prepared: ${trustFunnel.summary.agencyPrepared}`} />
            <Chip size="small" label={`Failed/skipped: ${trustFunnel.summary.agencyFailedSkipped}`} />
            <Chip size="small" color="success" label={`Ready: ${readyCount}`} />
          </Stack>

          {(trustFunnel.summary.belowProfileThreshold || trustFunnel.summary.suppressed || trustFunnel.summary.listingPagesSuppressed) ? (
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
              {trustFunnel.summary.belowProfileThreshold ? <Chip size="small" variant="outlined" label={`${trustFunnel.summary.belowProfileThreshold} below threshold`} /> : null}
              {trustFunnel.summary.suppressed ? <Chip size="small" variant="outlined" label={`${trustFunnel.summary.suppressed} duplicate/suppressed`} /> : null}
              {trustFunnel.summary.listingPagesSuppressed ? <Chip size="small" variant="outlined" label={`${trustFunnel.summary.listingPagesSuppressed} listing pages suppressed`} /> : null}
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function CandidatesPanel({
  candidates,
  selectedCandidateIds,
  visibleCandidateIds,
  preparing,
  onToggle,
  onToggleAll,
  onPrepareSelected,
}: {
  candidates: ApplySprintTrustFunnel["candidates"];
  selectedCandidateIds: string[];
  visibleCandidateIds: string[];
  preparing: boolean;
  onToggle: (matchId: string) => void;
  onToggleAll: () => void;
  onPrepareSelected: () => void;
}) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Typography variant="h3">Candidates</Typography>
              <Typography variant="body2" color="text.secondary">
                Eligible needs-review matches that have usable application URLs and can still be prepared for Apply Sprint.
              </Typography>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button variant="outlined" disabled={!visibleCandidateIds.length} onClick={onToggleAll}>
                {selectedCandidateIds.length === visibleCandidateIds.length ? "Clear selection" : "Select visible"}
              </Button>
              <Button variant="contained" disabled={preparing || !selectedCandidateIds.length} onClick={onPrepareSelected}>
                {preparing ? "Preparing..." : "Prepare selected"}
              </Button>
            </Stack>
          </Stack>

          <AgencyRunControl
            label="Run agency for visible candidates"
            minimumScore={0}
            limit={Math.max(1, Math.min(visibleCandidateIds.length || 1, 100))}
            variant="outlined"
            showLatestOnMount={false}
          />

          {candidates.length ? (
            <Stack spacing={1}>
              {candidates.map((candidate) => (
                <Box key={candidate.matchId} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25 }}>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", minWidth: 0 }}>
                      <Checkbox
                        checked={selectedCandidateIds.includes(candidate.matchId)}
                        onChange={() => onToggle(candidate.matchId)}
                        disabled={!candidate.canPrepare}
                        size="small"
                        slotProps={{ input: { "aria-label": `Select ${candidate.company} ${candidate.title}` } }}
                      />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 850 }}>{candidate.company}</Typography>
                        <Typography variant="body2" color="text.secondary">{candidate.title}</Typography>
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 0.75 }}>
                          <Chip size="small" label={`${candidate.score} score`} />
                          <Chip size="small" variant="outlined" label={candidate.profileName} />
                          {candidate.location ? <Chip size="small" variant="outlined" label={candidate.location} /> : null}
                        </Stack>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                      <Button component={Link} href={`/jobs/${candidate.jobId}`} size="small" variant="outlined">
                        Open job
                      </Button>
                      <Button component="a" href={candidate.applicationUrl ?? undefined} target="_blank" rel="noreferrer" size="small" variant="outlined" disabled={!candidate.applicationUrl}>
                        Application
                      </Button>
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
          ) : (
            <Alert severity="info">No eligible candidates are waiting. Check Hidden / Suppressed for jobs that were filtered out before packet prep.</Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function AgencyResultsPanel({ results, latestAgencyRun }: { results: ApplySprintTrustFunnel["agencyResults"]; latestAgencyRun: ApplySprintTrustFunnel["latestAgencyRun"] }) {
  const [selectedResult, setSelectedResult] = useState<ApplySprintTrustFunnel["agencyResults"][number] | null>(null);
  const visibleResults = selectedResult ? [selectedResult] : results;

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { md: "flex-end" } }}>
            <Box>
              <Typography variant="h3">Agency Results</Typography>
              <Typography variant="body2" color="text.secondary">
                Latest recruiting-agency packet preparation output, including failures that do not appear in Ready.
              </Typography>
              {latestAgencyRun ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  Run {latestAgencyRun.id} · {latestAgencyRun.status.toLowerCase()} · updated {formatDateTime(latestAgencyRun.updatedAt)}
                </Typography>
              ) : null}
            </Box>
            <Autocomplete
              size="small"
              options={results}
              value={selectedResult}
              onChange={(_, value) => setSelectedResult(value)}
              getOptionLabel={(result) => `${result.company} - ${result.title}`}
              isOptionEqualToValue={(option, value) => (option.applicationId ?? option.matchId ?? option.jobId ?? `${option.company}:${option.title}`) === (value.applicationId ?? value.matchId ?? value.jobId ?? `${value.company}:${value.title}`)}
              sx={{ width: { xs: "100%", md: 360 } }}
              renderInput={(params) => <TextField {...params} label="Search agency results" placeholder="Company or role" />}
            />
          </Stack>
          {results.length ? (
            <Box>
              <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 1, maxHeight: 420 }}>
                <Table size="small" stickyHeader aria-label="Agency results table">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 132 }}>Status</TableCell>
                      <TableCell sx={{ width: 86 }}>Score</TableCell>
                      <TableCell>Company</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell>Issue</TableCell>
                      <TableCell align="right" sx={{ width: 118 }}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleResults.map((result, index) => (
                      <TableRow key={`${result.matchId ?? result.jobId ?? result.applicationId ?? index}-${result.status}`} hover>
                        <TableCell>
                          <Chip size="small" color={result.status === "failed" ? "error" : result.status === "ready_to_apply" ? "success" : "default"} label={result.status.replace(/_/g, " ")} />
                        </TableCell>
                        <TableCell>{typeof result.score === "number" ? result.score : "--"}</TableCell>
                        <TableCell sx={{ fontWeight: 850, maxWidth: 180, overflowWrap: "anywhere" }}>{result.company}</TableCell>
                        <TableCell sx={{ maxWidth: 280, overflowWrap: "anywhere" }}>{result.title}</TableCell>
                        <TableCell>
                          {result.error || result.reason ? (
                            <Typography variant="body2" color={result.status === "failed" ? "error" : "text.secondary"}>{result.error ?? result.reason}</Typography>
                          ) : (
                            <Typography variant="body2" color="text.secondary">No issue reported.</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {result.applicationId ? (
                            <Button component={Link} href={`/applications/${result.applicationId}`} size="small" variant="outlined">
                              Application
                            </Button>
                          ) : (
                            <Typography variant="caption" color="text.secondary">No tracker</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {selectedResult ? (
                <Button size="small" variant="text" sx={{ mt: 1 }} onClick={() => setSelectedResult(null)}>
                  Show all agency results
                </Button>
              ) : null}
            </Box>
          ) : (
            <Alert severity="info">No agency result rows are available yet. Run search or run the agency for visible candidates.</Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function HiddenSuppressedPanel({ items }: { items: ApplySprintTrustFunnel["hidden"] }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h3">Hidden / Suppressed</Typography>
            <Typography variant="body2" color="text.secondary">
              Jobs and applications excluded from Ready, with the reason the agent or safety filter used.
            </Typography>
          </Box>
          {items.length ? (
            <Stack spacing={1}>
              {items.map((item) => (
                <Box key={`${item.kind}-${item.id}-${item.reasons.join("-")}`} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25 }}>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 850 }}>{item.company}</Typography>
                      <Typography variant="body2" color="text.secondary">{item.title}</Typography>
                      <Typography variant="caption" color="text.secondary">{item.detail}</Typography>
                    </Box>
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", justifyContent: { md: "flex-end" } }}>
                      {item.status ? <Chip size="small" variant="outlined" label={item.status.replace(/_/g, " ")} /> : null}
                      {item.score ? <Chip size="small" label={`${item.score} score`} /> : null}
                      {item.reasons.map((reason) => <Chip key={reason} size="small" color={reason === "packet_generation_failed" ? "error" : "default"} variant="outlined" label={applySprintReasonLabel(reason)} />)}
                      {item.applicationUrl ? (
                        <Button component="a" href={item.applicationUrl} target="_blank" rel="noreferrer" size="small" variant="outlined">
                          Open
                        </Button>
                      ) : null}
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
          ) : (
            <Alert severity="success">No hidden or suppressed rows were found in the current Apply Sprint window.</Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function ApplicationQuestionHelper({ applicationId, onNotice }: { applicationId?: string; onNotice: (message: string) => void }) {
  const { refresh } = useRouter();
  const [question, setQuestion] = useState("");
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionHelper, setQuestionHelper] = useState<QuestionHelperResponse | null>(null);
  const [savingMemoryIndex, setSavingMemoryIndex] = useState<number | null>(null);

  async function generateQuestionOptions() {
    setQuestionLoading(true);
    setQuestionHelper(null);
    try {
      const response = await fetch("/api/applications/question-helper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, applicationId }),
      });
      const payload = (await response.json().catch(() => ({}))) as QuestionHelperResponse;
      if (!response.ok) throw new Error(payload.error ?? "Unable to generate answer options.");
      setQuestionHelper(payload);
      onNotice(payload.savedToPacket ? "Answer options saved to the application packet." : "Answer options generated.");
      refresh();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Unable to generate answer options.");
    } finally {
      setQuestionLoading(false);
    }
  }

  async function saveAnswerMemory(index: number, answer: string) {
    setSavingMemoryIndex(index);
    try {
      const response = await fetch("/api/application-answer-memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionText: question,
          answer,
          sensitivity: "MEDIUM",
          reusePolicy: "ASK_FIRST",
          sourceApplicationId: applicationId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to save reusable answer.");
      onNotice(payload.message ?? "Reusable answer saved.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Unable to save reusable answer.");
    } finally {
      setSavingMemoryIndex(null);
    }
  }

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h3">Application question helper</Typography>
            <Typography variant="body2" color="text.secondary">
              Paste a written application prompt and generate three grounded answer options from your approved profile, verified bullets, projects, and synced GitHub work.
            </Typography>
          </Box>
          <TextField
            multiline
            minRows={3}
            label="Application question"
            placeholder="Example: Which project or challenge are you most proud of and why?"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            fullWidth
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
            <Button
              variant="contained"
              startIcon={<AutoAwesomeOutlinedIcon />}
              disabled={questionLoading || question.trim().length < 10}
              onClick={() => void generateQuestionOptions()}
            >
              {questionLoading ? "Generating..." : "Generate options"}
            </Button>
            {questionHelper?.context ? (
              <Typography variant="caption" color="text.secondary">
                Used {questionHelper.context.bulletsConsidered} bullets, {questionHelper.context.projectsConsidered} projects, {questionHelper.context.githubRepositoriesConsidered} repos
                {questionHelper.savedToPacket ? ` · saved to packet (${questionHelper.packetAnswerCount ?? 1})` : ""}.
              </Typography>
            ) : null}
          </Stack>
          {questionLoading ? <LinearProgress /> : null}
          {questionHelper?.answerMemory?.length ? (
            <Alert severity={questionHelper.answerMemory.some((memory) => memory.autoUsable) ? "success" : "info"}>
              Found {questionHelper.answerMemory.length} saved answer match{questionHelper.answerMemory.length === 1 ? "" : "es"}.
              {questionHelper.answerMemory.slice(0, 2).map((memory) => (
                <Box key={memory.id} sx={{ mt: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 850 }}>
                    {memory.matchScore}% match · {memory.reusePolicy.replace(/_/g, " ").toLowerCase()} · {memory.sensitivity.toLowerCase()}
                  </Typography>
                  <Typography variant="body2">{memory.questionText}</Typography>
                </Box>
              ))}
            </Alert>
          ) : null}
          {questionHelper?.options?.length ? (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(3, 1fr)" }, gap: 2 }}>
              {questionHelper.options.map((option, index) => (
                <Card key={`${option.title}-${option.answer.slice(0, 40)}`} variant="outlined">
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                        <Typography variant="h3">{option.title}</Typography>
                        <Chip size="small" variant="outlined" label={`Option ${index + 1}`} />
                      </Stack>
                      <Typography sx={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{option.answer}</Typography>
                      <Button
                        variant="outlined"
                        size="small"
                        disabled={savingMemoryIndex === index}
                        onClick={() => void saveAnswerMemory(index, option.answer)}
                      >
                        {savingMemoryIndex === index ? "Saving..." : "Save reusable answer"}
                      </Button>
                      <Divider />
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, textTransform: "uppercase" }}>Evidence</Typography>
                        <Stack spacing={0.5} sx={{ mt: 0.75 }}>
                          {option.evidence.length ? option.evidence.map((item, itemIndex) => (
                            <Typography key={`${option.title}-evidence-${itemIndex}`} variant="body2" color="text.secondary">- {item}</Typography>
                          )) : <Typography variant="body2" color="text.secondary">No specific evidence returned.</Typography>}
                        </Stack>
                      </Box>
                      <Alert severity={option.cautions.length ? "warning" : "info"}>
                        {option.cautions.length ? option.cautions.join(" ") : option.tone}
                      </Alert>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Box>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function AssistantRunPanel({
  diagnostics,
  timeline,
  log,
  fieldLearningHref,
  onCopyLog,
}: {
  diagnostics: AssistantRunDiagnostics | null;
  timeline: AssistantRunTimelineItem[];
  log: string;
  fieldLearningHref: string;
  onCopyLog: () => Promise<void>;
}) {
  const metricItems = diagnostics ? [
    { label: "Detected", value: diagnostics.counts.detected },
    { label: "Filled", value: diagnostics.counts.filled },
    { label: "Uploaded", value: diagnostics.counts.uploaded },
    { label: "Learned", value: diagnostics.counts.learned ?? diagnostics.counts.observed },
    { label: "Ignored", value: diagnostics.counts.ignored },
    { label: "Auto-fill", value: diagnostics.counts.activeForAutofill },
    { label: "Review", value: diagnostics.counts.needsReview },
    { label: "Skipped", value: diagnostics.counts.skipped },
  ] : [];

  if (!diagnostics) {
    return (
      <Stack spacing={2}>
        <Alert severity="info">No structured run feedback yet. Refresh after launching the assistant.</Alert>
        <RawLogPanel log={log} onCopyLog={onCopyLog} />
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <RawLogPanel log={log} onCopyLog={onCopyLog} />

      <Alert severity={diagnostics.severity}>
        <Stack spacing={0.75}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
            <Chip size="small" color={diagnostics.severity} label={titleCase(diagnostics.statusLabel)} />
            <Chip size="small" variant="outlined" label={titleCase(diagnostics.phase.replace(/_/g, " "))} />
            {diagnostics.blockerType ? <Chip size="small" color="warning" variant="outlined" label={diagnostics.blockerType.replace(/_/g, " ")} /> : null}
          </Stack>
          <Typography sx={{ fontWeight: 850 }}>{diagnostics.summary}</Typography>
          <Typography variant="body2">{diagnostics.currentAction}</Typography>
          {diagnostics.reason ? <Typography variant="body2" color="text.secondary">Reason: {diagnostics.reason}</Typography> : null}
          <Typography variant="body2" color="text.secondary">Next: {diagnostics.nextAction}</Typography>
        </Stack>
      </Alert>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(5, 1fr)" }, gap: 1 }}>
        {metricItems.map((item) => (
          <Box key={item.label} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, textTransform: "uppercase" }}>{item.label}</Typography>
            <Typography variant="h3">{item.value ?? "--"}</Typography>
          </Box>
        ))}
      </Box>

      <Button component={Link} href={fieldLearningHref} variant="outlined" size="small" sx={{ alignSelf: "flex-start" }}>
        Review learned fields
      </Button>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1 }}>
        <RunMeta label="Last update" value={formatDateTime(timeline.at(-1)?.at ?? diagnostics.finishedAt ?? diagnostics.startedAt)} />
        <RunMeta label="Run duration" value={formatDuration(diagnostics.durationSeconds)} />
        <RunMeta label="Process / log" value={[diagnostics.pid ? `PID ${diagnostics.pid}` : null, diagnostics.logPath ? shortPath(diagnostics.logPath) : null].filter(Boolean).join(" · ") || "--"} />
      </Box>

      <Box>
        <Typography variant="h3" sx={{ mb: 1 }}>Event timeline</Typography>
        {timeline.length ? (
          <Stack spacing={1}>
            {timeline.slice(-10).reverse().map((item, index) => (
              <Box key={`${item.type}-${item.at ?? index}-${item.message}`} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "flex-start" } }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                      <Chip size="small" color={item.severity} variant="outlined" label={item.type.replace(/_/g, " ")} />
                      <Typography sx={{ fontWeight: 800 }}>{item.message}</Typography>
                    </Stack>
                    {item.detail ? <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{item.detail}</Typography> : null}
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ flex: "0 0 auto" }}>{formatDateTime(item.at)}</Typography>
                </Stack>
              </Box>
            ))}
          </Stack>
        ) : (
          <Alert severity="info">No assistant events have been recorded yet.</Alert>
        )}
      </Box>
    </Stack>
  );
}

function RunMeta({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, textTransform: "uppercase" }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 800, overflowWrap: "anywhere" }}>{value || "--"}</Typography>
    </Box>
  );
}

function RawLogPanel({ log, onCopyLog }: { log: string; onCopyLog: () => Promise<void> }) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25 }}>
      <Typography sx={{ fontWeight: 850 }}>
        Raw log
      </Typography>
      <Stack spacing={1} sx={{ mt: 1.5 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<ContentCopyOutlinedIcon />}
          disabled={!log}
          onClick={() => void onCopyLog()}
          sx={{ alignSelf: "flex-start" }}
        >
          Copy raw log
        </Button>
        <Box
          component="pre"
          sx={{
            maxHeight: 360,
            m: 0,
            p: 2,
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            bgcolor: "#0f172a",
            color: "#e2e8f0",
            overflow: "auto",
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {log || "No log yet."}
        </Box>
      </Stack>
    </Box>
  );
}

function AshbyRiskPanel({ assessment }: { assessment: AshbyRiskAssessment }) {
  const severity = assessment.riskLevel === "ready" ? "success" : assessment.riskLevel === "high_risk" ? "error" : "warning";
  const openItems = assessment.checklist.filter((item) => item.status !== "ready");

  return (
    <Alert severity={severity}>
      <Stack spacing={1}>
        <Typography sx={{ fontWeight: 850 }}>Ashby pre-submit checklist</Typography>
        <Typography variant="body2">
          {assessment.riskLevel === "ready"
            ? "Known knockout-risk checks look ready. Still review every field before submitting."
            : "Review these Ashby knockout-risk items before clicking submit."}
        </Typography>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
          {(openItems.length ? openItems : assessment.checklist.slice(0, 4)).map((item) => (
            <Chip
              key={`${item.category}-${item.label}`}
              size="small"
              color={item.status === "ready" ? "success" : item.status === "high_risk" ? "error" : "warning"}
              variant="outlined"
              label={`${item.label}${item.suggestedAnswer ? `: ${item.suggestedAnswer}` : ""}`}
              title={item.detail}
            />
          ))}
        </Stack>
        {assessment.recommendedActions[0] ? (
          <Typography variant="caption" color="text.secondary">{assessment.recommendedActions[0]}</Typography>
        ) : null}
      </Stack>
    </Alert>
  );
}

function sprintProgressForApplication(application: ReadyApplication): {
  label: string;
  detail: string;
  value: number;
  color: "primary" | "success" | "warning" | "error";
} {
  const runState = application.automationRun ? automationRunState(application.automationRun) : null;
  if (runState?.running) {
    return {
      label: "Running",
      detail: "Assistant is working in the background. Refresh the log for current output.",
      value: 70,
      color: "primary",
    };
  }
  if (application.automationRun?.status === "BLOCKED" || application.automationRun?.status === "FAILED") {
    return {
      label: application.automationRun.status === "FAILED" ? "Failed" : "Blocked",
      detail: application.automationRun.blockerMessage ?? "Review the assistant log and blocker details.",
      value: 60,
      color: application.automationRun.status === "FAILED" ? "error" : "warning",
    };
  }
  if (application.blocker) {
    return {
      label: "Blocked",
      detail: "A hard blocker or sensitive approval must be resolved before the assistant should run again.",
      value: 60,
      color: "warning",
    };
  }
  if (isAssistantClosedRun(application.automationRun)) {
    return {
      label: "Ready",
      detail: "Previous assistant session closed before submit. Relaunch when you are ready.",
      value: 50,
      color: "primary",
    };
  }
  if (application.assistantLaunched) {
    return {
      label: "Review",
      detail: "Assistant launched. Review the employer form, submit, then mark applied.",
      value: 80,
      color: "success",
    };
  }
  if (application.resumeId && application.coverLetterId) {
    return {
      label: "Ready",
      detail: summarizeReadyJobDescription(application),
      value: 50,
      color: "primary",
    };
  }
  return {
    label: "Needs packet",
    detail: "Resume and cover letter are required before Apply Sprint.",
    value: 25,
    color: "error",
  };
}

function automationRunState(run: NonNullable<ReadyApplication["automationRun"]>): {
  label: string;
  color: "primary" | "success" | "warning" | "error" | "info";
  variant: "filled" | "outlined";
  running: boolean;
} {
  if (run.status === "RUNNING") {
    return { label: run.currentNode === "observeManualInput" ? "Learning" : "Running", color: "primary", variant: "filled", running: true };
  }
  if (run.status === "READY_TO_SUBMIT") {
    return {
      label: "Ready to submit",
      color: "success",
      variant: "outlined",
      running: false,
    };
  }
  if (run.status === "SUBMITTED") {
    return {
      label: "Submitted",
      color: "success",
      variant: "filled",
      running: false,
    };
  }
  if (run.status === "FAILED") {
    return {
      label: "Failed",
      color: "error",
      variant: "filled",
      running: false,
    };
  }
  return {
    label: "Blocked",
    color: "warning",
    variant: "filled",
    running: false,
  };
}

function workflowStatusForApplication(application: ReadyApplication | undefined, launch: LaunchResponse | null): WorkflowStatus | null {
  if (!application) return launch?.workflow ?? null;
  if (launch?.application?.id === application.id && launch.workflow) return launch.workflow;
  const state = application.automationRun?.workflowState;
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const workflow = state as Partial<WorkflowStatus>;
  const events = Array.isArray(workflow.events) ? workflow.events : [];
  return {
    graphThreadId: application.automationRun?.graphThreadId ?? workflow.graphThreadId ?? null,
    currentNode: application.automationRun?.currentNode ?? workflow.currentNode ?? null,
    status: workflow.status ?? application.automationRun?.status ?? null,
    automationRunId: application.automationRun?.id ?? workflow.automationRunId ?? null,
    pendingCommand: workflow.pendingCommand ?? null,
    counts: workflow.counts,
    fields: workflow.fields,
    events,
    latestEvent: workflow.latestEvent ?? events.at(-1) ?? null,
  };
}

function workflowNodeLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

function isAssistantClosedRun(run: ReadyApplication["automationRun"]) {
  return run?.status === "NEEDS_USER" && run.blockerType === "assistant_closed";
}

function primarySprintAction(application: ReadyApplication, canMarkApplied: boolean): {
  kind: "answer" | "launch" | "mark_applied";
  label: string;
  detail: string;
  color: "primary" | "success" | "warning";
  href?: string;
  disabled?: boolean;
  loadingLabel?: string;
} {
  if (application.blocker) {
    return {
      kind: "answer",
      label: "Review blocker",
      detail: "Resolve the hard blocker or sensitive approval before launching the assistant again.",
      color: "warning",
      href: "/needs-me",
    };
  }
  if (application.automationRun?.status === "RUNNING") {
    return {
      kind: "launch",
      label: "Assistant running",
      detail: "The local browser assistant is already working in the background.",
      color: "primary",
      disabled: true,
    };
  }
  if (!application.resumeId || !application.coverLetterId) {
    return {
      kind: "answer",
      label: "Review packet",
      detail: "Resume and cover letter are required before the assistant can launch this ready application.",
      color: "warning",
      href: `/applications/${application.id}`,
    };
  }
  if (!application.applicationUrl) {
    return {
      kind: "answer",
      label: "Add application URL",
      detail: "This ready application is missing the employer application URL, so it can be tracked here but cannot launch the assistant yet.",
      color: "warning",
      href: `/applications/${application.id}`,
    };
  }
  if (isUnsupportedAssistantUrl(application.applicationUrl)) {
    return {
      kind: "answer",
      label: "Open manually",
      detail: "This source URL is not usable for assisted form filling. Open the application profile and replace it with the employer form URL when available.",
      color: "warning",
      href: `/applications/${application.id}`,
    };
  }
  const closedRun = isAssistantClosedRun(application.automationRun) ? application.automationRun : null;
  if (closedRun) {
    return {
      kind: "launch",
      label: "Relaunch assistant",
      loadingLabel: "Launching...",
      detail: closedRun.blockerMessage ?? "The previous assistant session closed before submit.",
      color: "success",
    };
  }
  if (application.assistantLaunched) {
    return {
      kind: "mark_applied",
      label: "Mark as applied",
      loadingLabel: "Updating...",
      detail: "Use this after you review the employer form and submit it.",
      color: "primary",
      disabled: !canMarkApplied,
    };
  }
  return {
    kind: "launch",
    label: "Launch assistant",
    loadingLabel: "Launching...",
    detail: summarizeReadyJobDescription(application),
    color: "success",
  };
}

function summarizeReadyJobDescription(application: Pick<ReadyApplication, "description" | "title" | "company">) {
  return summarizeApplicationJobDescription(application);
}

function isUnsupportedAssistantUrl(value: string) {
  return !assessApplicationUrlQuality(value).launchable;
}

function applySprintReasonLabel(reason: ApplySprintReasonCode) {
  const labels: Record<ApplySprintReasonCode, string> = {
    below_profile_threshold: "below profile threshold",
    existing_match_not_new: "existing match, not new",
    profile_max_results_cap: "per-profile maxResultsPerRun cap",
    no_application_url: "no application URL",
    unsupported_application_url: "unsupported URL",
    duplicate_or_suppressed: "duplicate/suppressed",
    already_has_application: "already has application",
    agency_already_running: "agency already running",
    packet_generation_failed: "packet generation failed",
    missing_resume_or_cover_letter: "missing resume or cover letter",
    material_quality_needs_review: "material quality needs review",
    hidden_by_canonical_duplicate_reconciliation: "hidden by canonical duplicate reconciliation",
    review_only_broad_discovery: "review-only broad discovery",
  };
  return labels[reason];
}

function isLearningWorkflow(workflow: WorkflowStatus | null) {
  return workflow?.currentNode === "observeManualInput" || workflow?.pendingCommand?.type === "observe";
}

function titleCase(value: string) {
  return value.replace(/\w\S*/g, (word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`);
}

function fieldLearningHref(application: ReadyApplication) {
  const params = new URLSearchParams({ applicationId: application.id });
  if (application.applicationUrl) {
    try {
      params.set("host", new URL(application.applicationUrl).hostname.replace(/^www\./, ""));
    } catch {
      // Keep the application filter even if the employer URL is malformed.
    }
  }
  return `/settings/learning?${params.toString()}#settings-field-learning`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function formatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "--";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function shortPath(value: string) {
  const parts = value.split("/");
  return parts.slice(-2).join("/");
}
