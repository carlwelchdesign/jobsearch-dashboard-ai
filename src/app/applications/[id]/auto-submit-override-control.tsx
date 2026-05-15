"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AutoSubmitOverrideControlProps = {
  applicationId: string;
  autoSubmitOverride: boolean | null;
};

export function AutoSubmitOverrideControl({ applicationId, autoSubmitOverride }: AutoSubmitOverrideControlProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function save(value: boolean | null) {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/applications/${applicationId}/auto-submit-override`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ autoSubmitOverride: value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to update auto-submit override.");
      setNotice(payload.message ?? "Auto-submit override updated.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update auto-submit override.");
    } finally {
      setSaving(false);
    }
  }

  const label = autoSubmitOverride === true ? "Enabled for this application" : autoSubmitOverride === false ? "Disabled for this application" : "Inherits global setting";

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
        <Stack spacing={0.25}>
          <Typography sx={{ fontWeight: 850 }}>Auto-submit override</Typography>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
        </Stack>
        <ButtonGroup variant="outlined" size="small" disabled={saving}>
          <Button variant={autoSubmitOverride === null ? "contained" : "outlined"} onClick={() => void save(null)}>Inherit</Button>
          <Button color="success" variant={autoSubmitOverride === true ? "contained" : "outlined"} onClick={() => void save(true)}>Allow</Button>
          <Button color="error" variant={autoSubmitOverride === false ? "contained" : "outlined"} onClick={() => void save(false)}>Block</Button>
        </ButtonGroup>
      </Stack>
      {notice ? <Alert severity="success">{notice}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
    </Stack>
  );
}
