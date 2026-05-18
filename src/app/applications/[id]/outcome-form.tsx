"use client";

import AddTaskOutlinedIcon from "@mui/icons-material/AddTaskOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState } from "react";

const outcomes = [
  ["APPLIED", "Applied"],
  ["RECRUITER_SCREEN", "Recruiter screen"],
  ["TECH_SCREEN", "Tech screen"],
  ["ONSITE", "Onsite"],
  ["FINAL", "Final"],
  ["OFFER", "Offer"],
  ["REJECTED", "Rejected"],
  ["GHOSTED", "Ghosted"],
  ["CLOSED", "Closed"],
];

export function OutcomeForm({ applicationId }: { applicationId: string }) {
  const { refresh } = useRouter();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/applications/${applicationId}/outcomes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outcome: formData.get("outcome"),
          notes: formData.get("notes"),
          occurredAt: new Date().toISOString(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to record outcome.");
      setNotice(payload.message ?? "Outcome recorded.");
      event.currentTarget.reset();
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to record outcome.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack component="form" spacing={1.5} onSubmit={submit}>
      {notice ? <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert> : null}
      {error ? <Alert severity="error" onClose={() => setError("")}>{error}</Alert> : null}
      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
        <TextField select required name="outcome" label="Outcome" defaultValue="RECRUITER_SCREEN" sx={{ minWidth: 220 }}>
          {outcomes.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <TextField name="notes" label="Notes" placeholder="Who replied, what happened, next step" fullWidth />
        <Button type="submit" variant="contained" disabled={saving} startIcon={<AddTaskOutlinedIcon />}>
          {saving ? "Saving..." : "Record"}
        </Button>
      </Stack>
    </Stack>
  );
}
