"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Snackbar from "@mui/material/Snackbar";
import type { SxProps, Theme } from "@mui/material/styles";
import { useEffect, useRef, useState } from "react";

type ActionButtonProps = {
  children: React.ReactNode;
  href?: string;
  postTo?: string;
  body?: unknown;
  message?: string;
  method?: "POST" | "GET" | "DELETE";
  variant?: "text" | "outlined" | "contained";
  color?: "primary" | "secondary" | "success" | "error" | "warning" | "info";
  size?: "small" | "medium" | "large";
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  runInBackground?: boolean;
  loadingLabel?: string;
  sx?: SxProps<Theme>;
};

export function ActionButton({
  children,
  href,
  postTo,
  body,
  message,
  method = "POST",
  variant = "text",
  color = "primary",
  size = "medium",
  startIcon,
  endIcon,
  runInBackground = false,
  loadingLabel = "Working...",
  sx,
}: ActionButtonProps) {
  const { refresh } = useRouter();
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error" | "info">("info");
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  if (href) {
    return (
      <Button component={Link} href={href} variant={variant} color={color} size={size} startIcon={startIcon} endIcon={endIcon} sx={sx}>
        {children}
      </Button>
    );
  }

  async function runAction() {
    if (!postTo) {
      setSeverity("info");
      setNotice(message ?? "No action is configured for this control.");
      return;
    }

    setLoading(true);
    try {
      const request = fetch(postTo, {
        method,
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(runInBackground ? { "x-run-in-background": "1" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        keepalive: runInBackground,
      });

      if (runInBackground) {
        setSeverity("info");
        setNotice(message ?? "Generation started. You can leave this page.");

        request
          .then(async (response) => {
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error ?? "Action failed.");
            if (!mounted.current) return;
            setLoading(false);
            setSeverity("success");
            setNotice(payload.message ?? "Generation completed.");
            refresh();
          })
          .catch((error) => {
            if (!mounted.current) return;
            setLoading(false);
            setSeverity("error");
            setNotice(error instanceof Error ? error.message : "Action failed.");
          });
        return;
      }

      const response = await request;
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Action failed.");
      setSeverity("success");
      setNotice(message ?? payload.message ?? "Action completed.");
      refresh();
    } catch (error) {
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Action failed.");
    } finally {
      if (!runInBackground) setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant={loading ? "contained" : variant}
        color={loading ? "warning" : color}
        size={size}
        startIcon={loading ? <CircularProgress color="inherit" size={16} thickness={5} /> : startIcon}
        endIcon={loading ? undefined : endIcon}
        disabled={loading}
        aria-busy={loading}
        onClick={runAction}
        sx={[
          ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
          ...(loading
            ? [{
                "&.Mui-disabled": {
                  bgcolor: "warning.main",
                  color: "warning.contrastText",
                  opacity: 1,
                },
              }]
            : []),
        ]}
      >
        {loading ? loadingLabel : children}
      </Button>
      <Snackbar open={Boolean(notice)} autoHideDuration={4500} onClose={() => setNotice("")}>
        <Alert severity={severity} variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}
