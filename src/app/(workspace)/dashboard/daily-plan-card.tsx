"use client";

import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunDailyPlanButton() {
  const { refresh } = useRouter();
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error">("success");

  async function runPlan() {
    setRunning(true);
    try {
      const response = await fetch("/api/agents/daily-command-center", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to generate daily plan.");
      setSeverity("success");
      setNotice(payload.summary ?? "Daily plan generated.");
      refresh();
    } catch (error) {
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Unable to generate daily plan.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Button variant="contained" startIcon={<AutoAwesomeOutlinedIcon />} disabled={running} onClick={() => void runPlan()}>
        {running ? "Planning..." : "Generate daily plan"}
      </Button>
      <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice("")}>
        <Alert severity={severity} variant="filled" onClose={() => setNotice("")}>{notice}</Alert>
      </Snackbar>
    </>
  );
}
