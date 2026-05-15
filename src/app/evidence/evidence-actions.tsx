"use client";

import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import DoNotDisturbOnOutlinedIcon from "@mui/icons-material/DoNotDisturbOnOutlined";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import { useRouter } from "next/navigation";
import { useState } from "react";

type EvidenceActionsProps = {
  evidence: {
    id: string;
    usableInResume: boolean;
    usableInCoverLetter: boolean;
    usableInRecruiterMessage: boolean;
  };
};

export function EvidenceActions({ evidence }: EvidenceActionsProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function patch(payload: Record<string, unknown>, success: string) {
    setSaving(true);
    setNotice("");
    setError("");
    const response = await fetch(`/api/evidence/${evidence.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      setError(body.error ?? "Unable to update evidence.");
      return;
    }

    setNotice(success);
    router.refresh();
  }

  return (
    <>
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }} useFlexGap>
          <Button size="small" variant="outlined" color="success" startIcon={<CheckCircleOutlineOutlinedIcon />} disabled={saving} onClick={() => void patch({ confidence: "VERIFIED", usableInResume: true, usableInCoverLetter: true, usableInRecruiterMessage: true }, "Evidence verified.")}>
            Verify
          </Button>
          <Button size="small" variant="outlined" color="error" startIcon={<DoNotDisturbOnOutlinedIcon />} disabled={saving} onClick={() => void patch({ confidence: "REJECTED", usableInResume: false, usableInCoverLetter: false, usableInRecruiterMessage: false }, "Evidence rejected.")}>
            Reject
          </Button>
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <FormControlLabel
            control={<Switch size="small" checked={evidence.usableInResume} disabled={saving} onChange={(event) => void patch({ usableInResume: event.target.checked }, "Resume usage updated.")} />}
            label="Resume"
          />
          <FormControlLabel
            control={<Switch size="small" checked={evidence.usableInCoverLetter} disabled={saving} onChange={(event) => void patch({ usableInCoverLetter: event.target.checked }, "Cover letter usage updated.")} />}
            label="Cover letter"
          />
          <FormControlLabel
            control={<Switch size="small" checked={evidence.usableInRecruiterMessage} disabled={saving} onChange={(event) => void patch({ usableInRecruiterMessage: event.target.checked }, "Recruiter usage updated.")} />}
            label="Recruiter"
          />
        </Stack>
      </Stack>
      <Snackbar open={Boolean(notice)} autoHideDuration={3000} onClose={() => setNotice("")}>
        <Alert severity="success" variant="filled" onClose={() => setNotice("")}>{notice}</Alert>
      </Snackbar>
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError("")}>
        <Alert severity="error" variant="filled" onClose={() => setError("")}>{error}</Alert>
      </Snackbar>
    </>
  );
}
