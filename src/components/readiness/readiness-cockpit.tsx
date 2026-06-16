import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutlineOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import type { LifecycleReadiness, LifecycleReadinessItem, LifecycleReadinessStage } from "@/lib/readiness/lifecycle";

const statusLabels: Record<LifecycleReadinessItem["status"], string> = {
  ready: "Ready",
  needs_work: "Needs work",
  blocked: "Blocked",
  snoozed: "Snoozed",
  dismissed: "Dismissed",
};

const stagePalette: Record<LifecycleReadinessItem["status"], { border: string; bg: string; color: "default" | "success" | "warning" | "error" | "info" }> = {
  ready: { border: "success.light", bg: "rgba(22, 163, 74, 0.08)", color: "success" },
  needs_work: { border: "warning.light", bg: "rgba(245, 158, 11, 0.08)", color: "warning" },
  blocked: { border: "error.light", bg: "rgba(220, 38, 38, 0.08)", color: "error" },
  snoozed: { border: "info.light", bg: "rgba(14, 165, 233, 0.08)", color: "info" },
  dismissed: { border: "grey.300", bg: "rgba(100, 116, 139, 0.08)", color: "default" },
};

export function ReadinessOperatingCockpit({ readiness }: { readiness: LifecycleReadiness }) {
  const next = readiness.nextAction;
  return (
    <Stack spacing={2}>
      <Card sx={{ borderColor: next?.status === "blocked" ? "error.main" : "primary.main", bgcolor: next?.status === "blocked" ? "rgba(220, 38, 38, 0.06)" : "rgba(37, 99, 235, 0.06)" }}>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                <Chip size="small" color="primary" label="Operating cockpit" />
                <Chip size="small" variant="outlined" label={`${readiness.readyCount}/${readiness.totalCount} ready`} />
              </Stack>
              <Typography variant="h3">{next ? next.label : "Lifecycle is clear"}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                {next ? next.detail : "No active readiness blockers are visible right now."}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: { md: "flex-end" } }}>
              {next ? <ActionButton href={next.href} variant="contained" size="small" endIcon={<OpenInNewIcon />}>{next.nextAction}</ActionButton> : null}
              <ActionButton href="/api/system/health" variant="outlined" size="small">Health</ActionButton>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <Box>
                <Typography variant="h3">Lifecycle readiness</Typography>
                <Typography variant="body2" color="text.secondary">Setup through outcome, with trust and health gates kept visible.</Typography>
              </Box>
              <Chip size="small" variant="outlined" label={`Generated ${new Date(readiness.generatedAt).toLocaleTimeString()}`} />
            </Stack>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(5, 1fr)" }, gap: 1 }}>
              {readiness.stages.map((stage) => {
                const palette = stagePalette[stage.status];
                return (
                  <Box key={stage.stage} component={Link} href={stage.href} sx={{ border: 1, borderColor: palette.border, borderRadius: 1, p: 1.25, bgcolor: palette.bg, textDecoration: "none", color: "inherit", minHeight: 92 }}>
                    <Stack spacing={0.75}>
                      <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                        <Typography variant="body2" sx={{ fontWeight: 900 }}>{stage.label}</Typography>
                        <Chip size="small" color={palette.color} label={statusLabels[stage.status]} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">{stage.readyCount}/{stage.totalCount} item(s) ready</Typography>
                    </Stack>
                  </Box>
                );
              })}
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.15fr 0.85fr" }, gap: 2 }}>
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h3">Priority readiness worklist</Typography>
              {readiness.priorityItems.length ? (
                <Stack spacing={1}>
                  {readiness.priorityItems.map((item) => <ReadinessWorklistRow key={item.key} item={item} />)}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">No readiness work is blocking today.</Typography>
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h3">Active queues</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 }}>
                {readiness.activeQueues.map((queue) => (
                  <Box key={queue.key} component={Link} href={queue.href} sx={{ border: 1, borderColor: queue.status === "blocked" ? "error.light" : queue.status === "active" ? "warning.light" : "divider", borderRadius: 1, p: 1.25, textDecoration: "none", color: "inherit" }}>
                    <Typography variant="h4">{queue.value}</Typography>
                    <Typography variant="caption" color="text.secondary">{queue.label}</Typography>
                  </Box>
                ))}
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Box>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h3">Value proof</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(5, 1fr)" }, gap: 1 }}>
              {readiness.valueProof.map((metric) => (
                <Box key={metric.key} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25, minHeight: 102 }}>
                  <Typography variant="h4">{metric.value}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{metric.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{metric.detail}</Typography>
                </Box>
              ))}
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export function LifecycleContextPanel({ readiness, stages, title = "Lifecycle next actions" }: {
  readiness: LifecycleReadiness;
  stages?: LifecycleReadinessStage[];
  title?: string;
}) {
  const items = readiness.items
    .filter((item) => !stages || stages.includes(item.stage))
    .filter((item) => item.status === "needs_work" || item.status === "blocked" || item.status === "snoozed")
    .slice(0, 3);

  if (!items.length) {
    return (
      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Chip size="small" color="success" label="Ready" sx={{ mb: 1 }} />
              <Typography variant="h3">{title}</Typography>
              <Typography variant="body2" color="text.secondary">No active readiness work is blocking this surface.</Typography>
            </Box>
            <Button component={Link} href="/dashboard" variant="outlined" size="small">Open cockpit</Button>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Chip size="small" color={items.some((item) => item.status === "blocked") ? "error" : "warning"} label="Next action" sx={{ mb: 1 }} />
              <Typography variant="h3">{title}</Typography>
            </Box>
            <Button component={Link} href="/dashboard" variant="outlined" size="small">Open cockpit</Button>
          </Stack>
          <Stack spacing={1}>
            {items.map((item) => <ReadinessWorklistRow key={item.key} item={item} compact />)}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function ReadinessWorklistRow({ item, compact = false }: { item: LifecycleReadinessItem; compact?: boolean }) {
  const palette = stagePalette[item.status];
  return (
    <Box sx={{ border: 1, borderColor: palette.border, bgcolor: palette.bg, borderRadius: 1, p: 1.25 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
        <Box>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 0.5 }}>
            <Chip size="small" color={palette.color} icon={item.status === "blocked" ? <WarningAmberIcon /> : undefined} label={statusLabels[item.status]} />
            <Chip size="small" variant="outlined" label={item.count} />
            {item.overrideStatus ? <Chip size="small" variant="outlined" label={item.overrideStatus.toLowerCase().replace("_", " ")} /> : null}
          </Stack>
          <Typography variant="body2" sx={{ fontWeight: 900 }}>{item.label}</Typography>
          <Typography variant="caption" color="text.secondary">{item.detail}</Typography>
        </Box>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", justifyContent: { md: "flex-end" } }}>
          <ActionButton href={item.href} variant="contained" size="small" endIcon={<OpenInNewIcon />}>{compact ? "Open" : item.nextAction}</ActionButton>
          {!item.isCritical ? (
            <>
              <ActionButton postTo={`/api/readiness/${encodeURIComponent(item.key)}`} method="PATCH" body={{ action: "snooze" }} variant="outlined" size="small" startIcon={<PauseCircleOutlineIcon />}>Snooze</ActionButton>
              <ActionButton postTo={`/api/readiness/${encodeURIComponent(item.key)}`} method="PATCH" body={{ action: "complete" }} variant="outlined" size="small" startIcon={<CheckCircleOutlineIcon />}>Done</ActionButton>
            </>
          ) : null}
          {item.overrideStatus && !item.isCritical ? (
            <ActionButton postTo={`/api/readiness/${encodeURIComponent(item.key)}`} method="PATCH" body={{ action: "reset" }} variant="text" size="small" startIcon={<RestartAltIcon />}>Reset</ActionButton>
          ) : null}
        </Stack>
      </Stack>
    </Box>
  );
}
