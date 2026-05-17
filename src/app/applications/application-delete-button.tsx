"use client";

import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ApplicationDeleteButton({ applicationId, label }: { applicationId: string; label: string }) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(false);

  async function remove() {
    if (!window.confirm(`Reject ${label} and remove it from the application board? The agency will remember this as a not-good-fit signal.`)) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/applications/${applicationId}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to delete application.");
      setSeverity("success");
      setNotice(payload.message ?? "Application removed and job marked rejected.");
      router.refresh();
    } catch (error) {
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Unable to delete application.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlineOutlinedIcon />} disabled={loading} onClick={remove}>
        {loading ? "Rejecting..." : "Reject"}
      </Button>
      <Snackbar open={Boolean(notice)} autoHideDuration={4500} onClose={() => setNotice("")}>
        <Alert severity={severity} variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}
