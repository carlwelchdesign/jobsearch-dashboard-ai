"use client";

import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import { ActionButton } from "@/components/action-button";

export function CompensationOpportunityButton({ applicationId }: { applicationId: string }) {
  return (
    <ActionButton
      postTo={`/api/applications/${applicationId}/compensation-opportunity`}
      variant="outlined"
      startIcon={<PaidOutlinedIcon />}
      loadingLabel="Assessing..."
      message="Compensation opportunity brief generated."
    >
      Comp brief
    </ActionButton>
  );
}
