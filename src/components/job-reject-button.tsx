"use client";

import DoNotDisturbOnOutlinedIcon from "@mui/icons-material/DoNotDisturbOnOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type RejectionReasonCode =
  | "wrong_seniority"
  | "wrong_tech_stack"
  | "compensation_location"
  | "company_industry"
  | "weak_fit"
  | "duplicate_stale"
  | "low_quality_posting"
  | "not_interested";

const rejectionReasons: Array<{ code: RejectionReasonCode; label: string }> = [
  { code: "wrong_seniority", label: "Wrong seniority" },
  { code: "wrong_tech_stack", label: "Wrong tech stack" },
  { code: "compensation_location", label: "Comp/location" },
  { code: "company_industry", label: "Company/industry" },
  { code: "weak_fit", label: "Weak fit" },
  { code: "duplicate_stale", label: "Duplicate/stale" },
  { code: "low_quality_posting", label: "Low quality" },
  { code: "not_interested", label: "Not interested" },
];

export function JobRejectButton({
  jobId,
  matchId,
  label,
  size = "small",
  variant = "text",
  color = "error",
  source = "job_reject_button",
}: {
  jobId: string;
  matchId: string;
  label: string;
  size?: "small" | "medium" | "large";
  variant?: "text" | "outlined" | "contained";
  color?: "primary" | "secondary" | "success" | "error" | "warning" | "info";
  source?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error" | "info">("info");

  async function reject(reasons: RejectionReasonCode[] = [], note = "") {
    setLoading(true);
    try {
      const response = await fetch(`/api/jobs/${jobId}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId, source, reasons, note }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to reject job.");
      setSeverity("success");
      setNotice(reasons.length || note.trim() ? "Job rejected and feedback saved for agent learning." : "Job rejected.");
      setPromptOpen(false);
      router.refresh();
    } catch (error) {
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Unable to reject job.");
    } finally {
      setLoading(false);
    }
  }

  async function submitFeedback(reasons: RejectionReasonCode[], note: string) {
    await reject(reasons, note);
  }

  return (
    <>
      <Button size={size} variant={variant} color={color} startIcon={<DoNotDisturbOnOutlinedIcon />} disabled={loading} onClick={() => setPromptOpen(true)}>
        {loading ? "Rejecting..." : "Reject"}
      </Button>
      <RejectionReasonDialog
        open={promptOpen}
        title={`Why reject ${label}?`}
        onClose={() => setPromptOpen(false)}
        onSkip={() => reject([], "")}
        onSubmit={submitFeedback}
        submitLabel="Reject job"
      />
      <Snackbar open={Boolean(notice)} autoHideDuration={4500} onClose={() => setNotice("")}>
        <Alert severity={severity} variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}

export function RejectionReasonDialog({
  open,
  title,
  onClose,
  onSkip,
  onSubmit,
  submitLabel = "Save feedback",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSkip?: () => Promise<void> | void;
  onSubmit: (reasons: RejectionReasonCode[], note: string) => Promise<void>;
  submitLabel?: string;
}) {
  const [selected, setSelected] = useState<RejectionReasonCode[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggle(code: RejectionReasonCode) {
    setSelected((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await onSubmit(selected, note);
      setSelected([]);
      setNote("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save rejection feedback.");
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setSelected([]);
    setNote("");
    setError("");
    onClose();
  }

  async function skip() {
    if (!onSkip) {
      close();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSkip();
      setSelected([]);
      setNote("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to reject job.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Optional, but useful for teaching scoring and agency approvals.
          </Typography>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
            {rejectionReasons.map((reason) => (
              <Chip
                key={reason.code}
                label={reason.label}
                color={selected.includes(reason.code) ? "primary" : "default"}
                variant={selected.includes(reason.code) ? "filled" : "outlined"}
                onClick={() => toggle(reason.code)}
              />
            ))}
          </Stack>
          <TextField
            label="Optional note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => void skip()} disabled={saving}>Skip</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={saving}>
          {saving ? "Saving..." : submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
