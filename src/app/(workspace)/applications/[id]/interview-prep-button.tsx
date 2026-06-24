"use client";

import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function InterviewPrepButton({ applicationId }: { applicationId: string }) {
  const { refresh } = useRouter();
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error">("success");

  async function generatePrep() {
    setRunning(true);
    try {
      const response = await fetch(`/api/applications/${applicationId}/interview-prep`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to generate interview prep.");
      setSeverity("success");
      setNotice(payload.message ?? "Interview prep generated.");
      refresh();
    } catch (error) {
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Unable to generate interview prep.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Button variant="outlined" startIcon={<PsychologyOutlinedIcon />} disabled={running} onClick={() => void generatePrep()}>
        {running ? "Preparing..." : "Generate interview prep"}
      </Button>
      <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice("")}>
        <Alert severity={severity} variant="filled" onClose={() => setNotice("")}>{notice}</Alert>
      </Snackbar>
    </>
  );
}
