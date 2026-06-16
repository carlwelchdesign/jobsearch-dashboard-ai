"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export type JoleneActionJson = {
  confirmationPlanId?: string;
  requiresConfirmation?: boolean;
  allowedExecution?: "internal_repairs_only";
  expiresAt?: string;
  plannedActions?: Array<{
    id: string;
    label: string;
    detail: string;
    risk?: "read_only" | "proposal" | "safe_internal" | "guarded_mutation" | "external_blocked";
    status?: "planned" | "executed" | "skipped" | "failed" | "cancelled";
    href?: string;
    executable?: boolean;
  }>;
  executedActions?: Array<{
    id: string;
    label: string;
    detail: string;
    status?: "planned" | "executed" | "skipped" | "failed" | "cancelled";
    href?: string;
  }>;
};

export function JoleneActionPlan({
  actionJson,
  messageId,
  confirming,
  onConfirm,
  onCancel,
}: {
  actionJson: JoleneActionJson;
  messageId: string;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const actions = actionJson.plannedActions ?? [];
  const requiresConfirmation = actionJson.requiresConfirmation === true;
  const executableActions = actions.filter((action) => action.executable);
  const expired = actionJson.expiresAt ? Date.parse(actionJson.expiresAt) < Date.now() : false;

  return (
    <Box sx={{ mt: 1.25, pt: 1, borderTop: 1, borderColor: "divider" }}>
      <Stack spacing={0.75}>
        {actions.slice(0, 4).map((action) => (
          <Box key={`${messageId}-${action.id}`} sx={{ p: 1, border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "rgba(255, 255, 255, 0.72)" }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 800 }}>{action.label}</Typography>
              <Chip size="small" variant="outlined" label={action.executable ? "internal" : "manual"} />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              {action.detail}
            </Typography>
            {action.href ? (
              <Button
                component={action.href.startsWith("/") && !action.href.startsWith("/api") ? Link : "a"}
                href={action.href}
                size="small"
                variant="text"
                sx={{ mt: 0.5, minHeight: 28, px: 0 }}
              >
                Open related page
              </Button>
            ) : null}
          </Box>
        ))}
      </Stack>
      {requiresConfirmation ? (
        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", rowGap: 1 }}>
          <Button
            size="small"
            variant="contained"
            disabled={confirming || expired || executableActions.length === 0}
            onClick={onConfirm}
          >
            {confirming ? "Confirming" : expired ? "Expired" : "Confirm internal actions"}
          </Button>
          <Button size="small" variant="outlined" disabled={confirming} onClick={onCancel}>
            Cancel
          </Button>
        </Stack>
      ) : (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          This plan is no longer awaiting confirmation.
        </Typography>
      )}
    </Box>
  );
}

export function JoleneExecutedActions({ actionJson, messageId }: { actionJson: JoleneActionJson; messageId: string }) {
  const actions = actionJson.executedActions ?? [];
  return (
    <Box sx={{ mt: 1.25, pt: 1, borderTop: 1, borderColor: "divider" }}>
      <Stack spacing={0.75}>
        {actions.slice(0, 5).map((action) => (
          <Stack key={`${messageId}-${action.id}-${action.status}`} direction="row" spacing={0.75} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ display: "block", fontWeight: 800 }}>{action.label}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{action.detail}</Typography>
            </Box>
            <Chip size="small" color={action.status === "executed" ? "success" : action.status === "failed" ? "error" : "default"} label={action.status ?? "done"} />
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
