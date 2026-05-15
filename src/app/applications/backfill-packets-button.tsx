"use client";

import InventoryOutlinedIcon from "@mui/icons-material/InventoryOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function BackfillPacketsButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function backfill() {
    setRunning(true);
    setNotice("");
    setError("");
    const response = await fetch("/api/applications/packets/backfill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 250 }),
    });
    const body = await response.json().catch(() => ({}));
    setRunning(false);

    if (!response.ok) {
      setError(body.error ?? "Unable to sync application packets.");
      return;
    }

    setNotice(body.message ?? "Application packets synced.");
    router.refresh();
  }

  return (
    <>
      <Button variant="outlined" startIcon={<InventoryOutlinedIcon />} disabled={running} onClick={() => void backfill()}>
        {running ? "Syncing..." : "Sync packets"}
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
