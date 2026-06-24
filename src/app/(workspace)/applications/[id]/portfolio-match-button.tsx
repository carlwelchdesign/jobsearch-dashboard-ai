"use client";

import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import { ActionButton } from "@/components/action-button";

export function PortfolioMatchButton({ applicationId }: { applicationId: string }) {
  return (
    <ActionButton
      postTo={`/api/applications/${applicationId}/portfolio-match`}
      variant="outlined"
      startIcon={<AccountTreeOutlinedIcon />}
      loadingLabel="Matching..."
      message="Portfolio match generated."
    >
      Match portfolio
    </ActionButton>
  );
}
