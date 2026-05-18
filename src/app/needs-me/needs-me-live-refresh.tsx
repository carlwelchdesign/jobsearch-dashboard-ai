"use client";

import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
import Chip from "@mui/material/Chip";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NeedsMeLiveRefresh() {
  const { refresh } = useRouter();
  const refreshTimer = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const lastUpdateLabel = lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : null;

  useEffect(() => {
    const events = new EventSource("/api/agent-user-requests/stream");

    const handleReady = () => {
      setConnected(true);
    };
    const handleNeedsMe = (event: Event) => {
      const payload = parseStreamPayload(event);
      setConnected(true);
      setLastUpdate(payload?.at ?? new Date().toISOString());
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        refresh();
      }, 150);
    };
    const handleHeartbeat = () => {
      setConnected(true);
    };

    events.addEventListener("ready", handleReady);
    events.addEventListener("needs-me", handleNeedsMe);
    events.addEventListener("heartbeat", handleHeartbeat);
    events.onerror = () => {
      setConnected(false);
    };

    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      events.removeEventListener("ready", handleReady);
      events.removeEventListener("needs-me", handleNeedsMe);
      events.removeEventListener("heartbeat", handleHeartbeat);
      events.close();
    };
  }, [refresh]);

  return (
    <Chip
      size="small"
      color={connected ? "success" : "warning"}
      variant="outlined"
      icon={<SyncOutlinedIcon />}
      label={lastUpdateLabel ? `Live updated ${lastUpdateLabel}` : connected ? "Live alerts on" : "Live reconnecting"}
    />
  );
}

function parseStreamPayload(event: Event) {
  try {
    return JSON.parse((event as MessageEvent).data) as { at?: string };
  } catch {
    return null;
  }
}
