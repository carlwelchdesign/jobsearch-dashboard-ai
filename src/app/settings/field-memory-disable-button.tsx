"use client";

import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import Button from "@mui/material/Button";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function FieldMemoryDisableButton({ memoryId }: { memoryId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function disable() {
    setLoading(true);
    try {
      await fetch(`/api/application-field-memory/${memoryId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="small" variant="outlined" color="inherit" startIcon={<BlockOutlinedIcon />} disabled={loading} onClick={() => void disable()}>
      Disable
    </Button>
  );
}
