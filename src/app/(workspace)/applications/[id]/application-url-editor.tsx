"use client";

import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ApplicationUrlEditorProps = {
  applicationId: string;
  initialUrl: string | null;
};

export function ApplicationUrlEditor({ applicationId, initialUrl }: ApplicationUrlEditorProps) {
  const { refresh } = useRouter();
  const [applicationUrl, setApplicationUrl] = useState(initialUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationUrl }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to update application URL.");
      setApplicationUrl(payload.applicationUrl ?? "");
      setNotice(payload.message ?? "Application URL updated.");
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update application URL.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack component="form" spacing={1.5} onSubmit={submit}>
      {notice ? <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert> : null}
      {error ? <Alert severity="error" onClose={() => setError("")}>{error}</Alert> : null}
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ alignItems: { md: "center" } }}>
        <TextField
          fullWidth
          label="Application URL"
          value={applicationUrl}
          onChange={(event) => setApplicationUrl(event.target.value)}
          placeholder="https://jobs.example.com/apply"
          type="url"
        />
        <Button type="submit" variant="contained" disabled={saving} startIcon={<SaveOutlinedIcon />} sx={{ minWidth: 120 }}>
          {saving ? "Saving..." : "Save"}
        </Button>
        {applicationUrl ? (
          <Button href={applicationUrl} target="_blank" rel="noreferrer" variant="outlined" startIcon={<OpenInNewIcon />} sx={{ minWidth: 120 }}>
            Open
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}
