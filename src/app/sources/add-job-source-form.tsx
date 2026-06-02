"use client";

import AddCircleOutlineOutlinedIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState } from "react";

const initialForm = {
  name: "",
  boardUrl: "",
  organizationId: "",
  maxFetch: 160,
};

export function AddJobSourceForm() {
  const { refresh } = useRouter();
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function addSource() {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/settings/job-source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to add job source.");
      setNotice(payload.message ?? "Job source added.");
      setForm(initialForm);
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add job source.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      {notice ? <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert> : null}
      {error ? <Alert severity="error" onClose={() => setError("")}>{error}</Alert> : null}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.5fr 2fr 1fr" }, gap: 1.5 }}>
        <TextField
          label="Source name"
          value={form.name}
          onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
          placeholder="Defense Tech Jobs"
        />
        <TextField
          label="Job board URL"
          value={form.boardUrl}
          onChange={(event) => setForm((previous) => ({ ...previous, boardUrl: event.target.value }))}
          placeholder="https://jobs.frontdoordefense.com/"
        />
        <TextField
          type="number"
          label="Max fetched"
          value={form.maxFetch}
          onChange={(event) => setForm((previous) => ({ ...previous, maxFetch: Number(event.target.value) }))}
          slotProps={{ htmlInput: { min: 1, max: 600 } }}
        />
      </Box>
      <TextField
        label="Organization ID"
        value={form.organizationId}
        onChange={(event) => setForm((previous) => ({ ...previous, organizationId: event.target.value }))}
        placeholder="Detected automatically for JobFront boards"
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
        <Alert severity="info" sx={{ flex: 1 }}>
          JobFront boards are fetched from their public job-card endpoint. This does not log in or bypass paid/member gates.
        </Alert>
        <Button disabled={saving || !form.boardUrl.trim()} variant="contained" startIcon={<AddCircleOutlineOutlinedIcon />} onClick={() => void addSource()}>
          Add source
        </Button>
      </Stack>
    </Stack>
  );
}
