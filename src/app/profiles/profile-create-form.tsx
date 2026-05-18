"use client";

import AddIcon from "@mui/icons-material/Add";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Collapse from "@mui/material/Collapse";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProfileCreateForm() {
  const { refresh } = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const formData = new FormData(event.currentTarget);
    const payload = {
      name: formData.get("name"),
      remotePreference: formData.get("remotePreference"),
      salaryCurrency: formData.get("salaryCurrency"),
      salaryMin: Number(formData.get("salaryMin") || 0) || null,
      minimumMatchScore: Number(formData.get("minimumMatchScore") || 75),
      titles: splitList(String(formData.get("titles") ?? "")),
      keywordsPreferred: splitList(String(formData.get("keywordsPreferred") ?? "")),
    };
    const response = await fetch("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(body.error ?? "Unable to create profile.");
      return;
    }

    setNotice("Search profile created.");
    setOpen(false);
    event.currentTarget.reset();
    refresh();
  }

  return (
    <Stack spacing={2}>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen((value) => !value)}>
        {open ? "Close form" : "New profile"}
      </Button>
      {notice ? <Alert severity="success">{notice}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Collapse in={open}>
        <Card>
          <CardContent>
            <Stack component="form" spacing={2} onSubmit={submit}>
              <TextField required name="name" label="Profile name" />
              <TextField required name="titles" label="Target titles" helperText="Comma-separated" />
              <TextField name="keywordsPreferred" label="Preferred keywords" helperText="Comma-separated" />
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField select name="remotePreference" label="Remote preference" defaultValue="any" fullWidth>
                  <MenuItem value="remote_us_only">Remote US only</MenuItem>
                  <MenuItem value="remote_global">Remote global</MenuItem>
                  <MenuItem value="remote_europe">Remote Europe</MenuItem>
                  <MenuItem value="hybrid">Hybrid</MenuItem>
                  <MenuItem value="onsite_relocation">Onsite relocation</MenuItem>
                  <MenuItem value="any">Any</MenuItem>
                </TextField>
                <TextField select name="salaryCurrency" label="Currency" defaultValue="USD" fullWidth>
                  <MenuItem value="USD">USD</MenuItem>
                  <MenuItem value="EUR">EUR</MenuItem>
                  <MenuItem value="GBP">GBP</MenuItem>
                  <MenuItem value="SEK">SEK</MenuItem>
                </TextField>
              </Stack>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField name="salaryMin" label="Minimum salary" type="number" fullWidth />
                <TextField name="minimumMatchScore" label="Minimum match score" type="number" defaultValue={75} fullWidth />
              </Stack>
              <Button type="submit" variant="contained" disabled={saving} sx={{ alignSelf: "flex-start" }}>
                {saving ? "Saving..." : "Create profile"}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Collapse>
    </Stack>
  );
}

function splitList(value: string) {
  return value.split(",").flatMap((item) => {
    const next = item.trim();
    return next ? [next] : [];
  });
}
