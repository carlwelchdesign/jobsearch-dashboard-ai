"use client";

import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";

export type ServiceStatus = "active" | "not_configured" | "warning";

export type SilentFailure = {
  service: string;
  message: string;
};

export type ServiceHealthSettings = {
  statuses: Record<string, ServiceStatus>;
  silentFailures: SilentFailure[];
  /** Fallback service ID to highlight — passed via ?highlight= query param */
  highlight?: string;
};

type CheckResult = {
  id: string;
  status: "ok" | "error" | "skipped";
  message?: string;
};

type ServiceDef = {
  id: string;
  name: string;
  description: string;
  /** Hash fragment (no #) pointing to the exact heading in /guide */
  guideAnchor: string;
  optional: boolean;
};

const SERVICE_CATALOG: ServiceDef[] = [
  {
    id: "openai",
    name: "OpenAI",
    description:
      "Powers all AI-driven features: job scoring, resume tailoring, cover letter generation, Jolene, interview prep, and the agent evaluation loop. Without it the system falls back to deterministic keyword matching — functional but much less precise.",
    guideAnchor: "openai-api",
    optional: false,
  },
  {
    id: "langsmith",
    name: "LangSmith",
    description:
      "Records redacted metadata traces for every agent run. Enables the cross-agent evaluation loop that scores recurring behavior and generates governed improvement proposals. Completely optional — the system runs normally without it.",
    guideAnchor: "langsmith-agent-observability-and-tracing",
    optional: true,
  },
  {
    id: "brave",
    name: "Brave Search",
    description:
      "Powers the Search Query Backlog job source, which finds roles via web search in addition to direct ATS crawls. Required to use any search-query-type source template. Without it, only ATS adapters and company career pages are probed.",
    guideAnchor: "brave-search-api",
    optional: true,
  },
  {
    id: "resend",
    name: "Resend",
    description:
      "Sends outbound email notifications: match digests, interview alerts, and application follow-up reminders. Configure either Resend or Postmark — the system picks whichever is present. Not needed if you rely solely on Pushover.",
    guideAnchor: "resend-or-postmark-outbound-email-notifications",
    optional: true,
  },
  {
    id: "postmark",
    name: "Postmark",
    description:
      "Alternative outbound email provider. Used if RESEND_API_KEY is not set. Provides the same notification pipeline as Resend — digests, alerts, and reminders.",
    guideAnchor: "resend-or-postmark-outbound-email-notifications",
    optional: true,
  },
  {
    id: "pushover",
    name: "Pushover",
    description:
      "Delivers real-time push notifications to your phone for strong job matches and Needs Me blockers. Credentials can be stored in the environment or saved directly on this settings page. Fastest way to know when the assistant is stuck.",
    guideAnchor: "pushover-push-notifications-to-your-phone",
    optional: true,
  },
  {
    id: "imap",
    name: "IMAP Email sync",
    description:
      "Monitors a mailbox via IMAP for inbound job-response emails. Classifies replies as rejections, recruiter messages, interview requests, or follow-up prompts and updates application outcomes automatically. Requires an app password or restricted credential.",
    guideAnchor: "inbound-email-sync-imap-gmail-oauth-or-outlook-oauth",
    optional: true,
  },
  {
    id: "gmail",
    name: "Gmail OAuth",
    description:
      "Read-only Gmail mailbox sync using OAuth. Feeds the same email-response agent as IMAP without requiring app passwords. Connect via the Email sync section below once client credentials are configured.",
    guideAnchor: "inbound-email-sync-imap-gmail-oauth-or-outlook-oauth",
    optional: true,
  },
  {
    id: "outlook",
    name: "Outlook OAuth",
    description:
      "Read-only Outlook / Microsoft 365 mailbox sync using OAuth. Identical pipeline to Gmail OAuth — both can run simultaneously for multi-inbox coverage.",
    guideAnchor: "inbound-email-sync-imap-gmail-oauth-or-outlook-oauth",
    optional: true,
  },
  {
    id: "github_token",
    name: "GitHub token",
    description:
      "Raises the GitHub API rate limit from 60 to 5,000 requests per hour for repository sync and portfolio review runs. Not required — syncing works at the unauthenticated limit for small portfolios — but strongly recommended if you sync frequently.",
    guideAnchor: "github-personal-access-token",
    optional: true,
  },
  {
    id: "cron_secret",
    name: "Vercel Cron secret",
    description:
      "Authenticates the Vercel platform when it calls the scheduled job search endpoint. Required for Vercel-managed cron to work in production. Without it the endpoint can still be run manually from this page, but Vercel will not be able to trigger it.",
    guideAnchor: "job-search-schedule",
    optional: true,
  },
  {
    id: "extension_token",
    name: "Chrome extension token",
    description:
      "Secures the job capture and apply-now endpoints used by the Chrome extension. Without it anyone who can reach the API can submit capture requests. Not needed if you only use the extension from a local trusted network.",
    guideAnchor: "chrome-extension-token",
    optional: true,
  },
  {
    id: "adk",
    name: "Google ADK",
    description:
      "Opt-in Gemini-powered agent control plane. When ADK_ENABLED is true the system can route agent tasks through Google's Agent Development Kit instead of the default LangGraph / OpenAI stack. Experimental — most users do not need this.",
    guideAnchor: "google-adk-gemini-adk_enabledtrue",
    optional: true,
  },
  {
    id: "redis",
    name: "Redis / embeddings worker",
    description:
      "Runs the background embeddings worker via Docker Compose. The worker indexes evidence items into pgvector asynchronously so RAG-powered resume matching stays fresh without blocking API requests. Only needed when running the full Docker stack.",
    guideAnchor: "external-services-reference-what-to-set-up-and-why",
    optional: true,
  },
  {
    id: "playwright",
    name: "Playwright local assistant",
    description:
      "Enables the Apply Sprint browser automation workflow. The local Python / Playwright assistant fills application forms, saves field memories, and stops for review when it encounters CAPTCHAs or unknown questions. Requires the Python environment to be set up.",
    guideAnchor: "python-playwright-browser-assistant-always-runs-locally",
    optional: true,
  },
];

/** Maps fallback IDs (from service-fallbacks.ts) to one or more catalog IDs */
const FALLBACK_TO_CATALOG: Record<string, string[]> = {
  openai:        ["openai"],
  brave:         ["brave"],
  playwright:    ["playwright"],
  email_sync:    ["imap", "gmail", "outlook"],
  notifications: ["resend", "postmark", "pushover"],
};

function guideLink(anchor: string) {
  return `/guide#${anchor}`;
}

function statusLabel(s: ServiceStatus | "ok" | "error" | "skipped"): string {
  if (s === "active" || s === "ok") return "active";
  if (s === "warning") return "warning";
  if (s === "error") return "error";
  if (s === "not_configured" || s === "skipped") return "not configured";
  return s;
}

function statusColor(
  s: ServiceStatus | "ok" | "error" | "skipped",
): "success" | "warning" | "error" | "default" {
  if (s === "active" || s === "ok") return "success";
  if (s === "warning") return "warning";
  if (s === "error") return "error";
  return "default";
}

function StatusIndicator({ status }: { status: ServiceStatus | "ok" | "error" | "skipped" }) {
  if (status === "active" || status === "ok") {
    return <CheckCircleOutlineOutlinedIcon fontSize="small" color="success" />;
  }
  if (status === "warning") {
    return <WarningAmberOutlinedIcon fontSize="small" color="warning" />;
  }
  if (status === "error") {
    return <ErrorOutlinedIcon fontSize="small" color="error" />;
  }
  return <HelpOutlineOutlinedIcon fontSize="small" color="disabled" />;
}

export function ServiceHealthPanel({
  serviceHealthSettings,
}: {
  serviceHealthSettings: ServiceHealthSettings;
}) {
  const [statuses, setStatuses] = useState<Record<string, ServiceStatus | "ok" | "error" | "skipped">>(
    serviceHealthSettings.statuses,
  );
  const [silentFailures, setSilentFailures] = useState<SilentFailure[]>(
    serviceHealthSettings.silentFailures,
  );
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [checkError, setCheckError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const highlightRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const { highlight } = serviceHealthSettings;
    if (!highlight) return;
    const catalogIds = FALLBACK_TO_CATALOG[highlight] ?? [highlight];
    setHighlightedIds(new Set(catalogIds));
    setShowAll(true);
    // Scroll the first matching row into view after a short delay (let layout settle)
    const scrollTimer = setTimeout(() => {
      const firstId = catalogIds[0];
      const el = highlightRowRefs.current.get(firstId);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    // Clear highlight after 3 pulse cycles (3 × 1.2s)
    const clearTimer = setTimeout(() => setHighlightedIds(new Set()), 3800);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [serviceHealthSettings]);

  const activeCount = Object.values(statuses).filter((s) => s === "active" || s === "ok").length;
  const warningCount = Object.values(statuses).filter((s) => s === "warning" || s === "error").length;
  const notConfiguredCount = Object.values(statuses).filter(
    (s) => s === "not_configured" || s === "skipped",
  ).length;

  async function testConnectivity() {
    setChecking(true);
    setCheckError("");
    try {
      const res = await fetch("/api/settings/service-health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { checkedAt: string; results: Array<{ id: string; status: "ok" | "error" | "skipped"; message?: string }> };

      setCheckedAt(new Date(body.checkedAt).toLocaleString());

      const updated: Record<string, ServiceStatus | "ok" | "error" | "skipped"> = { ...statuses };
      const newFailures: SilentFailure[] = [...serviceHealthSettings.silentFailures];

      for (const result of body.results) {
        if (result.status === "ok") {
          updated[result.id] = "ok";
        } else if (result.status === "error") {
          updated[result.id] = "error";
          const svc = SERVICE_CATALOG.find((s) => s.id === result.id);
          if (svc) {
            const alreadyExists = newFailures.some(
              (f) => f.service === svc.name && f.message === result.message,
            );
            if (!alreadyExists && result.message) {
              newFailures.push({ service: svc.name, message: result.message });
            }
          }
        }
      }

      setStatuses(updated);
      setSilentFailures(newFailures);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Connectivity check failed");
    } finally {
      setChecking(false);
    }
  }

  const visibleServices = showAll ? SERVICE_CATALOG : SERVICE_CATALOG.filter((s) => {
    const st = statuses[s.id];
    return st === "active" || st === "ok" || st === "warning" || st === "error";
  });
  const hiddenCount = SERVICE_CATALOG.length - visibleServices.length;

  return (
    <Card id="settings-service-health">
      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1, alignItems: "center" }}>
              <TuneOutlinedIcon color="primary" fontSize="small" />
              <Typography variant="h3" sx={{ flex: 1 }}>Service health</Typography>
            </Stack>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
              <Chip size="small" color="primary" label="integrations" />
              <Chip size="small" color="success" variant="outlined" label={`${activeCount} active`} />
              {warningCount > 0 && (
                <Chip size="small" color="warning" variant="outlined" label={`${warningCount} warning`} />
              )}
              <Chip size="small" variant="outlined" label={`${notConfiguredCount} not configured`} />
              {silentFailures.length > 0 && (
                <Chip size="small" color="error" variant="outlined" label={`${silentFailures.length} issue${silentFailures.length === 1 ? "" : "s"}`} />
              )}
            </Stack>
            <Typography color="text.secondary">
              Optional integrations that enhance discovery, automation, and observability. Each can be added independently — the system works with whatever subset you configure.
            </Typography>
          </Box>

          <Stack spacing={0}>
            {visibleServices.map((service) => {
              const st = statuses[service.id] ?? "not_configured";
              const isHighlighted = highlightedIds.has(service.id);
              return (
                <Box
                  key={service.id}
                  ref={(el: HTMLDivElement | null) => {
                    if (el) highlightRowRefs.current.set(service.id, el);
                    else highlightRowRefs.current.delete(service.id);
                  }}
                  sx={{
                    borderTop: 1,
                    borderColor: isHighlighted ? "primary.main" : "divider",
                    py: 1.5,
                    px: isHighlighted ? 1 : 0,
                    borderRadius: isHighlighted ? 1 : 0,
                    transition: "border-color 0.3s, padding 0.3s",
                    "@keyframes serviceHighlight": {
                      "0%, 100%": { backgroundColor: "transparent" },
                      "50%": { backgroundColor: "rgba(25, 118, 210, 0.10)" },
                    },
                    animation: isHighlighted ? "serviceHighlight 1.2s ease-in-out 3" : "none",
                  }}
                >
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between" }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", flex: 1 }}>
                      <Box sx={{ pt: 0.25 }}>
                        <StatusIndicator status={st} />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", mb: 0.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{service.name}</Typography>
                          <Chip
                            size="small"
                            color={statusColor(st)}
                            variant={st === "not_configured" || st === "skipped" ? "outlined" : "filled"}
                            label={statusLabel(st)}
                          />
                          {service.optional && (
                            <Chip size="small" variant="outlined" label="optional" />
                          )}
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {service.description}
                        </Typography>
                      </Box>
                    </Stack>
                    <Box sx={{ flexShrink: 0, pt: { sm: 0.25 } }}>
                      <Button
                        component="a"
                        href={guideLink(service.guideAnchor)}
                        size="small"
                        variant="text"
                        endIcon={<OpenInNewIcon fontSize="inherit" />}
                        sx={{ whiteSpace: "nowrap" }}
                      >
                        Guide
                      </Button>
                    </Box>
                  </Stack>
                </Box>
              );
            })}
          </Stack>

          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Button
              variant="outlined"
              size="small"
              disabled={checking}
              onClick={testConnectivity}
            >
              {checking ? "Checking..." : "Test connectivity"}
            </Button>
            <Button
              variant="text"
              size="small"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Show configured only" : `Show all ${SERVICE_CATALOG.length} services${hiddenCount > 0 ? ` (${hiddenCount} not configured)` : ""}`}
            </Button>
            {checkedAt && !checking && (
              <Typography variant="caption" color="text.secondary">
                Last checked {checkedAt}
              </Typography>
            )}
          </Stack>

          {checkError && <Alert severity="error">{checkError}</Alert>}

          <Collapse in={silentFailures.length > 0}>
            <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1.5 }}>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                <Chip size="small" color="warning" label="silent failures" />
                <Chip size="small" variant="outlined" label={`${silentFailures.length} detected`} />
              </Stack>
              <Typography variant="h4">Potential silent failures</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Issues inferred from your current configuration and connection state. These services may appear configured but could be failing silently. Use the &ldquo;Test connectivity&rdquo; button to verify live status.
              </Typography>
              <Stack spacing={1.25} sx={{ mt: 1.25 }}>
                {silentFailures.map((failure, index) => (
                  <Box key={`${failure.service}-${index}`} sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 0.5 }}>
                      <Chip size="small" color="warning" variant="outlined" label={failure.service} />
                    </Stack>
                    <Typography variant="body2">{failure.message}</Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          </Collapse>
        </Stack>
      </CardContent>
    </Card>
  );
}
