export const metadata = {
  title: "LinkedIn Content | Job Search OS",
  description: "Generate safe LinkedIn post drafts and redacted share-preview screenshots.",
};

import { AppShell } from "@/app/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { prisma } from "@/lib/prisma";
import { LinkedInContentClient, type LinkedInDraftView } from "./linkedin-content-client";
import type { LinkedInPostDraft } from "@prisma/client";

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

  return (
    <AppShell>
      <PageHeader
        eyebrow="Draft-only publishing"
        title="LinkedIn Content"
        description="Generate engaging, technically grounded LinkedIn post drafts and redacted share-preview screenshots. Nothing is posted to LinkedIn from this app."
      />
      <LinkedInContentClient initialDrafts={drafts.map(toDraftView)} />
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
    contentPillar: draft.contentPillar,
    sourceFacts: stringArray(draft.sourceFacts),
    screenshotAssets: screenshotAssets(draft.screenshotAssets),
    privacyReview: privacyReview(draft.privacyReview),
    status: draft.status,
    createdAt: draft.createdAt.toISOString(),
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
      ? [{
          path: record.path,
          label: record.label,
          description: typeof record.description === "string" ? record.description : "",
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
