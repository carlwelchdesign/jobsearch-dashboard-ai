"use client";

import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import { ActionButton } from "@/components/action-button";

export function DeletePacketAnswerButton({ applicationId, answerId }: { applicationId: string; answerId: string }) {
  return (
    <ActionButton
      postTo={`/api/applications/${applicationId}/packet/answers/${answerId}`}
      method="DELETE"
      variant="outlined"
      color="error"
      size="small"
      startIcon={<DeleteOutlineOutlinedIcon />}
      loadingLabel="Removing..."
      message="Saved application answer removed."
    >
      Remove
    </ActionButton>
  );
}
