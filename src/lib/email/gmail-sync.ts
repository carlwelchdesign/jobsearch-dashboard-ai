import type { EmailOAuthConnection, User } from "@prisma/client";
import { ingestJobEmail } from "@/lib/email-response-agent";
import { emailOAuthConfig } from "@/lib/email/oauth";
import { prisma } from "@/lib/prisma";

type GmailListResponse = {
  messages?: Array<{ id: string; threadId?: string }>;
};

type GmailMessageResponse = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: GmailMessageResponse["payload"][];
  };
};

export type GmailSyncResult = {
  ok: true;
  provider: "gmail";
  scanned: number;
  ingested: number;
  suppressed: number;
  skipped: number;
  queries: string[];
  suppressionReasons: Array<{ providerMessageId: string; subject: string; classification: string; reason: string }>;
  messages: Array<{
    providerMessageId: string;
    subject: string;
    classification: string;
    matchedApplicationId: string | null;
    matchedJobPostingId: string | null;
  }>;
};

export async function syncGmailEmail(input: {
  user: User;
  connection: EmailOAuthConnection;
  limit?: number;
  sinceDays?: number;
  queries?: string[];
}): Promise<GmailSyncResult> {
  const limit = clampInteger(Number(input.limit ?? process.env.JOB_EMAIL_GMAIL_LIMIT ?? process.env.JOB_EMAIL_SYNC_LIMIT ?? 25), 1, 100);
  const sinceDays = clampInteger(Number(input.sinceDays ?? process.env.JOB_EMAIL_GMAIL_SINCE_DAYS ?? process.env.JOB_EMAIL_SYNC_SINCE_DAYS ?? 14), 1, 120);
  const accessToken = await validAccessToken(input.connection);
  const queries = input.queries?.length ? input.queries : [`newer_than:${sinceDays}d`];
  const refsById = new Map<string, { id: string; threadId?: string }>();

  for (const query of queries) {
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("maxResults", String(limit));
    listUrl.searchParams.set("q", query);
    const listResponse = await gmailFetch<GmailListResponse>(listUrl.toString(), accessToken);
    for (const ref of listResponse.messages ?? []) refsById.set(ref.id, ref);
  }

  const refs = Array.from(refsById.values()).slice(0, limit);
  const messages: GmailSyncResult["messages"] = [];
  const suppressionReasons: GmailSyncResult["suppressionReasons"] = [];
  let skipped = 0;
  let suppressed = 0;

  for (const ref of refs) {
    const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(ref.id)}`);
    detailUrl.searchParams.set("format", "full");
    const detail = await gmailFetch<GmailMessageResponse>(detailUrl.toString(), accessToken);
    const ingestInput = gmailMessageToIngestInput(input.user.id, detail);

    if (!ingestInput.subject && !ingestInput.bodyText && !ingestInput.snippet) {
      skipped += 1;
      continue;
    }

    const result = await ingestJobEmail(ingestInput);
    if (result.classification.classification === "UNRELATED" || result.classification.classification === "NO_ACTION") {
      suppressed += 1;
      suppressionReasons.push({
        providerMessageId: ingestInput.providerMessageId,
        subject: ingestInput.subject,
        classification: result.classification.classification,
        reason: result.classification.rationale,
      });
    }
    messages.push({
      providerMessageId: ingestInput.providerMessageId,
      subject: ingestInput.subject,
      classification: result.classification.classification,
      matchedApplicationId: result.match.applicationId,
      matchedJobPostingId: result.match.jobPostingId,
    });
  }

  await prisma.emailOAuthConnection.update({
    where: { id: input.connection.id },
    data: { lastSyncAt: new Date(), status: "CONNECTED" },
  });

  return {
    ok: true,
    provider: "gmail",
    scanned: refs.length,
    ingested: messages.length,
    suppressed,
    skipped,
    queries,
    suppressionReasons,
    messages,
  };
}

async function validAccessToken(connection: EmailOAuthConnection) {
  if (!connection.expiresAt || connection.expiresAt.getTime() > Date.now() + 60_000) return connection.accessToken;
  if (!connection.refreshToken) {
    await prisma.emailOAuthConnection.update({
      where: { id: connection.id },
      data: { status: "NEEDS_REAUTH" },
    });
    throw new Error("Gmail connection needs reauthorization.");
  }

  const config = emailOAuthConfig("gmail");
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  const token = await response.json().catch(() => ({})) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };

  if (!response.ok || !token.access_token) {
    await prisma.emailOAuthConnection.update({
      where: { id: connection.id },
      data: { status: "NEEDS_REAUTH" },
    });
    throw new Error(token.error_description ?? token.error ?? "Gmail token refresh failed.");
  }

  const updated = await prisma.emailOAuthConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: token.access_token,
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      status: "CONNECTED",
    },
  });

  return updated.accessToken;
}

async function gmailFetch<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error?.message === "string" ? payload.error.message : `Gmail returned ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

function gmailMessageToIngestInput(userId: string, message: GmailMessageResponse) {
  const headers = new Map((message.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
  const receivedAt = message.internalDate ? new Date(Number(message.internalDate)) : parseDate(headers.get("date"));
  const bodyText = decodeBody(message.payload);

  return {
    userId,
    provider: "gmail" as const,
    providerMessageId: message.id,
    threadId: message.threadId ?? null,
    from: headers.get("from") ?? "unknown sender",
    to: splitAddresses(headers.get("to")),
    subject: headers.get("subject")?.trim() || "(no subject)",
    receivedAt,
    snippet: message.snippet ?? bodyText.slice(0, 240),
    bodyText: bodyText || message.snippet || null,
    rawMetadataJson: {
      gmailMessageId: message.id,
      gmailThreadId: message.threadId ?? null,
      rfcMessageId: headers.get("message-id") ?? null,
      inReplyTo: headers.get("in-reply-to") ?? null,
    },
  };
}

function decodeBody(payload: GmailMessageResponse["payload"]): string {
  if (!payload) return "";
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return (payload.parts ?? []).map((part) => decodeBody(part)).filter(Boolean).join("\n\n").trim();
}

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8").replace(/\s+/g, " ").trim();
}

function splitAddresses(value: string | undefined) {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

function parseDate(value: string | undefined) {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
