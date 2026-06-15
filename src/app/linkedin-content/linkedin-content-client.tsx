"use client";

import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
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
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status-chip";
import { copyTextToClipboard } from "@/lib/browser/clipboard";

const LINKEDIN_CONTENT_PROMPT_LIMIT = 12000;
const LINKEDIN_CONTENT_VISUAL_DIRECTION_LIMIT = 2000;

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
  agentReviews: Array<{ agent: string; summary: string; recommendation: string; metadata?: Record<string, unknown> }>;
  claims: Array<{ text: string; provenance: string; status: string }>;
  risks: string[];
  screenshotAssets: LinkedInVisualAssetView[];
  selectedScreenshots: LinkedInVisualAssetView[];
  privacyReview: { status: "PASS" | "NEEDS_REVIEW"; warnings: string[] };
  status: string;
  publishError: string | null;
  linkedInPostId: string | null;
  createdAt: string;
  approvedAt: string | null;
  publishedAt: string | null;
};

type LinkedInVisualAssetView = {
  path: string;
  label: string;
  description: string;
  route?: string;
  assetType?: string;
  diagramKind?: string;
  renderEngine?: string;
  layoutKind?: string;
  qualityReview?: { status?: string; score?: number; warnings?: string[]; topology?: string; legend?: string };
  imageModel?: string;
  provenance?: string[];
  rationale?: string;
  privacyStatus?: string;
  warnings?: string[];
  mimeType?: string;
};

export type LinkedInShareConnectionView = {
  configured: boolean;
  connected: boolean;
  status: string | null;
  scopes: string[];
  lastPublishedAt: string | null;
};

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

  async function approveDraft(id: string, overrideReview = false) {
    setState((previous) => ({ ...previous, busyDraftId: id, error: "", notice: "" }));
    try {
      const response = await fetch(`/api/linkedin-content/drafts/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ overrideReview }),
      });
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

  async function replaceDraftVisual(id: string, file: File) {
    setState((previous) => ({ ...previous, busyDraftId: id, error: "", notice: "" }));
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("label", file.name || "Uploaded LinkedIn screenshot");
      formData.set("description", "User uploaded replacement screenshot for this LinkedIn draft.");
      const response = await fetch(`/api/linkedin-content/drafts/${id}/visuals/upload`, {
        method: "POST",
        body: formData,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to replace draft visual.");
      await refreshDrafts();
      setState((previous) => ({ ...previous, notice: "Selected LinkedIn visual replaced with uploaded screenshot." }));
    } catch (caught) {
      setState((previous) => ({ ...previous, error: caught instanceof Error ? caught.message : "Unable to replace draft visual." }));
    } finally {
      setState((previous) => ({ ...previous, busyDraftId: "" }));
    }
  }

  async function regenerateDraftVisuals(id: string, visualDirection: string) {
    setState((previous) => ({ ...previous, busyDraftId: id, error: "", notice: "" }));
    try {
      const response = await fetch(`/api/linkedin-content/drafts/${id}/visuals/regenerate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visualDirection }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to regenerate draft visuals.");
      await refreshDrafts();
      setState((previous) => ({ ...previous, notice: "Replacement visuals regenerated." }));
    } catch (caught) {
      setState((previous) => ({ ...previous, error: caught instanceof Error ? caught.message : "Unable to regenerate draft visuals." }));
    } finally {
      setState((previous) => ({ ...previous, busyDraftId: "" }));
    }
  }

  async function copyDraft(draft: LinkedInDraftView) {
    const text = [draft.hook, "", draft.body, "", draft.disclosureText, "", draft.hashtags.join(" ")].join("\n");
    try {
      await copyTextToClipboard(text);
      setState((previous) => ({ ...previous, notice: "Draft copied to clipboard.", error: "" }));
    } catch (caught) {
      setState((previous) => ({
        ...previous,
        error: caught instanceof Error ? caught.message : "Unable to copy draft.",
      }));
    }
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
                  helperText={`${state.prompt.length.toLocaleString()} / ${LINKEDIN_CONTENT_PROMPT_LIMIT.toLocaleString()} characters`}
                  slotProps={{ htmlInput: { maxLength: LINKEDIN_CONTENT_PROMPT_LIMIT } }}
                />
                <Stack spacing={1}>
                  <TextField
                    label="Visual direction"
                    value={state.visualDirection}
                    onChange={(event) => setState((previous) => ({ ...previous, visualDirection: event.target.value }))}
                    placeholder="Example: show Email Ops or agent run evidence"
                    size="small"
                    fullWidth
                    helperText={`${state.visualDirection.length.toLocaleString()} / ${LINKEDIN_CONTENT_VISUAL_DIRECTION_LIMIT.toLocaleString()} characters`}
                    slotProps={{ htmlInput: { maxLength: LINKEDIN_CONTENT_VISUAL_DIRECTION_LIMIT } }}
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
              canPublish={shareConnection.connected}
              onCopy={() => copyDraft(draft)}
              onSave={(patch) => updateDraft(draft.id, patch)}
              onArchive={() => updateDraft(draft.id, { status: "ARCHIVED" })}
              onApprove={(overrideReview) => approveDraft(draft.id, overrideReview)}
              onRetry={() => retryPublish(draft.id)}
              onReplaceVisual={(file) => replaceDraftVisual(draft.id, file)}
              onRegenerateVisuals={(visualDirection) => regenerateDraftVisuals(draft.id, visualDirection)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function DraftCard({ draft, busy, canPublish, onCopy, onSave, onArchive, onApprove, onRetry, onReplaceVisual, onRegenerateVisuals }: {
  draft: LinkedInDraftView;
  busy: boolean;
  canPublish: boolean;
  onCopy: () => void;
  onSave: (patch: Partial<Pick<LinkedInDraftView, "title" | "hook" | "body" | "hashtags" | "disclosureText" | "status">>) => void;
  onArchive: () => void;
  onApprove: (overrideReview: boolean) => void;
  onRetry: () => void;
  onReplaceVisual: (file: File) => void;
  onRegenerateVisuals: (visualDirection: string) => void;
}) {
  const [editState, setEditState] = useState<null | {
    title: string;
    hook: string;
    body: string;
    hashtags: string;
    disclosureText: string;
  }>(null);
  const [replacementDirection, setReplacementDirection] = useState("");
  const [reviewOverride, setReviewOverride] = useState(false);
  const approvedOrPublished = ["APPROVED", "PUBLISHING", "PUBLISHED"].includes(draft.status);
  const visualLocked = ["APPROVED", "PUBLISHING", "PUBLISHED"].includes(draft.status);
  const promptContext = promptContextFromReviews(draft.agentReviews);
  const promptQuality = promptQualityFromReviews(draft.agentReviews);
  const visualContext = visualContextFromReviews(draft.agentReviews);
  const selectedVisual = renderableScreenshotAssets(draft.selectedScreenshots)[0] ?? renderableScreenshotAssets(draft.screenshotAssets)[0];
  const claimSummary = summarizeClaims(draft.claims);
  const publishNeedsOverride = draft.privacyReview.status !== "PASS" || claimSummary.needsReview > 0;
  const publishDisabled = busy || !canPublish || approvedOrPublished || (publishNeedsOverride && !reviewOverride);

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
          {promptQuality ? (
            <Alert severity={promptQuality.status === "PASS" ? "success" : "warning"}>
              Prompt match: {promptQuality.score}/100 for {promptQuality.intent}. {promptQuality.warningText || "Draft satisfies the prompt obligations."}
            </Alert>
          ) : null}
          {!canPublish ? (
            <Alert severity="warning">Connect LinkedIn publishing before approval can publish.</Alert>
          ) : draft.privacyReview.status === "PASS" && claimSummary.needsReview === 0 ? (
            <Alert severity="success">Privacy and provenance checks passed. Approval publishes to LinkedIn immediately.</Alert>
          ) : (
            <Alert severity="warning">Review warnings are suggestions unless you confirm final approval. {[
              ...draft.privacyReview.warnings,
              ...(claimSummary.needsReview ? [`${claimSummary.needsReview} claim${claimSummary.needsReview === 1 ? "" : "s"} need provenance review.`] : []),
            ].join(" ")}</Alert>
          )}

          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            {publishNeedsOverride && canPublish && !approvedOrPublished ? (
              <FormControlLabel
                control={<Checkbox checked={reviewOverride} onChange={(event) => setReviewOverride(event.target.checked)} />}
                label="I reviewed these warnings and approve publishing anyway"
              />
            ) : null}
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircleOutlineOutlinedIcon />}
              disabled={publishDisabled}
              onClick={() => onApprove(publishNeedsOverride)}
            >
              {publishNeedsOverride ? "Approve anyway and publish" : "Approve and publish"}
            </Button>
            <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} disabled={busy || draft.status !== "FAILED"} onClick={onRetry}>
              Retry publish
            </Button>
            {draft.linkedInPostId ? <Chip color="success" label={`LinkedIn post ${draft.linkedInPostId}`} /> : null}
          </Stack>

          <Divider />
          <GenerationSummary draft={draft} promptContext={promptContext} promptQuality={promptQuality} visualContext={visualContext} />
          <VisualReplacementPanel
            busy={busy}
            locked={visualLocked}
            selectedVisual={selectedVisual}
            visualDirection={replacementDirection}
            onVisualDirectionChange={setReplacementDirection}
            onReplaceVisual={onReplaceVisual}
            onRegenerate={() => onRegenerateVisuals(replacementDirection)}
          />
          <ScreenshotSection assets={draft.selectedScreenshots.length ? draft.selectedScreenshots : draft.screenshotAssets} />
        </Stack>
      </CardContent>
    </Card>
  );
}

function VisualReplacementPanel({ busy, locked, selectedVisual, visualDirection, onVisualDirectionChange, onReplaceVisual, onRegenerate }: {
  busy: boolean;
  locked: boolean;
  selectedVisual?: LinkedInVisualAssetView;
  visualDirection: string;
  onVisualDirectionChange: (value: string) => void;
  onReplaceVisual: (file: File) => void;
  onRegenerate: () => void;
}) {
  const inputId = `visual-upload-${selectedVisual?.path.replace(/[^a-z0-9]+/gi, "-") || "draft"}`;
  return (
    <Stack spacing={1.25}>
      <Typography sx={{ fontWeight: 850 }}>Selected publish visual</Typography>
      {selectedVisual ? (
        <Stack spacing={0.25}>
          <Typography variant="body2" sx={{ fontWeight: 800 }}>{selectedVisual.label}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
            {selectedVisual.assetType ?? "screenshot"} - {selectedVisual.privacyStatus ?? "NEEDS_REVIEW"} - {selectedVisual.path}
          </Typography>
        </Stack>
      ) : (
        <Alert severity="warning">No selected visual is available for publishing.</Alert>
      )}
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ alignItems: { md: "flex-start" } }}>
        <Button
          component="label"
          variant="outlined"
          startIcon={<AddPhotoAlternateOutlinedIcon />}
          disabled={busy || locked}
        >
          Replace with screenshot
          <input
            id={inputId}
            hidden
            type="file"
            aria-label="Replace selected LinkedIn visual with screenshot"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onReplaceVisual(file);
            }}
          />
        </Button>
        <TextField
          label="Replacement visual direction"
          value={visualDirection}
          onChange={(event) => onVisualDirectionChange(event.target.value)}
          placeholder="Example: show the dashboard pipeline, not an abstract diagram"
          size="small"
          fullWidth
          disabled={busy || locked}
        />
        <Button
          variant="outlined"
          startIcon={<RefreshOutlinedIcon />}
          disabled={busy || locked || !visualDirection.trim()}
          onClick={onRegenerate}
          sx={{ whiteSpace: "nowrap" }}
        >
          Regenerate visuals
        </Button>
      </Stack>
    </Stack>
  );
}

function GenerationSummary({ draft, promptContext, promptQuality, visualContext }: {
  draft: LinkedInDraftView;
  promptContext: ReturnType<typeof promptContextFromReviews>;
  promptQuality: ReturnType<typeof promptQualityFromReviews>;
  visualContext: ReturnType<typeof visualContextFromReviews>;
}) {
  const selectedEvidence = selectedEvidenceFromReviews(draft.agentReviews);
  const claimSummary = summarizeClaims(draft.claims);
  const planSources = planSourceLabels(draft.memorySources);
  const reviewBlockers = [
    ...(promptQuality?.warningText ? [promptQuality.warningText] : []),
    ...(draft.privacyReview.status === "PASS" ? [] : draft.privacyReview.warnings),
    ...(claimSummary.needsReview ? [`${claimSummary.needsReview} claim${claimSummary.needsReview === 1 ? "" : "s"} need review.`] : []),
  ];

  return (
    <Stack spacing={1.25}>
      <Typography sx={{ fontWeight: 850 }}>Generation summary</Typography>
      <Stack spacing={0.75}>
        <SummaryLine label="Assignment" value={truncateText(promptContext?.prompt || "No prompt metadata captured.", 260)} />
        <SummaryLine label="Intent" value={[
          promptContext?.intent || "unknown",
          promptContext?.format ? `format ${promptContext.format}` : "",
          promptQuality?.generationMode ? `mode ${promptQuality.generationMode}` : "",
          promptQuality ? `prompt match ${promptQuality.score}/100` : "",
        ].filter(Boolean).join(" - ")} />
        <SummaryLine label="Selected evidence" value={selectedEvidence ? `${selectedEvidence.label}: ${truncateText(selectedEvidence.text, 180)}` : "No selected evidence recorded."} />
        <SummaryLine label="Sources" value={`${planSources.length} plan source${planSources.length === 1 ? "" : "s"}, ${draft.analyticsSources.length} analytics source${draft.analyticsSources.length === 1 ? "" : "s"}, ${draft.memorySources.length} memory source${draft.memorySources.length === 1 ? "" : "s"}.`} />
        <SummaryLine label="Claims" value={`${claimSummary.grounded} grounded, ${claimSummary.needsReview} need review.`} tone={claimSummary.needsReview ? "warning" : "default"} />
        {visualContext ? <SummaryLine label="Visual" value={truncateText(visualContext.visualRationale, 180)} /> : null}
        <SummaryLine label="Review" value={reviewBlockers.length ? truncateText(reviewBlockers.join(" "), 240) : "Prompt, privacy, and provenance checks are clear."} tone={reviewBlockers.length ? "warning" : "default"} />
      </Stack>
      <Box component="details" sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1, bgcolor: "background.default" }}>
        <Box component="summary" sx={{ cursor: "pointer", fontWeight: 800 }}>Source details</Box>
        <Stack spacing={1} sx={{ mt: 1 }}>
          <CompactList title="Agent notes" items={draft.agentReviews.map((review) => `${review.agent}: ${review.recommendation}`)} />
          <CompactList title="Plan sources" items={planSources} />
          <CompactList title="Analytics" items={draft.analyticsSources.map((source) => source.label)} />
          <CompactList title="Memory" items={draft.memorySources.map((source) => `${source.type}: ${source.label}`)} />
          <CompactList title="Claims" items={draft.claims.map((claim) => `${claim.status}: ${claim.text}`)} />
        </Stack>
      </Box>
    </Stack>
  );
}

function SummaryLine({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "baseline" } }}>
      <Typography variant="body2" sx={{ width: { sm: 140 }, flexShrink: 0, fontWeight: 800 }}>{label}</Typography>
      <Typography variant="body2" color={tone === "warning" ? "warning.main" : "text.secondary"} sx={{ overflowWrap: "anywhere" }}>{value}</Typography>
    </Stack>
  );
}

function CompactList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" sx={{ fontWeight: 800 }}>{title}</Typography>
      {items.slice(0, 6).map((item) => (
        <Typography key={`${title}-${item}`} variant="caption" color="text.secondary" sx={{ display: "block", overflowWrap: "anywhere" }}>
          {truncateText(item, 220)}
        </Typography>
      ))}
      {items.length > 6 ? <Typography variant="caption" color="text.secondary">+ {items.length - 6} more</Typography> : null}
    </Stack>
  );
}

function promptContextFromReviews(reviews: LinkedInDraftView["agentReviews"]) {
  const metadata = reviews.find((review) => review.agent === "Narrative Strategist")?.metadata;
  if (!metadata) return null;
  return {
    prompt: typeof metadata.prompt === "string" ? metadata.prompt : "",
    intent: typeof metadata.intent === "string" ? metadata.intent : "",
    format: typeof metadata.format === "string" ? metadata.format : "",
    selectedAngle: typeof metadata.selectedAngle === "string" ? metadata.selectedAngle : "",
  };
}

function promptQualityFromReviews(reviews: LinkedInDraftView["agentReviews"]) {
  const metadata = reviews.find((review) => review.agent === "Prompt Fidelity Reviewer")?.metadata;
  if (!metadata) return null;
  const warnings = Array.isArray(metadata.warnings) ? metadata.warnings.filter((item): item is string => typeof item === "string") : [];
  return {
    status: metadata.status === "PASS" ? "PASS" : "NEEDS_REVIEW",
    score: typeof metadata.score === "number" ? metadata.score : 0,
    intent: typeof metadata.intent === "string" ? metadata.intent : "unknown",
    generationMode: typeof metadata.generationMode === "string" ? metadata.generationMode : "unknown",
    warningText: warnings.join(" "),
  };
}

function visualContextFromReviews(reviews: LinkedInDraftView["agentReviews"]) {
  const metadata = reviews.find((review) => review.agent === "Visual Producer")?.metadata;
  if (!metadata) return null;
  return {
    visualRationale: typeof metadata.visualRationale === "string" ? metadata.visualRationale : "Selected by the visual producer.",
  };
}

function selectedEvidenceFromReviews(reviews: LinkedInDraftView["agentReviews"]) {
  const metadata = reviews.find((review) => review.agent === "Evidence Reporter")?.metadata;
  const evidence = metadata && typeof metadata === "object" ? metadata.selectedEvidence : null;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const record = evidence as Record<string, unknown>;
  return {
    label: typeof record.label === "string" ? record.label : "Selected evidence",
    text: typeof record.text === "string" ? record.text : "",
  };
}

function summarizeClaims(claims: LinkedInDraftView["claims"]) {
  let grounded = 0;
  let needsReview = 0;
  for (const claim of claims) {
    if (claim.status === "grounded") grounded += 1;
    else needsReview += 1;
  }
  return { grounded, needsReview };
}

function planSourceLabels(sources: LinkedInDraftView["memorySources"]) {
  const labels: string[] = [];
  for (const source of sources) {
    if (source.type === "plan") labels.push(source.label);
  }
  return labels;
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trimEnd()}...` : normalized;
}

function ScreenshotSection({ assets }: { assets: LinkedInDraftView["screenshotAssets"] }) {
  if (!assets.length) return null;
  const diagrams = renderableScreenshotAssets(assets).filter((asset) => asset.assetType === "diagram");
  const aiPolish = renderableScreenshotAssets(assets).filter((asset) => asset.assetType === "ai_polish");
  const screenshots = renderableScreenshotAssets(assets).filter((asset) => asset.assetType !== "diagram" && asset.assetType !== "ai_polish");
  return (
    <Stack spacing={1.5}>
      <Typography sx={{ fontWeight: 850 }}>Visuals</Typography>
      <VisualAssetGroup title="Technical diagrams" assets={diagrams} />
      <VisualAssetGroup title="AI polish variants" assets={aiPolish} />
      <VisualAssetGroup title="App screenshots" assets={screenshots} />
    </Stack>
  );
}

function VisualAssetGroup({ title, assets }: { title: string; assets: LinkedInDraftView["screenshotAssets"] }) {
  if (!assets.length) return null;
  return (
    <Stack spacing={0.75}>
      <Typography variant="body2" sx={{ fontWeight: 800 }}>{title}</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        {assets.map((asset) => (
          <Box key={asset.path} sx={{ width: { xs: "100%", sm: 300 }, border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden", bgcolor: "background.default" }}>
            <Box
              component="img"
              src={asset.path}
              alt={asset.label}
              sx={{
                display: "block",
                width: "100%",
                aspectRatio: "16 / 9",
                objectFit: "contain",
                bgcolor: "background.paper",
              }}
            />
            <Box sx={{ p: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 800, overflowWrap: "anywhere" }}>{asset.label}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {asset.assetType ?? "screenshot"} - {asset.privacyStatus ?? "NEEDS_REVIEW"}
                {asset.qualityReview?.score != null ? ` - quality ${asset.qualityReview.score}/100` : ""}
              </Typography>
              {asset.renderEngine ? <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Renderer: {asset.renderEngine}</Typography> : null}
              {asset.layoutKind ? <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Layout: {asset.layoutKind.replace(/_/g, " ")}</Typography> : null}
              {asset.qualityReview?.topology ? <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Topology QA: {asset.qualityReview.topology} - Legend QA: {asset.qualityReview.legend ?? "PASS"}</Typography> : null}
              {asset.imageModel ? <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Image model: {asset.imageModel}</Typography> : null}
              {asset.provenance?.length ? <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Provenance: {asset.provenance.slice(0, 2).join(", ")}</Typography> : null}
              {asset.rationale ? <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{asset.rationale}</Typography> : null}
              {asset.warnings?.length ? <Typography variant="caption" color="warning.main" sx={{ display: "block", overflowWrap: "anywhere" }}>{asset.warnings.join(" ")}</Typography> : null}
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
          assetType: typeof record.assetType === "string" ? record.assetType : undefined,
          diagramKind: typeof record.diagramKind === "string" ? record.diagramKind : undefined,
          renderEngine: typeof record.renderEngine === "string" ? record.renderEngine : undefined,
          layoutKind: typeof record.layoutKind === "string" ? record.layoutKind : undefined,
          qualityReview: qualityReview(record.qualityReview),
          imageModel: typeof record.imageModel === "string" ? record.imageModel : undefined,
          provenance: stringArray(record.provenance),
          rationale: typeof record.rationale === "string" ? record.rationale : undefined,
          privacyStatus: typeof record.privacyStatus === "string" ? record.privacyStatus : undefined,
          warnings: stringArray(record.warnings),
          mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
        }]
      : [];
  });
}

function qualityReview(value: unknown): LinkedInVisualAssetView["qualityReview"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return {
    status: typeof record.status === "string" ? record.status : undefined,
    score: typeof record.score === "number" ? record.score : undefined,
    warnings: stringArray(record.warnings),
    topology: isRecord(record.checks) && typeof record.checks.topology === "string" ? record.checks.topology : undefined,
    legend: isRecord(record.checks) && typeof record.checks.legend === "string" ? record.checks.legend : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
