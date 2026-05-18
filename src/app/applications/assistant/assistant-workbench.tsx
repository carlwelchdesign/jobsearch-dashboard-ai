"use client";

import Link from "next/link";
import PlayCircleOutlineOutlinedIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { RejectionReasonDialog, type RejectionReasonCode } from "@/components/job-reject-button";

type ReadyApplication = {
  id: string;
  jobPostingId: string;
  jobProfileMatchId: string | null;
  company: string;
  title: string;
  applicationUrl: string | null;
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

export function AssistantWorkbench({ applications, atsBlockers }: { applications: ReadyApplication[]; atsBlockers: AtsBlockerSummary[] }) {
  const { refresh } = useRouter();
  const [selectedId, setSelectedId] = useState(applications[0]?.id ?? "");
  const [launch, setLaunch] = useState<LaunchResponse | null>(null);
  const [log, setLog] = useState("");
  const [loading, setLoading] = useState(false);
  const [markingApplied, setMarkingApplied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionHelper, setQuestionHelper] = useState<QuestionHelperResponse | null>(null);
  const [savingMemoryIndex, setSavingMemoryIndex] = useState<number | null>(null);
  const [pendingRejectionFeedback, setPendingRejectionFeedback] = useState<Pick<ReadyApplication, "jobPostingId" | "jobProfileMatchId" | "company" | "title"> | null>(null);
  const [notice, setNotice] = useState("");
  const visibleApplications = useMemo(
    () => applications.filter((application) => !deletedIds.includes(application.id)),
    [applications, deletedIds],
  );
  const selected = useMemo(() => visibleApplications.find((application) => application.id === selectedId), [visibleApplications, selectedId]);
  const selectedBlocker = selected?.blocker ?? null;
  const selectedRunState = selected?.automationRun ? automationRunState(selected.automationRun) : null;
  const selectedWorkflow = workflowStatusForApplication(selected, launch);
  const selectedPrimaryAction = selected ? primarySprintAction(selected, Boolean(launch?.application?.id ?? selectedId)) : null;
  const queueProgress = useMemo(() => visibleApplications.map((application) => ({
    ...application,
    progress: sprintProgressForApplication(application),
  })), [visibleApplications]);

  async function launchSelected(next = false) {
    const endpoint = next ? "/api/applications/next-ready/launch-assistant" : `/api/applications/${selectedId}/launch-assistant`;
    setLoading(true);
    setLog("");
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const payload = (await response.json()) as LaunchResponse;
      if (!response.ok) throw new Error(payload.error ?? "Assistant launch failed.");
      setLaunch(payload);
      setNotice(payload.message ?? "Assistant launched.");
      const appId = payload.application?.id ?? selectedId;
      window.setTimeout(() => void refreshLog(appId), 1200);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Assistant launch failed.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshLog(applicationId = launch?.application?.id ?? selectedId) {
    if (!applicationId) return;
    const response = await fetch(`/api/applications/${applicationId}/assistant-log`);
    const payload = await response.json().catch(() => ({}));
      if (response.ok) setLog(payload.log ?? "");
      if (response.ok && payload.automationRun?.workflowStateJson) refresh();
  }

  async function markApplied() {
    const applicationId = launch?.application?.id ?? selectedId;
    if (!applicationId) return;
    setMarkingApplied(true);
    try {
      const response = await fetch(`/api/applications/${applicationId}/mark-applied`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to mark application applied.");
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
      setLog("");
      setNotice(payload.message ?? "Assistant test state reset.");
      refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to reset assistant state.");
    } finally {
      setResetting(false);
    }
  }

  async function deleteSelected() {
    if (!selected) return;
    if (!window.confirm(`Reject ${selected.company} - ${selected.title} and remove it from Apply Sprint? The agency will remember this as a not-good-fit signal.`)) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/applications/${selected.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to delete application.");
      const remaining = visibleApplications.filter((application) => application.id !== selected.id);
      setDeletedIds((current) => [...current, selected.id]);
      if (selected.jobProfileMatchId) {
        setPendingRejectionFeedback({
          jobPostingId: selected.jobPostingId,
          jobProfileMatchId: selected.jobProfileMatchId,
          company: selected.company,
          title: selected.title,
        });
      }
      setSelectedId(remaining[0]?.id ?? "");
      setLaunch(null);
      setLog("");
      setNotice(payload.message ?? "Application removed and job marked rejected.");
      refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to delete application.");
    } finally {
      setDeleting(false);
    }
  }

  async function submitRejectionFeedback(reasons: RejectionReasonCode[], note: string) {
    if (!pendingRejectionFeedback?.jobProfileMatchId) return;
    const response = await fetch("/api/jobs/rejection-feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        matchId: pendingRejectionFeedback.jobProfileMatchId,
        jobPostingId: pendingRejectionFeedback.jobPostingId,
        reasons,
        note,
        source: "apply_sprint_rejection_reason_prompt",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "Unable to save rejection feedback.");
    setPendingRejectionFeedback(null);
    setNotice(payload.message ?? "Rejection feedback saved for agent learning.");
  }

  async function generateQuestionOptions() {
    setQuestionLoading(true);
    setQuestionHelper(null);
    try {
      const response = await fetch("/api/applications/question-helper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, applicationId: selectedId || undefined }),
      });
      const payload = (await response.json().catch(() => ({}))) as QuestionHelperResponse;
      if (!response.ok) throw new Error(payload.error ?? "Unable to generate answer options.");
      setQuestionHelper(payload);
      setNotice(payload.savedToPacket ? "Answer options saved to the application packet." : "Answer options generated.");
      refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to generate answer options.");
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
          sourceApplicationId: selectedId || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to save reusable answer.");
      setNotice(payload.message ?? "Reusable answer saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save reusable answer.");
    } finally {
      setSavingMemoryIndex(null);
    }
  }

  return (
    <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "380px 1fr" }, gap: 2 }}>
      <Card>
        <CardContent>
          <Stack spacing={2}>
              <Box>
                <Typography variant="h3">Assistant queue</Typography>
                <Typography variant="body2" color="text.secondary">
                  Pick a ready application or launch the next highest-scoring item.
                </Typography>
              </Box>
              <TextField
                select
                label="Ready application"
                value={selectedId}
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
                    {selectedWorkflow?.currentNode ? <Chip size="small" color="info" variant="outlined" label={`Workflow: ${workflowNodeLabel(selectedWorkflow.currentNode)}`} /> : null}
                    {selectedWorkflow?.counts?.detected ? <Chip size="small" color="info" variant="outlined" label={`${selectedWorkflow.counts.filled}/${selectedWorkflow.counts.detected} fields`} /> : null}
                    {selected.assistantLaunched ? <Chip size="small" color="warning" variant="outlined" label="Assistant launched" /> : null}
                    {selected.blocker ? <Chip size="small" color="warning" label="Needs answer" /> : null}
                    {selected.score ? <Chip size="small" label={`${selected.score} score`} /> : null}
                  </Stack>
                </Stack>
              ) : (
                <Alert severity="info">No ready applications. Run search so the recruiting agency can approve strong matches and prepare packets.</Alert>
              )}
              <Divider />
              {selectedBlocker ? (
                <Alert
                  severity="warning"
                  action={
                    <Button component={Link} href="/needs-me" color="inherit" size="small">
                      Answer
                    </Button>
                  }
                >
                  {selectedBlocker.question}
                </Alert>
              ) : null}
              {selectedRunState?.running ? (
                <Alert severity="info">
                  Assistant is running in the background. You can leave this page and return here to refresh the log.
                </Alert>
              ) : selectedRunState?.message ? (
                <Alert severity={selectedRunState.alert}>{selectedRunState.message}</Alert>
              ) : null}
              {selectedWorkflow?.latestEvent ? (
                <Alert severity="info">
                  {selectedWorkflow.latestEvent.message}
                </Alert>
              ) : null}
              {selectedWorkflow?.pendingCommand ? (
                <Alert severity={selectedWorkflow.pendingCommand.type === "ask_user" ? "warning" : "info"}>
                  {selectedWorkflow.pendingCommand.type === "ask_user"
                    ? "Assistant is paused for your answer."
                    : `Next field action: ${workflowNodeLabel(selectedWorkflow.pendingCommand.type)}.`} {selectedWorkflow.pendingCommand.reason}
                </Alert>
              ) : null}
              {selectedPrimaryAction ? (
                <Stack spacing={1}>
                  <Button
                    component={selectedPrimaryAction.href ? Link : "button"}
                    href={selectedPrimaryAction.href}
                    variant="contained"
                    color={selectedPrimaryAction.color}
                    startIcon={selectedPrimaryAction.kind === "launch" ? <PlayCircleOutlineOutlinedIcon /> : undefined}
                    disabled={selectedPrimaryAction.disabled || loading || markingApplied}
                    onClick={selectedPrimaryAction.kind === "launch"
                      ? () => void launchSelected(false)
                      : selectedPrimaryAction.kind === "mark_applied"
                        ? () => void markApplied()
                        : undefined}
                  >
                    {selectedPrimaryAction.loadingLabel && (loading || markingApplied) ? selectedPrimaryAction.loadingLabel : selectedPrimaryAction.label}
                  </Button>
                  <Typography variant="body2" color="text.secondary">{selectedPrimaryAction.detail}</Typography>
                </Stack>
              ) : null}
              <Divider />
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, textTransform: "uppercase" }}>Secondary actions</Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
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
                    onClick={() => void deleteSelected()}
                  >
                    {deleting ? "Rejecting..." : "Reject from queue"}
                  </Button>
                </Stack>
              </Box>
              <Alert severity="warning">
                {selectedBlocker
                  ? "Resolve the open blocker before launching this application again."
                  : "Employer forms cannot be safely embedded and controlled inside this app because they are cross-origin. The assistant opens a local browser, fills/uploads, then stops before submit."}
              </Alert>
              {queueProgress.length ? (
                <>
                  <Divider />
                  <Box>
                    <Typography variant="h3">Queue progress</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Each item shows the next workflow state before it leaves Apply Sprint.
                    </Typography>
                  </Box>
                  <Stack spacing={1}>
                    {queueProgress.slice(0, 8).map((application) => (
                      <Box
                        key={application.id}
                        sx={{
                          border: 1,
                          borderColor: application.id === selectedId ? "primary.main" : "divider",
                          borderRadius: 1,
                          p: 1.25,
                          bgcolor: application.id === selectedId ? "rgba(37, 99, 235, 0.06)" : "background.paper",
                        }}
                      >
                        <Stack spacing={1}>
                          <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 850 }} noWrap>{application.company}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>{application.title}</Typography>
                            </Box>
                            <Chip size="small" color={application.progress.color} label={application.progress.label} />
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={application.progress.value}
                            color={application.progress.color}
                            sx={{ height: 6, borderRadius: 1 }}
                          />
                          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
                            <Typography variant="caption" color="text.secondary">{application.progress.detail}</Typography>
                            <Button size="small" variant={application.id === selectedId ? "contained" : "outlined"} onClick={() => setSelectedId(application.id)}>
                              Select
                            </Button>
                          </Stack>
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </>
              ) : null}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
                <Box>
                  <Typography variant="h3">Assistant run</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Live result from the local browser filler.
                  </Typography>
                </Box>
                <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} onClick={() => void refreshLog()}>
                  Refresh log
                </Button>
              </Stack>
              {loading ? <LinearProgress /> : null}
              {launch ? (
                <Alert severity="success">
                  {launch.message}
                  {launch.automationRunId ? <Box component="span" sx={{ display: "block", mt: 0.5 }}>Run: {launch.automationRunId}</Box> : null}
                  {launch.logPath ? <Box component="span" sx={{ display: "block", mt: 0.5 }}>Log: {launch.logPath}</Box> : null}
                </Alert>
              ) : (
                <Alert severity="info">Launch an application to see fill/upload results here.</Alert>
              )}
              <Box
                component="pre"
                sx={{
                  minHeight: 360,
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
          </CardContent>
        </Card>
      </Box>

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
        onSubmit={submitRejectionFeedback}
      />
    </>
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
      detail: application.automationRun.blockerMessage ?? "Review the assistant log or Needs Me queue.",
      value: 60,
      color: application.automationRun.status === "FAILED" ? "error" : "warning",
    };
  }
  if (application.blocker) {
    return {
      label: "Blocked",
      detail: "Needs your answer before the assistant should run again.",
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
      detail: "Materials are ready. Launch the assistant when you are ready to work this item.",
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
  alert: "info" | "success" | "warning" | "error";
  message?: string;
} {
  if (run.status === "RUNNING") {
    return { label: "Running", color: "primary", variant: "filled", running: true, alert: "info" };
  }
  if (run.status === "READY_TO_SUBMIT") {
    return {
      label: "Ready to submit",
      color: "success",
      variant: "outlined",
      running: false,
      alert: "success",
      message: "Assistant finished filling known fields. Review the browser form, submit manually, then mark applied.",
    };
  }
  if (run.status === "SUBMITTED") {
    return {
      label: "Submitted",
      color: "success",
      variant: "filled",
      running: false,
      alert: "success",
      message: "Assistant recorded a submitted run. Confirm the outcome is tracked.",
    };
  }
  if (run.status === "FAILED") {
    return {
      label: "Failed",
      color: "error",
      variant: "filled",
      running: false,
      alert: "error",
      message: run.blockerMessage ?? "Assistant run failed. Review the log before trying again.",
    };
  }
  return {
    label: "Blocked",
    color: "warning",
    variant: "filled",
    running: false,
    alert: "warning",
    message: run.blockerMessage ?? "Assistant run is blocked and needs review.",
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
      label: "Answer blocker",
      detail: "Resolve the open question before launching the assistant again.",
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
    detail: "Open the local browser assistant to fill known fields and upload materials.",
    color: "success",
  };
}
