"use client";

import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RejectionReasonDialog, type RejectionReasonCode } from "@/components/job-reject-button";

export function ApplicationDeleteButton({
  applicationId,
  label,
}: {
  applicationId: string;
  label: string;
}) {
  const { refresh } = useRouter();
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);

  async function remove(reasons: RejectionReasonCode[] = [], note = "") {
    setLoading(true);
    try {
      const response = await fetch(`/api/applications/${applicationId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reasons,
          note,
          source: "applications_rejection_reason_prompt",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to delete application.");
      setSeverity("success");
      setNotice(
        reasons.length || note.trim()
          ? "Application removed, job rejected, and feedback saved for agent learning."
          : payload.message ?? "Application removed and job marked rejected.",
      );
      setPromptOpen(false);
      refresh();
    } catch (error) {
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Unable to delete application.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlineOutlinedIcon />} disabled={loading} onClick={() => setPromptOpen(true)}>
        {loading ? "Rejecting..." : "Reject"}
      </Button>
      <RejectionReasonDialog
        open={promptOpen}
        title={`Why reject ${label}?`}
        onClose={() => setPromptOpen(false)}
        onSkip={() => remove([], "")}
        onSubmit={remove}
        submitLabel="Reject application"
      />
      <Snackbar open={Boolean(notice)} autoHideDuration={4500} onClose={() => setNotice("")}>
        <Alert severity={severity} variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}
