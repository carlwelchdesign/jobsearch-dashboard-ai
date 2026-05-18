"use client";

import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PowerSettingsNewOutlinedIcon from "@mui/icons-material/PowerSettingsNewOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ProfileActionData = {
  id: string;
  name: string;
  enabled: boolean;
  remotePreference: string;
  salaryCurrency: string | null;
  salaryMin: number | null;
  minimumMatchScore: number;
  maxResultsPerRun: number;
  titles: string[];
  countries: string[];
  keywordsPreferred: string[];
  keywordsExcluded: string[];
  excludedCompanies: string[];
};

type EditableProfile = Omit<ProfileActionData, "enabled" | "titles" | "countries" | "keywordsPreferred" | "keywordsExcluded" | "excludedCompanies"> & {
  titles: string;
  countries: string;
  keywordsPreferred: string;
  keywordsExcluded: string;
  excludedCompanies: string;
};

export function ProfileActions({ profile }: { profile: ProfileActionData }) {
  const { refresh } = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<EditableProfile>(() => toDraft(profile));

  useEffect(() => {
    if (open) {
      setDraft(toDraft(profile));
      setError("");
    }
  }, [open, profile]);

  async function patch(payload: Record<string, unknown>, success: string) {
    setSaving(true);
    setError("");
    const response = await fetch(`/api/profiles/${profile.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(body.error ?? "Unable to update profile.");
      return false;
    }
    setNotice(success);
    refresh();
    return true;
  }

  async function save() {
    const ok = await patch({
      name: draft.name.trim(),
      remotePreference: draft.remotePreference,
      salaryCurrency: draft.salaryCurrency ?? "USD",
      salaryMin: draft.salaryMin,
      minimumMatchScore: clampNumber(draft.minimumMatchScore, 0, 100, 75),
      maxResultsPerRun: clampNumber(draft.maxResultsPerRun, 1, 250, 50),
      titles: splitList(draft.titles),
      countries: splitList(draft.countries),
      keywordsPreferred: splitList(draft.keywordsPreferred),
      keywordsExcluded: splitList(draft.keywordsExcluded),
      excludedCompanies: splitList(draft.excludedCompanies),
    }, "Profile updated.");
    if (ok) setOpen(false);
  }

  async function remove() {
    if (!window.confirm(`Delete "${profile.name}"? This removes profile-specific matches for this campaign.`)) return;
    setSaving(true);
    setError("");
    const response = await fetch(`/api/profiles/${profile.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(body.error ?? "Unable to delete profile.");
      return;
    }
    setNotice("Profile deleted.");
    refresh();
  }

  return (
    <>
      <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setOpen(true)}>
          Edit
        </Button>
        <Button
          size="small"
          variant="outlined"
          color={profile.enabled ? "warning" : "success"}
          startIcon={<PowerSettingsNewOutlinedIcon />}
          disabled={saving}
          onClick={() => void patch({ enabled: !profile.enabled }, profile.enabled ? "Profile disabled." : "Profile enabled.")}
        >
          {profile.enabled ? "Disable" : "Enable"}
        </Button>
        <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlineOutlinedIcon />} disabled={saving} onClick={remove}>
          Delete
        </Button>
      </Stack>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Edit search profile</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField label="Name" value={draft.name} onChange={(event) => setDraft((previous) => ({ ...previous, name: event.target.value }))} />
            <TextField label="Target titles" helperText="Comma-separated" value={draft.titles} onChange={(event) => setDraft((previous) => ({ ...previous, titles: event.target.value }))} />
            <TextField label="Countries" helperText="Comma-separated" value={draft.countries} onChange={(event) => setDraft((previous) => ({ ...previous, countries: event.target.value }))} />
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField select fullWidth label="Remote preference" value={draft.remotePreference} onChange={(event) => setDraft((previous) => ({ ...previous, remotePreference: event.target.value }))}>
                <MenuItem value="remote_us_only">Remote US only</MenuItem>
                <MenuItem value="remote_global">Remote global</MenuItem>
                <MenuItem value="remote_europe">Remote Europe</MenuItem>
                <MenuItem value="hybrid">Hybrid</MenuItem>
                <MenuItem value="onsite_relocation">Onsite relocation</MenuItem>
                <MenuItem value="any">Any</MenuItem>
              </TextField>
              <TextField select fullWidth label="Currency" value={draft.salaryCurrency ?? "USD"} onChange={(event) => setDraft((previous) => ({ ...previous, salaryCurrency: event.target.value }))}>
                <MenuItem value="USD">USD</MenuItem>
                <MenuItem value="EUR">EUR</MenuItem>
                <MenuItem value="GBP">GBP</MenuItem>
                <MenuItem value="SEK">SEK</MenuItem>
              </TextField>
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField fullWidth label="Minimum salary" type="number" value={draft.salaryMin ?? ""} onChange={(event) => setDraft((previous) => ({ ...previous, salaryMin: event.target.value ? Number(event.target.value) : null }))} />
              <TextField fullWidth label="Minimum match score" type="number" value={draft.minimumMatchScore} onChange={(event) => setDraft((previous) => ({ ...previous, minimumMatchScore: numberOrFallback(event.target.value, draft.minimumMatchScore) }))} />
              <TextField fullWidth label="Max results per run" type="number" value={draft.maxResultsPerRun} onChange={(event) => setDraft((previous) => ({ ...previous, maxResultsPerRun: numberOrFallback(event.target.value, draft.maxResultsPerRun) }))} />
            </Stack>
            <TextField label="Preferred keywords" helperText="Comma-separated" value={draft.keywordsPreferred} onChange={(event) => setDraft((previous) => ({ ...previous, keywordsPreferred: event.target.value }))} />
            <TextField label="Excluded keywords" helperText="Comma-separated" value={draft.keywordsExcluded} onChange={(event) => setDraft((previous) => ({ ...previous, keywordsExcluded: event.target.value }))} />
            <TextField label="Excluded companies" helperText="Comma-separated" value={draft.excludedCompanies} onChange={(event) => setDraft((previous) => ({ ...previous, excludedCompanies: event.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save"}</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice("")}>
        <Alert severity="success" variant="filled" onClose={() => setNotice("")}>{notice}</Alert>
      </Snackbar>
      <Snackbar open={Boolean(error) && !open} autoHideDuration={5000} onClose={() => setError("")}>
        <Alert severity="error" variant="filled" onClose={() => setError("")}>{error}</Alert>
      </Snackbar>
    </>
  );
}

function toDraft(profile: ProfileActionData): EditableProfile {
  return {
    ...profile,
    titles: profile.titles.join(", "),
    countries: profile.countries.join(", "),
    keywordsPreferred: profile.keywordsPreferred.join(", "),
    keywordsExcluded: profile.keywordsExcluded.join(", "),
    excludedCompanies: profile.excludedCompanies.join(", "),
  };
}

function splitList(value: string) {
  return value.split(",").flatMap((item) => {
    const next = item.trim();
    return next ? [next] : [];
  });
}

function numberOrFallback(value: string, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
