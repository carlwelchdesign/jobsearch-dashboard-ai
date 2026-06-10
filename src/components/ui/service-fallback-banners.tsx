"use client";

import CloseIcon from "@mui/icons-material/Close";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import { useMemo, useSyncExternalStore } from "react";
import type { FallbackItem } from "@/lib/service-fallbacks";

const DISMISSED_KEY = "service_fallback_dismissed";
const DISMISSED_EVENT = "service-fallback-dismissed";

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
    window.dispatchEvent(new Event(DISMISSED_EVENT));
  } catch {
    // ignore storage errors
  }
}

function subscribeToDismissed(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(DISMISSED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(DISMISSED_EVENT, callback);
  };
}

function getDismissedSnapshot() {
  return JSON.stringify(Array.from(getDismissed()).toSorted());
}

function dismissServiceFallback(id: string) {
  addDismissed(id);
}

export function ServiceFallbackBanners({ items }: { items: FallbackItem[] }) {
  const dismissedSnapshot = useSyncExternalStore(subscribeToDismissed, getDismissedSnapshot, () => "[]");
  const dismissed = useMemo(() => new Set(JSON.parse(dismissedSnapshot) as string[]), [dismissedSnapshot]);

  const visible = items.filter((item) => !dismissed.has(item.id));
  if (visible.length === 0) return null;

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
                href={`/settings/system?highlight=${item.id}#settings-service-health`}
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
                onClick={() => dismissServiceFallback(item.id)}
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
