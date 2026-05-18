"use client";

import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useState } from "react";

export function RequestAnswerForm({
  requestId,
  question,
  canSaveMemory,
}: {
  requestId: string;
  question: string;
  canSaveMemory: boolean;
}) {
  const { refresh } = useRouter();
  const [answer, setAnswer] = useState("");
  const [saveMemory, setSaveMemory] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitAnswer() {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const trimmed = answer.trim();
      if (!trimmed) throw new Error("Enter an answer before saving.");

      const response = await fetch(`/api/agent-user-requests/${requestId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "ANSWERED", answer: trimmed }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to save answer.");

      if (canSaveMemory && saveMemory) {
        const memoryResponse = await fetch("/api/application-answer-memory", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            questionText: question,
            answer: trimmed,
            sensitivity: "LOW",
            reusePolicy: "ASK_FIRST",
            sourceRequestId: requestId,
          }),
        });
        const memoryPayload = await memoryResponse.json().catch(() => ({}));
        if (!memoryResponse.ok) throw new Error(memoryPayload.error ?? "Answer saved, but reusable memory failed.");
      }

      setNotice(saveMemory ? "Answer saved and reusable memory created." : "Answer saved.");
      refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save answer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={1}>
      {notice ? <Alert severity="success">{notice}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      <TextField
        fullWidth
        multiline
        minRows={2}
        label="Answer for the agent"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
      />
      {canSaveMemory ? (
        <FormControlLabel
          control={<Checkbox checked={saveMemory} onChange={(event) => setSaveMemory(event.target.checked)} />}
          label="Save as reusable low-risk answer, ask before reuse"
        />
      ) : null}
      <Button variant="contained" disabled={saving || !answer.trim()} onClick={submitAnswer}>
        {saving ? "Saving..." : "Save answer"}
      </Button>
    </Stack>
  );
}
