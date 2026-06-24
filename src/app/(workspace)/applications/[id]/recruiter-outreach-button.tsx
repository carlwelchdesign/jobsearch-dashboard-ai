"use client";

import ConnectWithoutContactOutlinedIcon from "@mui/icons-material/ConnectWithoutContactOutlined";
import { ActionButton } from "@/components/action-button";

export function RecruiterOutreachButton({ applicationId }: { applicationId: string }) {
  return (
    <ActionButton
      postTo={`/api/applications/${applicationId}/recruiter-outreach`}
      variant="outlined"
      startIcon={<ConnectWithoutContactOutlinedIcon />}
      loadingLabel="Drafting..."
      message="Recruiter outreach draft created."
    >
      Draft recruiter note
    </ActionButton>
  );
}
