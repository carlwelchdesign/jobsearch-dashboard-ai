"use client";

import AddCircleOutlineOutlinedIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";

type SourceType = "USER_INPUT" | "INTERVIEW_NOTE" | "APPLICATION_HISTORY";

export function AddEvidenceNoteForm() {
  const { refresh } = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("USER_INPUT");
  const [embed, setEmbed] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/evidence/ingest-note", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, content, sourceType, embed }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to add evidence note.");
      setNotice(payload.message ?? "Evidence note added.");
      setTitle("");
      setContent("");
      refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to add evidence note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card id="add-evidence-note">
        <CardContent>
          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="h3">Add career evidence</Typography>
              <Typography variant="body2" color="text.secondary">
                Add a project note, interview note, achievement, preference, or writing-style instruction. Candidate Intelligence will classify and tag it.
              </Typography>
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField fullWidth label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
              <TextField select label="Source" value={sourceType} onChange={(event) => setSourceType(event.target.value as SourceType)} sx={{ minWidth: 220 }}>
                <MenuItem value="USER_INPUT">User input</MenuItem>
                <MenuItem value="INTERVIEW_NOTE">Interview note</MenuItem>
                <MenuItem value="APPLICATION_HISTORY">Application history</MenuItem>
              </TextField>
            </Stack>
            <TextField
              multiline
              minRows={4}
              label="Evidence note"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Example: Built WebAuthn Core as a reusable server-side orchestration package with adapter interfaces for registration and authentication flows."
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
              <FormControlLabel
                control={<Checkbox checked={embed} onChange={(event) => setEmbed(event.target.checked)} />}
                label="Create embedding after save"
              />
              <Button
                variant="contained"
                startIcon={<AddCircleOutlineOutlinedIcon />}
                disabled={saving || title.trim().length < 2 || content.trim().length < 10}
                onClick={() => void submit()}
              >
                {saving ? "Adding..." : "Add evidence"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice("")}>
        <Alert severity="success" variant="filled" onClose={() => setNotice("")}>{notice}</Alert>
      </Snackbar>
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError("")}>
        <Alert severity="error" variant="filled" onClose={() => setError("")}>{error}</Alert>
      </Snackbar>
    </>
  );
}
