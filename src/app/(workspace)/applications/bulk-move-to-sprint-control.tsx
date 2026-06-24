"use client";

import { useRouter } from "next/navigation";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import type { SxProps, Theme } from "@mui/material/styles";
import TextField from "@mui/material/TextField";
import { useReducer } from "react";

type BulkMoveResponse = {
  error?: string;
  message?: string;
  archivedNoDirectUrl?: number;
  moved?: number;
  prepared?: number;
  regenerated?: number;
  failed?: number;
  materialBlocked?: number;
  quotaBlocked?: number;
  remainingEligible?: number;
  blockedExamples?: Array<{
    applicationId: string;
    company: string;
    title: string;
    action: string;
    reason: string;
  }>;
};

type BulkMoveState = {
  limit: number;
  loading: boolean;
  notice: string;
  severity: "success" | "error" | "info" | "warning";
  latestResult: BulkMoveResponse | null;
};

type BulkMoveAction =
  | { type: "set_limit"; limit: number }
  | { type: "start" }
  | { type: "notice"; notice: string; severity: BulkMoveState["severity"] }
  | { type: "success"; payload: BulkMoveResponse; notice: string; severity: BulkMoveState["severity"] }
  | { type: "error"; notice: string }
  | { type: "clear_notice" };

function bulkMoveReducer(state: BulkMoveState, action: BulkMoveAction): BulkMoveState {
  switch (action.type) {
    case "set_limit":
      return { ...state, limit: action.limit };
    case "start":
      return { ...state, loading: true };
    case "notice":
      return { ...state, loading: false, notice: action.notice, severity: action.severity };
    case "success":
      return { ...state, loading: false, latestResult: action.payload, notice: action.notice, severity: action.severity };
    case "error":
      return { ...state, loading: false, notice: action.notice, severity: "error" };
    case "clear_notice":
      return { ...state, notice: "" };
  }
}

export function BulkMoveToSprintControl({
  buttonSx,
  label = "Prepare approved for Ready to apply",
  loadingLabel = "Preparing...",
  queue = "approved",
  startNotice,
  buttonColor = "success",
}: {
  buttonSx?: SxProps<Theme>;
  label?: string;
  loadingLabel?: string;
  queue?: "approved" | "material_blocked";
  startNotice?: string;
  buttonColor?: "success" | "warning";
}) {
  const { refresh } = useRouter();
  const [state, dispatch] = useReducer(bulkMoveReducer, {
    limit: 25,
    loading: false,
    notice: "",
    severity: "info",
    latestResult: null,
  });

  async function moveToSprint() {
    dispatch({ type: "start" });
    try {
      const request = fetch("/api/applications/bulk-move-to-sprint", {
        method: "POST",
        headers: { "content-type": "application/json", "x-run-in-background": "1" },
        body: JSON.stringify({ limit: state.limit, regenerateBlockedMaterials: true, queue }),
        keepalive: true,
      });

      dispatch({
        type: "notice",
        severity: "info",
        notice: startNotice ?? "Preparing approved applications for Ready to apply. No-direct-URL items will be archived.",
      });

      request
        .then(async (response) => {
          const payload = (await response.json().catch(() => ({}))) as BulkMoveResponse;
          if (!response.ok) throw new Error(payload.error ?? "Bulk move failed.");
          const moved = (payload.moved ?? 0) + (payload.prepared ?? 0);
          const regenerated = payload.regenerated ?? 0;
          const failed = payload.failed ?? 0;
          const materialBlocked = payload.materialBlocked ?? 0;
          const quotaBlocked = payload.quotaBlocked ?? 0;
          dispatch({
            type: "success",
            payload,
            severity: quotaBlocked || (failed > 0 && moved === 0) ? "warning" : failed > 0 ? "info" : moved > 0 ? "success" : "info",
            notice: payload.message ?? `Prepared ${moved} application(s) for Ready to apply. ${regenerated} regenerated. ${failed} failed. ${materialBlocked} material-blocked.`,
          });
          refresh();
        })
        .catch((error) => {
          dispatch({ type: "error", notice: error instanceof Error ? error.message : "Bulk move failed." });
        });
    } catch (error) {
      dispatch({ type: "error", notice: error instanceof Error ? error.message : "Bulk move failed." });
    }
  }

  return (
    <>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
        <TextField
          select
          size="small"
          label="Move"
          value={state.limit}
          onChange={(event) => dispatch({ type: "set_limit", limit: Number(event.target.value) })}
          sx={{ minWidth: 112 }}
        >
          {[5, 10, 25, 50, 100, 250].map((count) => <MenuItem key={count} value={count}>{count}</MenuItem>)}
        </TextField>
        <Button
          variant="contained"
          color={buttonColor}
          startIcon={<BoltOutlinedIcon />}
          disabled={state.loading}
          onClick={moveToSprint}
          sx={buttonSx}
        >
          {state.loading ? loadingLabel : label}
        </Button>
      </Stack>
      {state.latestResult ? (
        <Alert severity={(state.latestResult.failed ?? 0) || (state.latestResult.materialBlocked ?? 0) ? "warning" : "success"} sx={{ mt: 1 }}>
          Prepared {(state.latestResult.moved ?? 0) + (state.latestResult.prepared ?? 0)} for Ready to apply. Archived {state.latestResult.archivedNoDirectUrl ?? 0} without direct URLs. {state.latestResult.materialBlocked ?? 0} material-blocked. {state.latestResult.failed ?? 0} failed.
          {state.latestResult.blockedExamples?.length ? (
            <Stack component="span" spacing={0.5} sx={{ display: "block", mt: 1 }}>
              {state.latestResult.blockedExamples.slice(0, 3).map((item) => (
                <span key={`${item.applicationId}-${item.action}`}>
                  {item.company} - {item.title}: {item.reason}
                </span>
              ))}
            </Stack>
          ) : null}
        </Alert>
      ) : null}
      <Snackbar open={Boolean(state.notice)} autoHideDuration={6000} onClose={() => dispatch({ type: "clear_notice" })}>
        <Alert severity={state.severity} variant="filled" onClose={() => dispatch({ type: "clear_notice" })}>
          {state.notice}
        </Alert>
      </Snackbar>
    </>
  );
}
