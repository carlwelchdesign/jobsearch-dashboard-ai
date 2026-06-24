"use client";

import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SeedResumeProfilesButton() {
  const { refresh } = useRouter();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  async function seed() {
    setLoading(true);
    const response = await fetch("/api/resume-profiles/seed", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setNotice(payload.message ?? "Default resume variants are ready.");
    setLoading(false);
    refresh();
  }

  return (
    <>
      <Button variant="contained" startIcon={<RestartAltOutlinedIcon />} disabled={loading} onClick={() => void seed()}>
        {loading ? "Seeding..." : "Seed defaults"}
      </Button>
      <Snackbar open={Boolean(notice)} autoHideDuration={4500} onClose={() => setNotice("")}>
        <Alert severity="success" variant="filled" onClose={() => setNotice("")}>{notice}</Alert>
      </Snackbar>
    </>
  );
}

export function ResumeProfileStatusButton({ id, status }: { id: string; status: "ACTIVE" | "ARCHIVED" }) {
  const { refresh } = useRouter();
  const [loading, setLoading] = useState(false);
  const nextStatus = status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";

  async function updateStatus() {
    setLoading(true);
    await fetch(`/api/resume-profiles/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setLoading(false);
    refresh();
  }

  return (
    <Stack direction="row" spacing={1}>
      <Button
        size="small"
        variant="outlined"
        startIcon={status === "ACTIVE" ? <ArchiveOutlinedIcon /> : <UnarchiveOutlinedIcon />}
        disabled={loading}
        onClick={() => void updateStatus()}
      >
        {status === "ACTIVE" ? "Archive" : "Reactivate"}
      </Button>
    </Stack>
  );
}
