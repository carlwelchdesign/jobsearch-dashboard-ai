"use client";

import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";

type CompanySourceSettingsProps = {
  enabled: boolean;
  priorityMax: number;
  maxCompanies: number;
  maxJobsPerCompany: number;
  maxFetch: number;
};

export function CompanySourceSettings(props: CompanySourceSettingsProps) {
  const { refresh } = useRouter();
  const [settings, setSettings] = useState(props);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function save(reset = false) {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/settings/company-source", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reset ? { reset: true, enabled: true } : settings),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to save company source settings.");
      setSettings({
        enabled: payload.enabled,
        priorityMax: payload.config.priorityMax,
        maxCompanies: payload.config.maxCompanies,
        maxJobsPerCompany: payload.config.maxJobsPerCompany,
        maxFetch: payload.config.maxFetch,
      });
      setNotice(payload.message ?? "Saved.");
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save company source settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      {notice ? <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert> : null}
      {error ? <Alert severity="error" onClose={() => setError("")}>{error}</Alert> : null}
      <FormControlLabel
        control={<Switch checked={settings.enabled} onChange={(event) => setSettings((previous) => ({ ...previous, enabled: event.target.checked }))} />}
        label="Use company career-page source during job searches"
      />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(4, 1fr)" }, gap: 2 }}>
        <TextField
          select
          label="Priority ceiling"
          value={settings.priorityMax}
          onChange={(event) => setSettings((previous) => ({ ...previous, priorityMax: Number(event.target.value) }))}
        >
          <MenuItem value={1}>1 only</MenuItem>
          <MenuItem value={2}>1 and 2</MenuItem>
          <MenuItem value={3}>All priorities</MenuItem>
        </TextField>
        <TextField
          type="number"
          label="Companies per run"
          value={settings.maxCompanies}
          onChange={(event) => setSettings((previous) => ({ ...previous, maxCompanies: Number(event.target.value) }))}
          slotProps={{ htmlInput: { min: 1, max: 500 } }}
        />
        <TextField
          type="number"
          label="Jobs per company"
          value={settings.maxJobsPerCompany}
          onChange={(event) => setSettings((previous) => ({ ...previous, maxJobsPerCompany: Number(event.target.value) }))}
          slotProps={{ htmlInput: { min: 1, max: 50 } }}
        />
        <TextField
          type="number"
          label="Max fetched roles"
          value={settings.maxFetch}
          onChange={(event) => setSettings((previous) => ({ ...previous, maxFetch: Number(event.target.value) }))}
          slotProps={{ htmlInput: { min: 10, max: 3000 } }}
        />
      </Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
        <Typography variant="body2" color="text.secondary">
          This controls how aggressively searches probe direct ATS feeds. Higher limits are broader but slower.
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button disabled={saving} variant="outlined" startIcon={<RestartAltOutlinedIcon />} onClick={() => void save(true)}>
            Reset list
          </Button>
          <Button disabled={saving} variant="contained" startIcon={<SaveOutlinedIcon />} onClick={() => void save(false)}>
            Save
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
}
