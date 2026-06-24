"use client";

import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function FieldMemoryActions({ memoryId, canApprove }: { memoryId: string; canApprove: boolean }) {
  const { refresh } = useRouter();
  const [loading, setLoading] = useState<"approve" | "disable" | null>(null);

  async function update(action: "approve" | "disable") {
    setLoading(action);
    try {
      await fetch(`/api/application-field-memory/${memoryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
      {canApprove ? (
        <Button
          size="small"
          variant="contained"
          color="success"
          startIcon={<CheckCircleOutlineOutlinedIcon />}
          disabled={Boolean(loading)}
          onClick={() => void update("approve")}
        >
          {loading === "approve" ? "Approving..." : "Approve auto-fill"}
        </Button>
      ) : null}
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        startIcon={<BlockOutlinedIcon />}
        disabled={Boolean(loading)}
        onClick={() => void update("disable")}
      >
        {loading === "disable" ? "Disabling..." : "Disable"}
      </Button>
    </Stack>
  );
}
