"use client";

import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status-chip";

export type LinkedInDraftView = {
  id: string;
  title: string;
  hook: string;
  body: string;
  hashtags: string[];
  disclosureText: string;
  contentPillar: string;
  sourceFacts: string[];
  memorySources: Array<{ type: string; ref: string; label: string }>;
  analyticsSources: Array<{ type: string; ref: string; label: string }>;
  agentReviews: Array<{ agent: string; summary: string; recommendation: string }>;
  claims: Array<{ text: string; provenance: string; status: string }>;
  risks: string[];
  screenshotAssets: Array<{ path: string; label: string; description: string; route?: string; privacyStatus?: string; warnings?: string[] }>;
  selectedScreenshots: Array<{ path: string; label: string; description: string; route?: string; privacyStatus?: string; warnings?: string[] }>;
  privacyReview: { status: "PASS" | "NEEDS_REVIEW"; warnings: string[] };
  status: string;
  publishError: string | null;
  linkedInPostId: string | null;
  createdAt: string;
  approvedAt: string | null;
  publishedAt: string | null;
};

export type LinkedInShareConnectionView = {
  configured: boolean;
  connected: boolean;
  status: string | null;
  scopes: string[];
  lastPublishedAt: string | null;
};

const promptChips = [
  "Build log: what changed in the app this week?",
  "Product lesson from the latest agent workflow",
  "Workflow story about Jolene as Chief of Staff",
  "Architecture note from the plans folder",
  "Agent decision diary with evidence",
  "Market or LinkedIn analytics insight",
];

const formatChips = [
  { value: "field_note", label: "Field note" },
  { value: "build_log", label: "Build log" },
  { value: "lesson", label: "Lesson" },
  { value: "decision_diary", label: "Decision diary" },
  { value: "teardown", label: "Teardown" },
  { value: "before_after", label: "Before/after" },
  { value: "contrarian_take", label: "Contrarian" },
  { value: "visual_walkthrough", label: "Visual walkthrough" },
  { value: "product_thesis", label: "Product thesis" },
];

export function LinkedInContentClient({ initialDrafts, shareConnection }: { initialDrafts: LinkedInDraftView[]; shareConnection: LinkedInShareConnectionView }) {
  const [state, setState] = useState(() => ({
    drafts: initialDrafts,
    prompt: "",
    format: "field_note",
    visualDirection: "",
    generating: false,
    busyDraftId: "",
    notice: "",
    error: "",
  }));

  async function generateDraft() {
    setState((previous) => ({ ...previous, generating: true, notice: "", error: "" }));
    try {
      const response = await fetch("/api/linkedin-content/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: state.prompt,
          tone: "bold_grounded",
          format: state.format,
          visualDirection: state.visualDirection,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to generate LinkedIn draft.");
      await refreshDrafts();
      setState((previous) => ({ ...previous, notice: "Agent content team created a LinkedIn draft." }));
    } catch (caught) {
      setState((previous) => ({ ...previous, error: caught instanceof Error ? caught.message : "Unable to generate LinkedIn draft." }));
    } finally {
      setState((previous) => ({ ...previous, generating: false }));
    }
  }

  async function refreshDrafts() {
    const refreshed = await fetch("/api/linkedin-content/drafts").then((item) => item.json());
    setState((previous) => ({ ...previous, drafts: (refreshed.drafts ?? []).map(toDraftView) }));
  }

  async function updateDraft(id: string, patch: Partial<Pick<LinkedInDraftView, "title" | "hook" | "body" | "hashtags" | "disclosureText" | "status">>) {
    setState((previous) => ({ ...previous, busyDraftId: id, error: "" }));
    try {
      const response = await fetch(`/api/linkedin-content/drafts/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("Unable to update draft.");
      await refreshDrafts();
      setState((previous) => ({ ...previous, notice: patch.status === "ARCHIVED" ? "Draft archived." : "Draft saved." }));
    } catch (caught) {
      setState((previous) => ({ ...previous, error: caught instanceof Error ? caught.message : "Unable to update draft." }));
    } finally {
      setState((previous) => ({ ...previous, busyDraftId: "" }));
    }
  }

  async function approveDraft(id: string) {
    setState((previous) => ({ ...previous, busyDraftId: id, error: "", notice: "" }));
    try {
      const response = await fetch(`/api/linkedin-content/drafts/${id}/approve`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to publish LinkedIn draft.");
      await refreshDrafts();
      setState((previous) => ({ ...previous, notice: "Draft approved and published to LinkedIn." }));
    } catch (caught) {
      await refreshDrafts().catch(() => undefined);
      setState((previous) => ({ ...previous, error: caught instanceof Error ? caught.message : "Unable to publish LinkedIn draft." }));
    } finally {
      setState((previous) => ({ ...previous, busyDraftId: "" }));
    }
  }

  async function retryPublish(id: string) {
    setState((previous) => ({ ...previous, busyDraftId: id, error: "" }));
    try {
      const response = await fetch(`/api/linkedin-content/drafts/${id}/publish`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to retry LinkedIn publish.");
      await refreshDrafts();
      setState((previous) => ({ ...previous, notice: "Draft published to LinkedIn." }));
    } catch (caught) {
      await refreshDrafts().catch(() => undefined);
      setState((previous) => ({ ...previous, error: caught instanceof Error ? caught.message : "Unable to retry LinkedIn publish." }));
    } finally {
      setState((previous) => ({ ...previous, busyDraftId: "" }));
    }
  }

  async function copyDraft(draft: LinkedInDraftView) {
    const text = [draft.hook, "", draft.body, "", draft.disclosureText, "", draft.hashtags.join(" ")].join("\n");
    await navigator.clipboard.writeText(text);
    setState((previous) => ({ ...previous, notice: "Draft copied to clipboard." }));
  }

  return (
    <Stack spacing={3} sx={{ mt: 3 }}>
      {state.notice ? <Alert severity="success" onClose={() => setState((previous) => ({ ...previous, notice: "" }))}>{state.notice}</Alert> : null}
      {state.error ? <Alert severity="error" onClose={() => setState((previous) => ({ ...previous, error: "" }))}>{state.error}</Alert> : null}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "flex-start" }, justifyContent: "space-between" }}>
              <Box>
                <Typography variant="h3">Agent content team</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  Brief the documentarian agents on what you want to publish today. They use plans, agent runs, analytics, prior drafts, and safe app screenshots as context.
                </Typography>
              </Box>
              <Stack spacing={1} sx={{ minWidth: { md: 520 }, width: { xs: "100%", md: 560 } }}>
                <TextField
                  label="What should we post about today?"
                  value={state.prompt}
                  onChange={(event) => setState((previous) => ({ ...previous, prompt: event.target.value }))}
                  placeholder="Example: Document the Jolene Email Ops upgrade as a field note about agents becoming useful only when they report back with evidence."
                  multiline
                  minRows={3}
                  fullWidth
                />
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {promptChips.map((chip) => (
                    <Button key={chip} size="small" variant="outlined" onClick={() => setState((previous) => ({ ...previous, prompt: chip }))}>
                      {chip.split(":")[0]}
                    </Button>
                  ))}
                </Stack>
                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary">Post format</Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                    {formatChips.map((chip) => (
                      <Button
                        key={chip.value}
                        size="small"
                        variant={state.format === chip.value ? "contained" : "outlined"}
                        onClick={() => setState((previous) => ({ ...previous, format: chip.value }))}
                      >
                        {chip.label}
                      </Button>
                    ))}
                  </Stack>
                  <TextField
                    label="Visual direction"
                    value={state.visualDirection}
                    onChange={(event) => setState((previous) => ({ ...previous, visualDirection: event.target.value }))}
                    placeholder="Example: show Email Ops or agent run evidence"
                    size="small"
                    fullWidth
                  />
                </Stack>
                <Button variant="contained" startIcon={<AutoAwesomeOutlinedIcon />} disabled={state.generating} onClick={generateDraft}>
                  {state.generating ? "Generating..." : "Generate"}
                </Button>
              </Stack>
            </Stack>
            <Alert severity={shareConnection.connected ? "success" : "warning"} icon={<LinkedInIcon />}>
              {shareConnection.connected
                ? `LinkedIn publishing is connected${shareConnection.lastPublishedAt ? `, last published ${shareConnection.lastPublishedAt}` : ""}. Approval publishes immediately.`
                : shareConnection.configured
                  ? "LinkedIn publishing is configured but not connected. Connect before approval can publish."
                  : "Set LinkedIn client credentials to enable Share on LinkedIn publishing."}
              {shareConnection.configured && !shareConnection.connected ? (
                <Button component={Link} href="/api/auth/linkedin/share/start" size="small" sx={{ ml: 1 }}>Connect publishing</Button>
              ) : null}
            </Alert>
          </Stack>
        </CardContent>
      </Card>

      {state.drafts.length === 0 ? (
        <EmptyState title="No LinkedIn drafts yet" body="Generate the first draft from recent app progress, source coverage, analytics, and workflow lessons." />
      ) : (
        <Stack spacing={2}>
          {state.drafts.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              busy={state.busyDraftId === draft.id}
              canPublish={shareConnection.connected && draft.privacyReview.status === "PASS"}
              onCopy={() => copyDraft(draft)}
              onSave={(patch) => updateDraft(draft.id, patch)}
              onArchive={() => updateDraft(draft.id, { status: "ARCHIVED" })}
              onApprove={() => approveDraft(draft.id)}
              onRetry={() => retryPublish(draft.id)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function DraftCard({ draft, busy, canPublish, onCopy, onSave, onArchive, onApprove, onRetry }: {
  draft: LinkedInDraftView;
  busy: boolean;
  canPublish: boolean;
  onCopy: () => void;
  onSave: (patch: Partial<Pick<LinkedInDraftView, "title" | "hook" | "body" | "hashtags" | "disclosureText" | "status">>) => void;
  onArchive: () => void;
  onApprove: () => void;
  onRetry: () => void;
}) {
  const [editState, setEditState] = useState<null | {
    title: string;
    hook: string;
    body: string;
    hashtags: string;
    disclosureText: string;
  }>(null);
  const approvedOrPublished = ["APPROVED", "PUBLISHING", "PUBLISHED"].includes(draft.status);

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "flex-start" } }}>
            <Box>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                <StatusChip status={draft.privacyReview.status === "PASS" ? "approved" : "needs_review"} />
                <Chip size="small" variant="outlined" label={draft.status.replace(/_/g, " ").toLowerCase()} />
                <Chip size="small" variant="outlined" label={formatPillar(draft.contentPillar)} />
                <Chip size="small" variant="outlined" label={new Date(draft.createdAt).toLocaleString()} />
              </Stack>
              <Typography variant="h3">{draft.title}</Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>{draft.hook}</Typography>
            </Box>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              <Button size="small" startIcon={<ContentCopyOutlinedIcon />} onClick={onCopy}>Copy</Button>
              <Button
                size="small"
                startIcon={<EditOutlinedIcon />}
                disabled={approvedOrPublished}
                onClick={() => setEditState((value) => value ? null : {
                  title: draft.title,
                  hook: draft.hook,
                  body: draft.body,
                  hashtags: draft.hashtags.join(" "),
                  disclosureText: draft.disclosureText,
                })}
              >
                {editState ? "Preview" : "Edit"}
              </Button>
              <Button size="small" color="warning" startIcon={<DeleteOutlineOutlinedIcon />} disabled={busy} onClick={onArchive}>Archive</Button>
            </Stack>
          </Stack>

          {editState ? (
            <Stack spacing={1.5}>
              <TextField label="Title" value={editState.title} onChange={(event) => setEditState((value) => value ? { ...value, title: event.target.value } : value)} fullWidth />
              <TextField label="Hook" value={editState.hook} onChange={(event) => setEditState((value) => value ? { ...value, hook: event.target.value } : value)} fullWidth />
              <TextField label="Body" value={editState.body} onChange={(event) => setEditState((value) => value ? { ...value, body: event.target.value } : value)} fullWidth multiline minRows={8} />
              <TextField label="Disclosure" value={editState.disclosureText} onChange={(event) => setEditState((value) => value ? { ...value, disclosureText: event.target.value } : value)} fullWidth />
              <TextField label="Hashtags" value={editState.hashtags} onChange={(event) => setEditState((value) => value ? { ...value, hashtags: event.target.value } : value)} fullWidth />
              <Button
                variant="contained"
                startIcon={<SaveOutlinedIcon />}
                disabled={busy}
                onClick={() => onSave({
                  title: editState.title,
                  hook: editState.hook,
                  body: editState.body,
                  disclosureText: editState.disclosureText,
                  hashtags: editState.hashtags.split(/\s+/).filter(Boolean),
                })}
              >
                Save edits
              </Button>
            </Stack>
          ) : (
            <Box sx={{ whiteSpace: "pre-wrap", border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, bgcolor: "background.default" }}>
              <Typography>{draft.body}</Typography>
              <Typography sx={{ mt: 2, color: "text.secondary" }}>{draft.disclosureText}</Typography>
              {draft.hashtags.length ? <Typography sx={{ mt: 2, fontWeight: 800 }}>{draft.hashtags.join(" ")}</Typography> : null}
            </Box>
          )}

          {draft.publishError ? <Alert severity="error">Publish failed: {draft.publishError}</Alert> : null}
          {draft.privacyReview.status === "PASS" ? (
            <Alert severity="success">Privacy and provenance checks passed. Approval publishes to LinkedIn immediately.</Alert>
          ) : (
            <Alert severity="warning">Publishing is blocked. {draft.privacyReview.warnings.join(" ")}</Alert>
          )}

          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircleOutlineOutlinedIcon />}
              disabled={busy || !canPublish || approvedOrPublished}
              onClick={onApprove}
            >
              Approve and publish
            </Button>
            <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} disabled={busy || draft.status !== "FAILED"} onClick={onRetry}>
              Retry publish
            </Button>
            {draft.linkedInPostId ? <Chip color="success" label={`LinkedIn post ${draft.linkedInPostId}`} /> : null}
          </Stack>

          <Divider />
          <InfoSection title="Agent reviews" items={draft.agentReviews.map((review) => `${review.agent}: ${review.recommendation}`)} />
          <InfoSection title="Aggregate analytics used" items={draft.analyticsSources.map((source) => source.label)} />
          <InfoSection title="Plan sources" items={planSourceLabels(draft.memorySources)} />
          <InfoSection title="Memory sources" items={draft.memorySources.map((source) => `${source.type}: ${source.label}`)} />
          <InfoSection title="Grounded claims" items={draft.claims.map((claim) => `${claim.status}: ${claim.text}`)} />
          <ScreenshotSection assets={draft.selectedScreenshots.length ? draft.selectedScreenshots : draft.screenshotAssets} />
        </Stack>
      </CardContent>
    </Card>
  );
}

function InfoSection({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <Stack spacing={1}>
      <Typography sx={{ fontWeight: 850 }}>{title}</Typography>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
        {items.slice(0, 8).map((item) => <Chip key={`${title}-${item}`} size="small" variant="outlined" label={item} />)}
      </Stack>
    </Stack>
  );
}

function planSourceLabels(sources: LinkedInDraftView["memorySources"]) {
  const labels: string[] = [];
  for (const source of sources) {
    if (source.type === "plan") labels.push(source.label);
  }
  return labels;
}

function ScreenshotSection({ assets }: { assets: LinkedInDraftView["screenshotAssets"] }) {
  if (!assets.length) return null;
  return (
    <Stack spacing={1}>
      <Typography sx={{ fontWeight: 850 }}>Real app screenshots</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        {renderableScreenshotAssets(assets).map((asset) => (
          <Box key={asset.path} sx={{ width: { xs: "100%", sm: 260 }, border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden", bgcolor: "background.default" }}>
            <Box component="img" src={asset.path} alt={asset.label} sx={{ display: "block", width: "100%", aspectRatio: "16 / 9", objectFit: "cover" }} />
            <Box sx={{ p: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 800 }}>{asset.label}</Typography>
              <Typography variant="caption" color="text.secondary">{asset.privacyStatus ?? "NEEDS_REVIEW"}</Typography>
            </Box>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

function toDraftView(draft: Record<string, unknown>): LinkedInDraftView {
  return {
    id: String(draft.id),
    title: String(draft.title ?? ""),
    hook: String(draft.hook ?? ""),
    body: String(draft.body ?? ""),
    hashtags: stringArray(draft.hashtags),
    disclosureText: String(draft.disclosureText ?? ""),
    contentPillar: String(draft.contentPillar ?? "app_progress"),
    sourceFacts: stringArray(draft.sourceFacts),
    memorySources: objectArray(draft.memorySources),
    analyticsSources: objectArray(draft.analyticsSources),
    agentReviews: objectArray(draft.agentReviews),
    claims: objectArray(draft.claims),
    risks: stringArray(draft.risks),
    screenshotAssets: screenshotAssets(draft.screenshotAssets),
    selectedScreenshots: screenshotAssets(draft.selectedScreenshots),
    privacyReview: privacyReview(draft.privacyReview),
    status: String(draft.status ?? "DRAFT"),
    publishError: typeof draft.publishError === "string" ? draft.publishError : null,
    linkedInPostId: typeof draft.linkedInPostId === "string" ? draft.linkedInPostId : null,
    createdAt: String(draft.createdAt ?? new Date().toISOString()),
    approvedAt: typeof draft.approvedAt === "string" ? draft.approvedAt : null,
    publishedAt: typeof draft.publishedAt === "string" ? draft.publishedAt : null,
  };
}

function renderableScreenshotAssets(assets: LinkedInDraftView["screenshotAssets"]) {
  const output: LinkedInDraftView["screenshotAssets"] = [];
  for (const asset of assets) {
    if (asset.path) output.push(asset);
  }
  return output;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function objectArray<T extends Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? value.filter((item): item is T => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function screenshotAssets(value: unknown): LinkedInDraftView["screenshotAssets"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    return typeof record.path === "string" && typeof record.label === "string"
      ? [{
          path: record.path,
          label: record.label,
          description: typeof record.description === "string" ? record.description : "",
          route: typeof record.route === "string" ? record.route : undefined,
          privacyStatus: typeof record.privacyStatus === "string" ? record.privacyStatus : undefined,
          warnings: stringArray(record.warnings),
        }]
      : [];
  });
}

function privacyReview(value: unknown): LinkedInDraftView["privacyReview"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { status: "NEEDS_REVIEW", warnings: ["Privacy review missing."] };
  const record = value as Record<string, unknown>;
  return {
    status: record.status === "PASS" ? "PASS" : "NEEDS_REVIEW",
    warnings: stringArray(record.warnings),
  };
}

function formatPillar(value: string) {
  return value.replace(/_/g, " ");
}
