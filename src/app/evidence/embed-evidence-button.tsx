"use client";

import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function EmbedEvidenceButton() {
  const { refresh } = useRouter();
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error" | "info">("info");

  async function embedEvidence() {
    setRunning(true);
    try {
      const response = await fetch("/api/evidence/embeddings/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 75 }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to embed evidence.");
      setSeverity(payload.embedded ? "success" : "info");
      setNotice(payload.message ?? "Evidence embedding complete.");
      refresh();
    } catch (error) {
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Unable to embed evidence.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Button variant="outlined" startIcon={<AutoFixHighOutlinedIcon />} disabled={running} onClick={() => void embedEvidence()}>
        {running ? "Embedding..." : "Embed evidence"}
      </Button>
      <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice("")}>
        <Alert severity={severity} variant="filled" onClose={() => setNotice("")}>{notice}</Alert>
      </Snackbar>
    </>
  );
}
