"use client";

import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import { ActionButton } from "@/components/action-button";

export function SelectPacketAnswerOptionButton({
  applicationId,
  answerId,
  optionIndex,
  selected,
}: {
  applicationId: string;
  answerId: string;
  optionIndex: number;
  selected: boolean;
}) {
  return (
    <ActionButton
      postTo={`/api/applications/${applicationId}/packet/answers/${answerId}/select`}
      body={{ optionIndex }}
      variant={selected ? "contained" : "outlined"}
      color={selected ? "success" : "primary"}
      size="small"
      startIcon={<CheckCircleOutlineOutlinedIcon />}
      loadingLabel="Selecting..."
      message="Application answer option selected."
    >
      {selected ? "Selected" : "Use this"}
    </ActionButton>
  );
}
