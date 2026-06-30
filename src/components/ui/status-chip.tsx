import Chip from "@mui/material/Chip";

const statusColor: Record<string, "default" | "primary" | "secondary" | "success" | "warning" | "error" | "info"> = {
  needs_review: "warning",
  approved: "primary",
  material_blocked: "warning",
  ready_to_apply: "success",
  applied: "info",
  follow_up_due: "warning",
  interviewing: "secondary",
  offer: "success",
  rejected: "error",
  rejected_by_company: "error",
  archived: "default",
  completed: "success",
  running: "info",
  partial: "warning",
  failed: "error",
};

export function StatusChip({ status, size = "small" }: { status: string; size?: "small" | "medium" }) {
  return <Chip size={size} color={statusColor[status] ?? "default"} variant="outlined" label={formatStatus(status)} />;
}

export function formatStatus(status: string) {
  if (status === "ready_to_apply") return "Ready to apply";
  if (status === "material_blocked") return "Needs material review";
  return status.replace(/_/g, " ");
}
