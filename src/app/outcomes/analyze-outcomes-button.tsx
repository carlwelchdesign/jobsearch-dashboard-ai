"use client";

import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AnalyzeOutcomesButton() {
  const { refresh } = useRouter();
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error">("success");

  async function analyze() {
    setRunning(true);
    try {
      const response = await fetch("/api/outcomes/analyze", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to analyze outcomes.");
      setSeverity("success");
      setNotice(`Analyzed ${payload.sampleSize ?? 0} applications.`);
      refresh();
    } catch (error) {
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Unable to analyze outcomes.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Button variant="contained" startIcon={<InsightsOutlinedIcon />} disabled={running} onClick={() => void analyze()}>
        {running ? "Analyzing..." : "Analyze outcomes"}
      </Button>
      <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice("")}>
        <Alert severity={severity} variant="filled" onClose={() => setNotice("")}>{notice}</Alert>
      </Snackbar>
    </>
  );
}
