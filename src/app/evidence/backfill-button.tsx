"use client";

import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function BackfillEvidenceButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function backfill() {
    setRunning(true);
    setNotice("");
    setError("");
    const response = await fetch("/api/evidence/backfill", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setRunning(false);
    if (!response.ok) {
      setError(body.error ?? "Unable to backfill evidence.");
      return;
    }
    setNotice(body.message ?? "Evidence backfilled.");
    router.refresh();
  }

  return (
    <>
      <Button variant="contained" startIcon={<AutoFixHighOutlinedIcon />} disabled={running} onClick={backfill}>
        {running ? "Backfilling..." : "Backfill evidence"}
      </Button>
      <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice("")}>
        <Alert severity="success" variant="filled" onClose={() => setNotice("")}>{notice}</Alert>
      </Snackbar>
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError("")}>
        <Alert severity="error" variant="filled" onClose={() => setError("")}>{error}</Alert>
      </Snackbar>
    </>
  );
}
