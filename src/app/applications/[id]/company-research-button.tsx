"use client";

import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import { ActionButton } from "@/components/action-button";

export function CompanyResearchButton({ applicationId }: { applicationId: string }) {
  return (
    <ActionButton
      postTo={`/api/applications/${applicationId}/company-research`}
      variant="outlined"
      startIcon={<BusinessOutlinedIcon />}
      loadingLabel="Briefing..."
      message="Company brief generated."
    >
      Company brief
    </ActionButton>
  );
}
