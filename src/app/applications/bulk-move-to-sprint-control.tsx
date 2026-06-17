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
import { useState } from "react";

type BulkMoveResponse = {
  error?: string;
  message?: string;
  moved?: number;
  prepared?: number;
  regenerated?: number;
  failed?: number;
  materialBlocked?: number;
  quotaBlocked?: number;
};

export function BulkMoveToSprintControl({ buttonSx }: { buttonSx?: SxProps<Theme> }) {
  const { refresh } = useRouter();
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error" | "info" | "warning">("info");

  async function moveToSprint() {
    setLoading(true);
    try {
      const request = fetch("/api/applications/bulk-move-to-sprint", {
        method: "POST",
        headers: { "content-type": "application/json", "x-run-in-background": "1" },
        body: JSON.stringify({ limit, regenerateBlockedMaterials: true }),
        keepalive: true,
      });

      setLoading(false);
      setSeverity("info");
      setNotice("Bulk move started. Regenerating blocked letters and preparing packets before Apply Sprint.");

      request
        .then(async (response) => {
          const payload = (await response.json().catch(() => ({}))) as BulkMoveResponse;
          if (!response.ok) throw new Error(payload.error ?? "Bulk move failed.");
          const moved = (payload.moved ?? 0) + (payload.prepared ?? 0);
          const regenerated = payload.regenerated ?? 0;
          const failed = payload.failed ?? 0;
          const materialBlocked = payload.materialBlocked ?? 0;
          const quotaBlocked = payload.quotaBlocked ?? 0;
          setSeverity(quotaBlocked || (failed > 0 && moved === 0) ? "warning" : failed > 0 ? "info" : moved > 0 ? "success" : "info");
          setNotice(payload.message ?? `Moved ${moved} application(s) into Apply Sprint. ${regenerated} regenerated. ${failed} failed. ${materialBlocked} material-blocked.`);
          refresh();
        })
        .catch((error) => {
          setSeverity("error");
          setNotice(error instanceof Error ? error.message : "Bulk move failed.");
        });
    } catch (error) {
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Bulk move failed.");
      setLoading(false);
    }
  }

  return (
    <>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
        <TextField
          select
          size="small"
          label="Move"
          value={limit}
          onChange={(event) => setLimit(Number(event.target.value))}
          sx={{ minWidth: 112 }}
        >
          {[5, 10, 25, 50].map((count) => <MenuItem key={count} value={count}>{count}</MenuItem>)}
        </TextField>
        <Button
          variant="contained"
          color="success"
          startIcon={<BoltOutlinedIcon />}
          disabled={loading}
          onClick={moveToSprint}
          sx={buttonSx}
        >
          {loading ? "Moving..." : "Bulk move to sprint"}
        </Button>
      </Stack>
      <Snackbar open={Boolean(notice)} autoHideDuration={6000} onClose={() => setNotice("")}>
        <Alert severity={severity} variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}
