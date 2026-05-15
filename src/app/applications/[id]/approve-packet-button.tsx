"use client";

import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import { ActionButton } from "@/components/action-button";

export function ApprovePacketButton({ applicationId }: { applicationId: string }) {
  return (
    <ActionButton
      postTo={`/api/applications/${applicationId}/packet/approve`}
      variant="contained"
      color="success"
      startIcon={<AssignmentTurnedInOutlinedIcon />}
      loadingLabel="Approving..."
      message="Application packet approved."
    >
      Approve packet
    </ActionButton>
  );
}
