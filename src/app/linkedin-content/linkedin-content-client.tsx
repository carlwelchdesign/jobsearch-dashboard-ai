"use client";

import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status-chip";

export type LinkedInDraftView = {
  id: string;
  title: string;
  hook: string;
  body: string;
  hashtags: string[];
  contentPillar: string;
  sourceFacts: string[];
  screenshotAssets: Array<{ path: string; label: string; description: string }>;
  privacyReview: { status: "PASS" | "NEEDS_REVIEW"; warnings: string[] };
  status: string;
  createdAt: string;
};

const pillarOptions = [
  { value: "app_progress", label: "App progress" },
  { value: "search_learning", label: "Search learning" },
  { value: "architecture", label: "Architecture" },
  { value: "workflow_design", label: "Workflow design" },
];

export function LinkedInContentClient({ initialDrafts }: { initialDrafts: LinkedInDraftView[] }) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [contentPillar, setContentPillar] = useState("app_progress");
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function generateDraft() {
    setGenerating(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/linkedin-content/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentPillar }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to generate LinkedIn draft.");
      const refreshed = await fetch("/api/linkedin-content/drafts").then((item) => item.json());
      setDrafts((refreshed.drafts ?? []).map(toDraftView));
      setNotice("LinkedIn draft created for manual review.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate LinkedIn draft.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyDraft(draft: LinkedInDraftView) {
    const text = [draft.hook, "", draft.body, "", draft.hashtags.join(" ")].join("\n");
    await navigator.clipboard.writeText(text);
    setNotice("Draft copied to clipboard.");
  }

  async function archiveDraft(id: string) {
    const response = await fetch(`/api/linkedin-content/drafts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "ARCHIVED" }),
    });
    if (response.ok) {
      setDrafts((previous) => previous.filter((draft) => draft.id !== id));
      setNotice("Draft archived.");
    } else {
      setError("Unable to archive draft.");
    }
  }

  return (
    <Stack spacing={3} sx={{ mt: 3 }}>
      {notice ? <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert> : null}
      {error ? <Alert severity="error" onClose={() => setError("")}>{error}</Alert> : null}

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}>
            <Box>
              <Typography variant="h3">Generate a LinkedIn draft</Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                Draft-only. The app does not post to LinkedIn or request share scopes.
              </Typography>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ minWidth: { md: 420 } }}>
              <TextField select label="Content focus" value={contentPillar} onChange={(event) => setContentPillar(event.target.value)} size="small" fullWidth>
                {pillarOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </TextField>
              <Button variant="contained" startIcon={<AutoAwesomeOutlinedIcon />} disabled={generating} onClick={generateDraft}>
                {generating ? "Generating..." : "Generate"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {drafts.length === 0 ? (
        <EmptyState title="No LinkedIn drafts yet" body="Generate the first draft from recent app progress, source coverage, and workflow lessons." />
      ) : (
        <Stack spacing={2}>
          {drafts.map((draft) => (
            <Card key={draft.id}>
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "flex-start" } }}>
                    <Box>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                        <StatusChip status={draft.privacyReview.status === "PASS" ? "approved" : "needs_review"} />
                        <Chip size="small" variant="outlined" label={formatPillar(draft.contentPillar)} />
                        <Chip size="small" variant="outlined" label={new Date(draft.createdAt).toLocaleString()} />
                      </Stack>
                      <Typography variant="h3">{draft.title}</Typography>
                      <Typography color="text.secondary" sx={{ mt: 0.5 }}>{draft.hook}</Typography>
                    </Box>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                      <Button size="small" startIcon={<ContentCopyOutlinedIcon />} onClick={() => copyDraft(draft)}>Copy post</Button>
                      <Button size="small" color="warning" startIcon={<DeleteOutlineOutlinedIcon />} onClick={() => archiveDraft(draft.id)}>Archive</Button>
                    </Stack>
                  </Stack>

                  <Box sx={{ whiteSpace: "pre-wrap", border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, bgcolor: "background.default" }}>
                    <Typography>{draft.body}</Typography>
                    {draft.hashtags.length ? <Typography sx={{ mt: 2, fontWeight: 800 }}>{draft.hashtags.join(" ")}</Typography> : null}
                  </Box>

                  {draft.privacyReview.status === "PASS" ? (
                    <Alert severity="success">Privacy review passed. Screenshot downloads are safe aggregate/redacted assets.</Alert>
                  ) : (
                    <Alert severity="warning">
                      Screenshot downloads are blocked until privacy review passes. {draft.privacyReview.warnings.join(" ")}
                    </Alert>
                  )}

                  <Stack spacing={1}>
                    <Typography sx={{ fontWeight: 850 }}>Source facts used</Typography>
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                      {draft.sourceFacts.map((fact) => <Chip key={`${draft.id}-${fact}`} size="small" variant="outlined" label={fact} />)}
                    </Stack>
                  </Stack>

                  <Stack spacing={1}>
                    <Typography sx={{ fontWeight: 850 }}>Safe screenshot attachments</Typography>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                      {draft.screenshotAssets.map((asset) => (
                        <Button
                          key={asset.path}
                          component="a"
                          href={draft.privacyReview.status === "PASS" ? asset.path : undefined}
                          download
                          size="small"
                          variant="outlined"
                          disabled={draft.privacyReview.status !== "PASS"}
                          startIcon={<DownloadOutlinedIcon />}
                        >
                          {asset.label}
                        </Button>
                      ))}
                    </Stack>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
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
    contentPillar: String(draft.contentPillar ?? "app_progress"),
    sourceFacts: stringArray(draft.sourceFacts),
    screenshotAssets: screenshotAssets(draft.screenshotAssets),
    privacyReview: privacyReview(draft.privacyReview),
    status: String(draft.status ?? "DRAFT"),
    createdAt: String(draft.createdAt ?? new Date().toISOString()),
  };
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function screenshotAssets(value: unknown): LinkedInDraftView["screenshotAssets"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    return typeof record.path === "string" && typeof record.label === "string"
      ? [{ path: record.path, label: record.label, description: String(record.description ?? "") }]
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
