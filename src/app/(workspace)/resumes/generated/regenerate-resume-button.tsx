"use client";

import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Snackbar from "@mui/material/Snackbar";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type RegenerateResumeButtonProps = {
  jobId: string;
  resumeId: string;
  latestResumeCreatedAtMs: number;
};

type PendingRegeneration = {
  startedAt: number;
};

const pendingPrefix = "resume-regeneration:";
const staleAfterMs = 15 * 60 * 1000;

export function RegenerateResumeButton({ jobId, resumeId, latestResumeCreatedAtMs }: RegenerateResumeButtonProps) {
  const { refresh } = useRouter();
  const mounted = useRef(true);
  const storageKey = `${pendingPrefix}${jobId}`;
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error" | "info">("info");

  useEffect(() => {
    mounted.current = true;
    const stored = readPending(storageKey);
    const isStillCurrent =
      stored &&
      Date.now() - stored.startedAt < staleAfterMs &&
      latestResumeCreatedAtMs <= stored.startedAt;
    setPending(Boolean(isStillCurrent));
    if (stored && !isStillCurrent) localStorage.removeItem(storageKey);

    return () => {
      mounted.current = false;
    };
  }, [latestResumeCreatedAtMs, storageKey]);

  async function regenerate() {
    const startedAt = Date.now();
    localStorage.setItem(storageKey, JSON.stringify({ startedAt }));
    setPending(true);
    setSeverity("info");
    setNotice("Regenerating this resume. You can leave this page.");

    try {
      const response = await fetch(`/api/jobs/${jobId}/generate-resume`, {
        method: "POST",
        headers: { "x-run-in-background": "1" },
        keepalive: true,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Resume regeneration failed.");
      localStorage.removeItem(storageKey);
      if (!mounted.current) return;
      setPending(false);
      setSeverity("success");
      setNotice("Resume regenerated.");
      refresh();
    } catch (error) {
      localStorage.removeItem(storageKey);
      if (!mounted.current) return;
      setPending(false);
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Resume regeneration failed.");
    }
  }

  return (
    <>
      <Button
        size="small"
        variant={pending ? "contained" : "text"}
        color={pending ? "warning" : "primary"}
        startIcon={pending ? <CircularProgress color="inherit" size={16} thickness={5} /> : <AutorenewOutlinedIcon />}
        disabled={pending}
        aria-busy={pending}
        data-resume-id={resumeId}
        data-regenerating={pending ? "true" : "false"}
        onClick={regenerate}
        sx={{
          ...(pending
            ? {
                "&.Mui-disabled": {
                  bgcolor: "warning.main",
                  color: "warning.contrastText",
                  opacity: 1,
                },
              }
            : {}),
        }}
      >
        {pending ? "Regenerating this resume..." : "Regenerate"}
      </Button>
      <Snackbar open={Boolean(notice)} autoHideDuration={4500} onClose={() => setNotice("")}>
        <Alert severity={severity} variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}

function readPending(storageKey: string): PendingRegeneration | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "null") as PendingRegeneration | null;
    return typeof parsed?.startedAt === "number" ? parsed : null;
  } catch {
    return null;
  }
}
