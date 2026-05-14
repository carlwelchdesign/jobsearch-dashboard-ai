"use client";

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

type ReadyApplication = {
  id: string;
  company: string;
  title: string;
  applicationUrl: string | null;
  score: number | null;
  resumeId: string | null;
  coverLetterId: string | null;
  assistantLaunched: boolean;
};

type LaunchResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  logPath?: string;
  application?: {
    id: string;
    company: string;
    title: string;
    applicationUrl: string | null;
  };
};

type QuestionHelperResponse = {
  error?: string;
  generatedBy?: string;
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
};

export function AssistantWorkbench({ applications }: { applications: ReadyApplication[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(applications[0]?.id ?? "");
  const [launch, setLaunch] = useState<LaunchResponse | null>(null);
  const [log, setLog] = useState("");
  const [loading, setLoading] = useState(false);
  const [markingApplied, setMarkingApplied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionHelper, setQuestionHelper] = useState<QuestionHelperResponse | null>(null);
  const [notice, setNotice] = useState("");
  const visibleApplications = useMemo(
    () => applications.filter((application) => !deletedIds.includes(application.id)),
    [applications, deletedIds],
  );
  const selected = useMemo(() => visibleApplications.find((application) => application.id === selectedId), [visibleApplications, selectedId]);

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
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to mark application applied.");
    } finally {
      setMarkingApplied(false);
    }
  }

  async function deleteSelected() {
    if (!selected) return;
    if (!window.confirm(`Delete ${selected.company} - ${selected.title} from Apply Sprint? Generated resume and cover letter records will remain available.`)) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/applications/${selected.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to delete application.");
      const remaining = visibleApplications.filter((application) => application.id !== selected.id);
      setDeletedIds((current) => [...current, selected.id]);
      setSelectedId(remaining[0]?.id ?? "");
      setLaunch(null);
      setLog("");
      setNotice(payload.message ?? "Application removed from Apply Sprint.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to delete application.");
    } finally {
      setDeleting(false);
    }
  }

  async function generateQuestionOptions() {
    setQuestionLoading(true);
    setQuestionHelper(null);
    try {
      const response = await fetch("/api/applications/question-helper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const payload = (await response.json().catch(() => ({}))) as QuestionHelperResponse;
      if (!response.ok) throw new Error(payload.error ?? "Unable to generate answer options.");
      setQuestionHelper(payload);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to generate answer options.");
    } finally {
      setQuestionLoading(false);
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
                    {selected.assistantLaunched ? <Chip size="small" color="warning" variant="outlined" label="Assistant launched" /> : null}
                    {selected.score ? <Chip size="small" label={`${selected.score} score`} /> : null}
                  </Stack>
                </Stack>
              ) : (
                <Alert severity="info">No ready applications. Use Auto-prepare from Dashboard or Applications first.</Alert>
              )}
              <Divider />
              <Stack spacing={1}>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<PlayCircleOutlineOutlinedIcon />}
                  disabled={!selectedId || loading}
                  onClick={() => void launchSelected(false)}
                >
                  Launch selected
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<PlayCircleOutlineOutlinedIcon />}
                  disabled={loading}
                  onClick={() => void launchSelected(true)}
                >
                  Launch next unlaunched
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  disabled={markingApplied || !(launch?.application?.id ?? selectedId)}
                  onClick={() => void markApplied()}
                >
                  {markingApplied ? "Updating..." : "Mark as applied"}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlineOutlinedIcon />}
                  disabled={!selected || deleting || loading}
                  onClick={() => void deleteSelected()}
                >
                  {deleting ? "Deleting..." : "Delete from queue"}
                </Button>
              </Stack>
              <Alert severity="warning">
                Employer forms cannot be safely embedded and controlled inside this app because they are cross-origin. The assistant opens a local browser, fills/uploads, then stops before submit.
              </Alert>
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
                  Used {questionHelper.context.bulletsConsidered} bullets, {questionHelper.context.projectsConsidered} projects, {questionHelper.context.githubRepositoriesConsidered} repos.
                </Typography>
              ) : null}
            </Stack>
            {questionLoading ? <LinearProgress /> : null}
            {questionHelper?.options?.length ? (
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(3, 1fr)" }, gap: 2 }}>
                {questionHelper.options.map((option, index) => (
                  <Card key={`${option.title}-${index}`} variant="outlined">
                    <CardContent>
                      <Stack spacing={1.5}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                          <Typography variant="h3">{option.title}</Typography>
                          <Chip size="small" variant="outlined" label={`Option ${index + 1}`} />
                        </Stack>
                        <Typography sx={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{option.answer}</Typography>
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
      <Snackbar open={Boolean(notice)} autoHideDuration={6000} onClose={() => setNotice("")}>
        <Alert severity={launch?.ok ? "success" : "info"} variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}
