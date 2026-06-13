export const metadata = {
  title: "LinkedIn Content | Job Search OS",
  description: "Generate, review, and publish memory-aware LinkedIn posts with agent reviews and redacted app screenshots.",
};

import { AppShell } from "@/app/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { linkedInShareConfigured } from "@/lib/linkedin/share";
import { prisma } from "@/lib/prisma";
import { LinkedInContentClient, type LinkedInDraftView, type LinkedInShareConnectionView } from "./linkedin-content-client";
import type { LinkedInPostDraft, LinkedInShareConnection } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function LinkedInContentPage() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  const drafts = user
    ? await prisma.linkedInPostDraft.findMany({
        where: { userId: user.id, status: { not: "ARCHIVED" } },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];
  const shareConnection = user
    ? await prisma.linkedInShareConnection.findUnique({ where: { userId: user.id } })
    : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Agent publishing"
        title="LinkedIn Content"
        description="Generate memory-aware posts from recent app work, review agent-team notes, approve safe screenshots, and publish through Share on LinkedIn."
      />
      <LinkedInContentClient initialDrafts={drafts.map(toDraftView)} shareConnection={toShareConnectionView(shareConnection)} />
    </AppShell>
  );
}

function toDraftView(draft: LinkedInPostDraft): LinkedInDraftView {
  return {
    id: draft.id,
    title: draft.title,
    hook: draft.hook,
    body: draft.body,
    hashtags: stringArray(draft.hashtags),
    disclosureText: draft.disclosureText ?? "",
    contentPillar: draft.contentPillar,
    sourceFacts: stringArray(draft.sourceFacts),
    memorySources: objectArray(draft.memorySources),
    analyticsSources: objectArray(draft.analyticsSources),
    agentReviews: objectArray(draft.agentReviews),
    claims: objectArray(draft.claims),
    risks: stringArray(draft.risks),
    screenshotAssets: screenshotAssets(draft.screenshotAssets),
    selectedScreenshots: screenshotAssets(draft.selectedScreenshots),
    privacyReview: privacyReview(draft.privacyReview),
    status: draft.status,
    publishError: draft.publishError,
    linkedInPostId: draft.linkedInPostId,
    createdAt: draft.createdAt.toISOString(),
    approvedAt: draft.approvedAt?.toISOString() ?? null,
    publishedAt: draft.publishedAt?.toISOString() ?? null,
  };
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

function toShareConnectionView(connection: LinkedInShareConnection | null): LinkedInShareConnectionView {
  return {
    configured: linkedInShareConfigured(),
    connected: Boolean(connection?.status === "CONNECTED" && stringArray(connection.scopes).includes("w_member_social")),
    status: connection?.status ?? null,
    scopes: stringArray(connection?.scopes),
    lastPublishedAt: connection?.lastPublishedAt?.toISOString() ?? null,
  };
}
