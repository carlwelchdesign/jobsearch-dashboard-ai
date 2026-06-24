"use client";

import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { thankYouStages, thankYouStageLabel, type ThankYouStage } from "@/lib/applications/thank-you-draft-constants";
import { copyTextToClipboard } from "@/lib/browser/clipboard";

const today = new Date().toISOString().slice(0, 10);

export function ThankYouDraftForm({ applicationId }: { applicationId: string }) {
  const { refresh } = useRouter();
  const [stage, setStage] = useState<ThankYouStage>("recruiter_screen");
  const [interviewerName, setInterviewerName] = useState("");
  const [interviewerTitle, setInterviewerTitle] = useState("");
  const [interviewerLinkedin, setInterviewerLinkedin] = useState("");
  const [interviewDate, setInterviewDate] = useState(today);
  const [tone, setTone] = useState("professional");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error" | "info">("info");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`/api/applications/${applicationId}/thank-you-drafts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stage,
          interviewerName,
          interviewerTitle,
          interviewerLinkedin,
          interviewDate,
          tone,
          notes,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Could not create thank-you draft.");
      setSeverity("success");
      setNotice(payload.message ?? "Thank-you draft created.");
      refresh();
    } catch (error) {
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Could not create thank-you draft.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack component="form" spacing={1.5} onSubmit={submit}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
          <FormControl fullWidth size="small">
            <InputLabel id="thank-you-stage-label">Stage</InputLabel>
            <Select
              labelId="thank-you-stage-label"
              label="Stage"
              value={stage}
              onChange={(event) => setStage(event.target.value as ThankYouStage)}
            >
              {thankYouStages.map((item) => (
                <MenuItem key={item} value={item}>{thankYouStageLabel(item)}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            required
            size="small"
            label="Interviewer"
            value={interviewerName}
            onChange={(event) => setInterviewerName(event.target.value)}
            fullWidth
          />
          <TextField
            size="small"
            label="Interview date"
            type="date"
            value={interviewDate}
            onChange={(event) => setInterviewDate(event.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
          <TextField
            size="small"
            label="Title"
            value={interviewerTitle}
            onChange={(event) => setInterviewerTitle(event.target.value)}
            fullWidth
          />
          <TextField
            size="small"
            label="LinkedIn URL"
            value={interviewerLinkedin}
            onChange={(event) => setInterviewerLinkedin(event.target.value)}
            fullWidth
          />
          <TextField
            size="small"
            label="Tone"
            value={tone}
            onChange={(event) => setTone(event.target.value)}
            fullWidth
          />
        </Stack>
        <TextField
          label="Conversation notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          minRows={3}
          multiline
          fullWidth
        />
        <Button type="submit" variant="contained" disabled={loading}>
          {loading ? "Drafting..." : "Generate thank-you drafts"}
        </Button>
      </Stack>
      <Snackbar open={Boolean(notice)} autoHideDuration={4500} onClose={() => setNotice("")}>
        <Alert severity={severity} variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}

export function CopyDraftButton({ text, label }: { text: string; label: string }) {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function copyText() {
    try {
      await copyTextToClipboard(text);
      setError("");
      setNotice(`${label} copied.`);
    } catch (caught) {
      setNotice("");
      setError(caught instanceof Error ? caught.message : `Unable to copy ${label}.`);
    }
  }

  return (
    <>
      <Button size="small" variant="outlined" startIcon={<ContentCopyOutlinedIcon />} onClick={copyText}>
        Copy {label}
      </Button>
      <Snackbar open={Boolean(notice)} autoHideDuration={2500} onClose={() => setNotice("")}>
        <Alert severity="success" variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
      <Snackbar open={Boolean(error)} autoHideDuration={3500} onClose={() => setError("")}>
        <Alert severity="error" variant="filled" onClose={() => setError("")}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
