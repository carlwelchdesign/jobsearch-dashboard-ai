"use client";

import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function EvaluateJobsControl() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error" | "info">("info");

  async function evaluateJobs() {
    setRunning(true);
    try {
      const response = await fetch("/api/jobs/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 25 }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to evaluate jobs.");
      setSeverity("success");
      setNotice(payload.message ?? "Evaluation complete.");
      router.refresh();
    } catch (error) {
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Unable to evaluate jobs.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Button variant="outlined" startIcon={<PsychologyOutlinedIcon />} disabled={running} onClick={() => void evaluateJobs()}>
        {running ? "Scoring..." : "Score queue"}
      </Button>
      <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice("")}>
        <Alert severity={severity} variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}
