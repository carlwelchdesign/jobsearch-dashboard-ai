import { readFile } from "fs/promises";
import path from "path";
import type { LinkedInPostDraft, LinkedInShareConnection, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type LinkedInShareTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type LinkedInShareAsset = {
  path: string;
  label?: string;
  description?: string;
  privacyStatus?: string;
  mimeType?: string;
};

export const linkedInShareScopes = ["openid", "profile", "email", "w_member_social"];

const authorizeUrl = "https://www.linkedin.com/oauth/v2/authorization";
const tokenUrl = "https://www.linkedin.com/oauth/v2/accessToken";
const userInfoUrl = "https://api.linkedin.com/v2/userinfo";
const ugcPostsUrl = "https://api.linkedin.com/v2/ugcPosts";
const assetsUrl = "https://api.linkedin.com/v2/assets?action=registerUpload";

export function linkedInShareConfigured() {
  return Boolean(process.env.LINKEDIN_CLIENT_ID?.trim() && process.env.LINKEDIN_CLIENT_SECRET?.trim());
}

export function linkedInShareConfig(origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000") {
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("LinkedIn publishing is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.");
  }

  return {
    clientId,
    clientSecret,
    redirectUri: process.env.LINKEDIN_SHARE_REDIRECT_URI?.trim() || `${origin.replace(/\/+$/, "")}/api/auth/linkedin/share/callback`,
    authorizeUrl,
    tokenUrl,
    userInfoUrl,
    scopes: linkedInShareScopes,
  };
}

export function buildLinkedInShareAuthorizeUrl(input: { state: string; origin?: string }) {
  const config = linkedInShareConfig(input.origin);
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", config.scopes.join(" "));
  return url.toString();
}

export async function exchangeLinkedInShareCodeForToken(input: {
  code: string;
  origin?: string;
}): Promise<LinkedInShareTokenResponse> {
  const config = linkedInShareConfig(input.origin);
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }),
  });

  return response.json().catch(() => ({ error: "invalid_token_response" }));
}

export async function saveLinkedInShareConnection(input: {
  userId: string;
  accessToken: string;
  expiresInSeconds?: number | null;
  scopes?: string[] | string | null;
  linkedinSubject?: string | null;
}) {
  const scopes = normalizeScopes(input.scopes);
  const subject = input.linkedinSubject?.trim() || null;
  const personUrn = subject ? `urn:li:person:${subject}` : null;
  return prisma.linkedInShareConnection.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      linkedinSubject: subject,
      personUrn,
      accessToken: input.accessToken,
      expiresAt: input.expiresInSeconds ? new Date(Date.now() + input.expiresInSeconds * 1000) : null,
      scopes: scopes as Prisma.InputJsonValue,
      status: "CONNECTED",
    },
    update: {
      linkedinSubject: subject ?? undefined,
      personUrn: personUrn ?? undefined,
      accessToken: input.accessToken,
      expiresAt: input.expiresInSeconds ? new Date(Date.now() + input.expiresInSeconds * 1000) : null,
      scopes: scopes as Prisma.InputJsonValue,
      status: "CONNECTED",
      connectedAt: new Date(),
    },
  });
}

export async function publishLinkedInDraft(draftId: string) {
  const draft = await prisma.linkedInPostDraft.findUnique({
    where: { id: draftId },
    include: { user: { include: { linkedinShareConnection: true } } },
  });
  if (!draft) throw new Error("LinkedIn draft not found.");
  if (!["APPROVED", "FAILED"].includes(draft.status)) throw new Error("Draft must be approved before publishing.");

  const connection = draft.user.linkedinShareConnection;
  try {
    assertShareConnection(connection);
    assertDraftPublishable(draft);

    await prisma.linkedInPostDraft.update({
      where: { id: draft.id },
      data: { status: "PUBLISHING", publishError: null },
    });

    const postText = formatPostText(draft);
    const selectedScreenshots = screenshotAssets(draft.selectedScreenshots);
    const mediaAssets = selectedScreenshots.length
      ? [await uploadLinkedInImage(connection!, selectedScreenshots[0])]
      : [];
    const payload = buildLinkedInUgcPostPayload({
      authorUrn: connection!.personUrn!,
      text: postText,
      mediaAssets,
    });
    const response = await fetch(ugcPostsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection!.accessToken}`,
        "content-type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`LinkedIn publish returned HTTP ${response.status}: ${await safeResponseText(response)}`);

    const linkedInPostId = response.headers.get("x-restli-id") ?? undefined;
    const publishedAt = new Date();
    const updated = await prisma.linkedInPostDraft.update({
      where: { id: draft.id },
      data: {
        status: "PUBLISHED",
        publishedAt,
        linkedInPostId,
        linkedInPostUrn: linkedInPostId,
        publishPayload: payload as Prisma.InputJsonValue,
        publishError: null,
      },
    });
    await prisma.linkedInShareConnection.update({
      where: { userId: draft.userId },
      data: { lastPublishedAt: publishedAt, status: "CONNECTED" },
    });
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : "LinkedIn publish failed.";
    await prisma.linkedInPostDraft.update({
      where: { id: draft.id },
      data: { status: "FAILED", publishError: message },
    });
    throw error;
  }
}

export function buildLinkedInUgcPostPayload(input: {
  authorUrn: string;
  text: string;
  mediaAssets?: Array<{ asset: string; title?: string; description?: string }>;
}) {
  const mediaAssets = input.mediaAssets ?? [];
  return {
    author: input.authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: input.text },
        shareMediaCategory: mediaAssets.length ? "IMAGE" : "NONE",
        ...(mediaAssets.length ? {
          media: mediaAssets.map((asset) => ({
            status: "READY",
            media: asset.asset,
            title: { text: asset.title ?? "Job Search OS workflow screenshot" },
            description: { text: asset.description ?? "Redacted workflow screenshot from Job Search OS." },
          })),
        } : {}),
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };
}

function assertShareConnection(connection?: LinkedInShareConnection | null) {
  if (!connection || connection.status !== "CONNECTED") throw new Error("LinkedIn publishing connection is not active.");
  const scopes = normalizeScopes(connection.scopes);
  if (!scopes.includes("w_member_social")) throw new Error("LinkedIn publishing connection is missing w_member_social.");
  if (!connection.personUrn) throw new Error("LinkedIn publishing connection is missing a person URN.");
  if (connection.expiresAt && connection.expiresAt.getTime() <= Date.now() + 60_000) throw new Error("LinkedIn publishing token is expired. Reconnect LinkedIn publishing.");
}

function assertDraftPublishable(draft: Pick<LinkedInPostDraft, "privacyReview" | "claims" | "body" | "hook">) {
  const review = objectValue(draft.privacyReview);
  if (review.status !== "PASS") throw new Error("Draft privacy review must pass before publishing.");
  const claims = Array.isArray(draft.claims) ? draft.claims : [];
  const ungrounded = claims.some((claim) => {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) return false;
    const record = claim as Record<string, unknown>;
    return record.provenance === "missing" || record.status === "ungrounded";
  });
  if (ungrounded) throw new Error("Draft contains ungrounded public claims.");
}

function formatPostText(draft: Pick<LinkedInPostDraft, "hook" | "body" | "hashtags" | "disclosureText">) {
  return [
    draft.hook.trim(),
    "",
    draft.body.trim(),
    draft.disclosureText?.trim() ? ["", draft.disclosureText.trim()].join("") : "",
    "",
    normalizeStringArray(draft.hashtags).join(" "),
  ].filter((part) => part.trim().length > 0).join("\n");
}

async function uploadLinkedInImage(connection: LinkedInShareConnection, asset: LinkedInShareAsset) {
  const registerResponse = await fetch(assetsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      "content-type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: connection.personUrn,
        serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
      },
    }),
  });
  if (!registerResponse.ok) throw new Error(`LinkedIn image registration returned HTTP ${registerResponse.status}: ${await safeResponseText(registerResponse)}`);
  const registered = await registerResponse.json();
  const uploadUrl = registered?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
  const digitalAsset = registered?.value?.asset;
  if (typeof uploadUrl !== "string" || typeof digitalAsset !== "string") throw new Error("LinkedIn image registration did not return upload details.");

  const bytes = await readFile(publicAssetPath(asset.path));
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${connection.accessToken}` },
    body: bytes,
  });
  if (!uploadResponse.ok) throw new Error(`LinkedIn image upload returned HTTP ${uploadResponse.status}: ${await safeResponseText(uploadResponse)}`);
  return {
    asset: digitalAsset,
    title: asset.label,
    description: asset.description,
  };
}

function publicAssetPath(publicPath: string) {
  const normalized = publicPath.replace(/^\/+/, "");
  if (normalized.includes("..")) throw new Error("Invalid screenshot asset path.");
  return path.join(process.cwd(), "public", normalized.replace(/^public\//, ""));
}

function normalizeScopes(value: unknown): string[] {
  if (typeof value === "string") return value.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return linkedInShareScopes;
}

function screenshotAssets(value: unknown): LinkedInShareAsset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.path !== "string" || record.privacyStatus !== "PASS") return [];
    return [{
      path: record.path,
      label: typeof record.label === "string" ? record.label : undefined,
      description: typeof record.description === "string" ? record.description : undefined,
      privacyStatus: "PASS",
      mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
    }];
  });
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function safeResponseText(response: Response) {
  return (await response.text().catch(() => "")).slice(0, 300);
}
