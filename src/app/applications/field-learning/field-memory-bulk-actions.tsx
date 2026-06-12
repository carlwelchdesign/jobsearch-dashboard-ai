"use client";

import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import Button from "@mui/material/Button";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function FieldMemoryBulkActions({ memoryIds }: { memoryIds: string[] }) {
  const { refresh } = useRouter();
  const [loading, setLoading] = useState(false);

  async function approveAll() {
    setLoading(true);
    try {
      await fetch("/api/application-field-memory/bulk", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve", memoryIds }),
      });
      refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!memoryIds.length) return null;

  return (
    <Button
      size="small"
      variant="contained"
      color="success"
      startIcon={<CheckCircleOutlineOutlinedIcon />}
      disabled={loading}
      onClick={() => void approveAll()}
    >
      {loading ? "Approving..." : `Approve ${memoryIds.length} safe memor${memoryIds.length === 1 ? "y" : "ies"}`}
    </Button>
  );
}
