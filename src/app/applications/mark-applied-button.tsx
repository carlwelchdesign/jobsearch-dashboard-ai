"use client";

import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function MarkAppliedButton({ applicationId, size = "small" }: { applicationId: string; size?: "small" | "medium" }) {
  const { refresh } = useRouter();
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(false);

  async function markApplied() {
    setLoading(true);
    try {
      const response = await fetch(`/api/applications/${applicationId}/mark-applied`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to mark application applied.");
      setSeverity("success");
      setNotice(payload.message ?? "Application marked applied.");
      refresh();
    } catch (error) {
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Unable to mark application applied.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        size={size}
        variant="contained"
        color="primary"
        startIcon={<CheckCircleOutlineOutlinedIcon />}
        disabled={loading}
        onClick={markApplied}
      >
        {loading ? "Updating..." : "Mark as applied"}
      </Button>
      <Snackbar open={Boolean(notice)} autoHideDuration={4500} onClose={() => setNotice("")}>
        <Alert severity={severity} variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}
