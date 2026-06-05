"use client";

import CloseIcon from "@mui/icons-material/Close";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import { useEffect, useState } from "react";
import type { FallbackItem } from "@/lib/service-fallbacks";

const DISMISSED_KEY = "service_fallback_dismissed";

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function addDismissed(id: string) {
  try {
    const current = getDismissed();
    current.add(id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...current]));
  } catch {
    // ignore storage errors
  }
}

export function ServiceFallbackBanners({ items }: { items: FallbackItem[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDismissed(getDismissed());
    setMounted(true);
  }, []);

  // Don't render anything until mounted to avoid hydration mismatch
  if (!mounted) return null;

  const visible = items.filter((item) => !dismissed.has(item.id));
  if (visible.length === 0) return null;

  function dismiss(id: string) {
    addDismissed(id);
    setDismissed((prev) => new Set([...prev, id]));
  }

  return (
    <Stack spacing={1}>
      {visible.map((item) => (
        <Alert
          key={item.id}
          severity="info"
          action={
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Button
                component="a"
                href={`/settings?highlight=${item.id}#settings-service-health`}
                size="small"
                variant="outlined"
                color="info"
                sx={{ whiteSpace: "nowrap", fontSize: "0.75rem" }}
              >
                Set up
              </Button>
              <IconButton
                size="small"
                aria-label="Dismiss"
                color="info"
                onClick={() => dismiss(item.id)}
              >
                <CloseIcon fontSize="inherit" />
              </IconButton>
            </Stack>
          }
        >
          {item.message}
        </Alert>
      ))}
    </Stack>
  );
}
