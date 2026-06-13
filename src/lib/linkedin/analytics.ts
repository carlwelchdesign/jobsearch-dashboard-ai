import type { LinkedInAnalyticsConnection, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeLinkedInScopes } from "@/lib/linkedin/share";

export type LinkedInAnalyticsTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

export type LinkedInAnalyticsMetricKey =
  | "impressions"
  | "membersReached"
  | "reactions"
  | "comments"
  | "reshares"
  | "postSaves"
  | "postSends"
  | "linkClicks"
  | "premiumCtaClicks"
  | "followersGainedFromContent"
  | "profileViewsFromContent";

export type LinkedInMetricSnapshotInput = {
  userId: string;
  linkedInPostUrn: string;
  linkedInPostId?: string | null;
  linkedInPostDraftId?: string | null;
  source: "API" | "CSV";
  aggregation: "TOTAL" | "DAILY";
  dateStart?: Date | null;
  dateEnd?: Date | null;
  capturedAt?: Date;
  metrics: Partial<Record<LinkedInAnalyticsMetricKey, number>>;
  rawPayload?: unknown;
};

export const linkedInAnalyticsScopes = ["openid", "profile", "email", "r_member_postAnalytics"];

const authorizeUrl = "https://www.linkedin.com/oauth/v2/authorization";
const tokenUrl = "https://www.linkedin.com/oauth/v2/accessToken";
const analyticsUrl = "https://api.linkedin.com/rest/memberCreatorPostAnalytics";
const linkedInVersion = process.env.LINKEDIN_API_VERSION?.trim() || "202605";

const metricMap: Record<string, LinkedInAnalyticsMetricKey> = {
  IMPRESSION: "impressions",
  MEMBERS_REACHED: "membersReached",
  REACTION: "reactions",
  COMMENT: "comments",
  RESHARE: "reshares",
  POST_SAVE: "postSaves",
  POST_SEND: "postSends",
  LINK_CLICKS: "linkClicks",
  PREMIUM_CTA_CLICKS: "premiumCtaClicks",
  FOLLOWER_GAINED_FROM_CONTENT: "followersGainedFromContent",
  PROFILE_VIEW_FROM_CONTENT: "profileViewsFromContent",
};

const totalMetricTypes = Object.keys(metricMap);
const dailyMetricTypes = ["IMPRESSION", "REACTION", "COMMENT", "RESHARE", "POST_SAVE", "POST_SEND"];

export function linkedInAnalyticsConfigured() {
  return Boolean(process.env.LINKEDIN_CLIENT_ID?.trim() && process.env.LINKEDIN_CLIENT_SECRET?.trim());
}

export function linkedInAnalyticsConfig(origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000") {
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("LinkedIn analytics is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.");
  }
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.LINKEDIN_ANALYTICS_REDIRECT_URI?.trim() || `${origin.replace(/\/+$/, "")}/api/auth/linkedin/analytics/callback`,
    authorizeUrl,
    tokenUrl,
    scopes: linkedInAnalyticsScopes,
  };
}

export function buildLinkedInAnalyticsAuthorizeUrl(input: { state: string; origin?: string }) {
  const config = linkedInAnalyticsConfig(input.origin);
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", config.scopes.join(" "));
  return url.toString();
}

export async function exchangeLinkedInAnalyticsCodeForToken(input: {
  code: string;
  origin?: string;
}): Promise<LinkedInAnalyticsTokenResponse> {
  const config = linkedInAnalyticsConfig(input.origin);
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

export async function saveLinkedInAnalyticsConnection(input: {
  userId: string;
  accessToken: string;
  expiresInSeconds?: number | null;
  scopes?: string[] | string | null;
  linkedinSubject?: string | null;
}) {
  const scopes = normalizeLinkedInScopes(input.scopes);
  const subject = input.linkedinSubject?.trim() || null;
  const personUrn = subject ? `urn:li:person:${subject}` : null;
  return prisma.linkedInAnalyticsConnection.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      linkedinSubject: subject,
      personUrn,
      accessToken: input.accessToken,
      expiresAt: input.expiresInSeconds ? new Date(Date.now() + input.expiresInSeconds * 1000) : null,
      scopes: scopes as Prisma.InputJsonValue,
      status: "CONNECTED",
      lastError: null,
    },
    update: {
      linkedinSubject: subject ?? undefined,
      personUrn: personUrn ?? undefined,
      accessToken: input.accessToken,
      expiresAt: input.expiresInSeconds ? new Date(Date.now() + input.expiresInSeconds * 1000) : null,
      scopes: scopes as Prisma.InputJsonValue,
      status: "CONNECTED",
      connectedAt: new Date(),
      lastError: null,
    },
  });
}

export async function syncLinkedInPostAnalytics(userId: string) {
  const connection = await prisma.linkedInAnalyticsConnection.findUnique({ where: { userId } });
  assertAnalyticsConnection(connection);
  const drafts = await prisma.linkedInPostDraft.findMany({
    where: {
      userId,
      status: "PUBLISHED",
      OR: [{ linkedInPostUrn: { not: null } }, { linkedInPostId: { not: null } }],
    },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });
  let snapshots = 0;
  try {
    for (const draft of drafts) {
      const urn = normalizePostUrn(draft.linkedInPostUrn ?? draft.linkedInPostId);
      if (!urn) continue;
      const totalMetrics = await fetchMetricGroup(connection!, urn, totalMetricTypes, "TOTAL");
      await upsertLinkedInMetricSnapshot({
        userId,
        linkedInPostDraftId: draft.id,
        linkedInPostUrn: urn,
        linkedInPostId: draft.linkedInPostId,
        source: "API",
        aggregation: "TOTAL",
        metrics: totalMetrics.metrics,
        rawPayload: totalMetrics.raw,
      });
      snapshots += 1;
      for (const metricType of dailyMetricTypes) {
        const daily = await fetchMetricGroup(connection!, urn, [metricType], "DAILY", lastThirtyDays());
        for (const item of daily.daily) {
          await upsertLinkedInMetricSnapshot({
            userId,
            linkedInPostDraftId: draft.id,
            linkedInPostUrn: urn,
            linkedInPostId: draft.linkedInPostId,
            source: "API",
            aggregation: "DAILY",
            dateStart: item.dateStart,
            dateEnd: item.dateEnd,
            metrics: item.metrics,
            rawPayload: item.raw,
          });
          snapshots += 1;
        }
      }
    }
    await prisma.linkedInAnalyticsConnection.update({
      where: { userId },
      data: { status: "CONNECTED", lastSyncedAt: new Date(), lastError: null },
    });
    return { posts: drafts.length, snapshots };
  } catch (error) {
    const message = error instanceof Error ? error.message : "LinkedIn analytics sync failed.";
    await prisma.linkedInAnalyticsConnection.update({
      where: { userId },
      data: { lastError: message },
    }).catch(() => undefined);
    throw error;
  }
}

export async function importLinkedInAnalyticsCsv(userId: string, csv: string) {
  const rows = parseCsv(csv);
  if (!rows.length) throw new Error("CSV import did not include any metric rows.");
  const drafts = await prisma.linkedInPostDraft.findMany({
    where: { userId, OR: [{ linkedInPostUrn: { not: null } }, { linkedInPostId: { not: null } }] },
    select: { id: true, linkedInPostUrn: true, linkedInPostId: true },
  });
  const draftByPost = new Map<string, string>();
  for (const draft of drafts) {
    for (const value of [draft.linkedInPostUrn, draft.linkedInPostId]) {
      const urn = normalizePostUrn(value);
      if (urn) draftByPost.set(urn, draft.id);
    }
  }
  let imported = 0;
  for (const row of rows) {
    const urn = normalizePostUrn(readCsv(row, ["postUrn", "linkedInPostUrn", "urn", "post"]));
    if (!urn) throw new Error("Every CSV row must include a postUrn or linkedInPostUrn value.");
    const date = parseCsvDate(readCsv(row, ["date", "dateStart", "day"]));
    const aggregation = date ? "DAILY" : "TOTAL";
    await upsertLinkedInMetricSnapshot({
      userId,
      linkedInPostDraftId: draftByPost.get(urn),
      linkedInPostUrn: urn,
      linkedInPostId: readCsv(row, ["postId", "linkedInPostId", "id"]),
      source: "CSV",
      aggregation,
      dateStart: date,
      dateEnd: date ? addDays(date, 1) : null,
      metrics: csvMetrics(row),
      rawPayload: row,
    });
    imported += 1;
  }
  return { imported };
}

export async function getLinkedInAnalyticsSummary(userId: string, range: "7d" | "30d" | "90d" | "365d" = "30d") {
  const since = new Date(Date.now() - rangeDays(range) * 24 * 60 * 60 * 1000);
  const [connection, snapshots] = await Promise.all([
    prisma.linkedInAnalyticsConnection.findUnique({ where: { userId } }),
    prisma.linkedInPostMetricSnapshot.findMany({
      where: {
        userId,
        OR: [
          { aggregation: "DAILY", dateStart: { gte: since } },
          { aggregation: "TOTAL" },
        ],
      },
      include: { draft: { select: { id: true, title: true, contentPillar: true, publishedAt: true } } },
      orderBy: [{ dateStart: "asc" }, { capturedAt: "asc" }],
      take: 1000,
    }),
  ]);
  const latestByPost = latestTotalSnapshots(snapshots);
  const daily = snapshots.filter((snapshot) => snapshot.aggregation === "DAILY" && snapshot.dateStart);
  const totals = sumSnapshots(latestByPost);
  const previousTotals = { impressions: 0, reactions: 0, comments: 0, reshares: 0 };
  const trend = buildTrend(daily);
  const topPosts = latestByPost
    .map((snapshot) => ({
      draftId: snapshot.linkedInPostDraftId,
      postUrn: snapshot.linkedInPostUrn,
      title: snapshot.draft?.title ?? snapshot.linkedInPostUrn,
      pillar: snapshot.draft?.contentPillar ?? "unknown",
      source: snapshot.source,
      impressions: snapshot.impressions,
      membersReached: snapshot.membersReached,
      engagement: snapshot.reactions + snapshot.comments + snapshot.reshares,
      engagementRate: rate(snapshot.reactions + snapshot.comments + snapshot.reshares, snapshot.impressions),
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 8);
  return {
    range,
    connection: {
      configured: linkedInAnalyticsConfigured(),
      connected: Boolean(connection?.status === "CONNECTED" && normalizeLinkedInScopes(connection.scopes).includes("r_member_postAnalytics")),
      status: connection?.status ?? null,
      scopes: normalizeLinkedInScopes(connection?.scopes),
      lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null,
      lastError: connection?.lastError ?? null,
    },
    freshness: {
      latestCapturedAt: snapshots.reduce<string | null>((latest, snapshot) => {
        const value = snapshot.capturedAt.toISOString();
        return !latest || value > latest ? value : latest;
      }, null),
      sources: Array.from(new Set(snapshots.map((snapshot) => snapshot.source))),
    },
    kpis: {
      ...totals,
      engagement: totals.reactions + totals.comments + totals.reshares,
      engagementRate: rate(totals.reactions + totals.comments + totals.reshares, totals.impressions),
      previousEngagement: previousTotals.reactions + previousTotals.comments + previousTotals.reshares,
    },
    trend,
    mix: [
      { label: "Reactions", value: totals.reactions },
      { label: "Comments", value: totals.comments },
      { label: "Reposts", value: totals.reshares },
      { label: "Saves", value: totals.postSaves },
      { label: "Sends", value: totals.postSends },
      { label: "Link clicks", value: totals.linkClicks },
    ].filter((item) => item.value > 0),
    topPosts,
  };
}

export async function upsertLinkedInMetricSnapshot(input: LinkedInMetricSnapshotInput) {
  const dateStart = input.dateStart ?? totalStartDate();
  const dateEnd = input.dateEnd ?? totalEndDate();
  const data = {
    userId: input.userId,
    linkedInPostDraftId: input.linkedInPostDraftId ?? null,
    linkedInPostUrn: input.linkedInPostUrn,
    linkedInPostId: input.linkedInPostId ?? null,
    source: input.source,
    aggregation: input.aggregation,
    dateStart,
    dateEnd,
    capturedAt: input.capturedAt ?? new Date(),
    ...completeMetrics(input.metrics),
    rawPayload: jsonValue(input.rawPayload ?? {}),
  };
  return prisma.linkedInPostMetricSnapshot.upsert({
    where: {
      userId_linkedInPostUrn_source_aggregation_dateStart_dateEnd: {
        userId: input.userId,
        linkedInPostUrn: input.linkedInPostUrn,
        source: input.source,
        aggregation: input.aggregation,
        dateStart,
        dateEnd,
      },
    },
    create: data,
    update: data,
  });
}

function assertAnalyticsConnection(connection?: LinkedInAnalyticsConnection | null) {
  if (!connection || connection.status !== "CONNECTED") throw new Error("LinkedIn analytics connection is not active.");
  const scopes = normalizeLinkedInScopes(connection.scopes);
  if (!scopes.includes("r_member_postAnalytics")) throw new Error("LinkedIn analytics connection is missing r_member_postAnalytics.");
  if (connection.expiresAt && connection.expiresAt.getTime() <= Date.now() + 60_000) throw new Error("LinkedIn analytics token is expired. Reconnect analytics.");
}

async function fetchMetricGroup(
  connection: LinkedInAnalyticsConnection,
  urn: string,
  metricTypes: string[],
  aggregation: "TOTAL" | "DAILY",
  dateRange?: { start: Date; end: Date },
) {
  const raw: unknown[] = [];
  const metrics: Partial<Record<LinkedInAnalyticsMetricKey, number>> = {};
  const daily: Array<{ dateStart: Date; dateEnd: Date; metrics: Partial<Record<LinkedInAnalyticsMetricKey, number>>; raw: unknown }> = [];
  for (const metricType of metricTypes) {
    const url = new URL(analyticsUrl);
    url.searchParams.set("q", "entity");
    url.searchParams.set("entity", entityParam(urn));
    url.searchParams.set("queryType", metricType);
    url.searchParams.set("aggregation", aggregation);
    if (dateRange) url.searchParams.set("dateRange", dateRangeParam(dateRange.start, dateRange.end));
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": linkedInVersion,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) throw new Error(`LinkedIn analytics returned HTTP ${response.status}: ${await safeResponseText(response)}`);
    const body = await response.json();
    raw.push(body);
    for (const element of Array.isArray(body?.elements) ? body.elements : []) {
      const key = metricMap[metricType];
      if (!key) continue;
      const count = toCount(element?.count);
      const range = parseLinkedInDateRange(element?.dateRange);
      if (aggregation === "DAILY" && range) {
        daily.push({ dateStart: range.start, dateEnd: range.end, metrics: { [key]: count }, raw: element });
      } else {
        metrics[key] = (metrics[key] ?? 0) + count;
      }
    }
  }
  return { metrics, daily: mergeDaily(daily), raw };
}

function parseCsv(csv: string) {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => normalizeHeader(header));
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index]?.trim() ?? "";
      return row;
    }, {});
  });
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function csvMetrics(row: Record<string, string>): Partial<Record<LinkedInAnalyticsMetricKey, number>> {
  return Object.entries(metricMap).reduce<Partial<Record<LinkedInAnalyticsMetricKey, number>>>((acc, [external, internal]) => {
    const value = readCsv(row, [internal, external, external.toLowerCase()]);
    if (value) acc[internal] = toCount(value);
    return acc;
  }, {});
}

function readCsv(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[normalizeHeader(key)];
    if (value) return value;
  }
  return "";
}

function normalizeHeader(value: string) {
  return value.trim().replace(/[\s_-]+/g, "").toLowerCase();
}

function parseCsvDate(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid CSV date: ${value}`);
  return date;
}

function normalizePostUrn(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("urn:li:")) return trimmed;
  if (/^\d+$/.test(trimmed)) return `urn:li:ugcPost:${trimmed}`;
  return trimmed;
}

function entityParam(urn: string) {
  const type = urn.includes(":share:") ? "share" : "ugc";
  return `(${type}:${urn})`;
}

function dateRangeParam(start: Date, end: Date) {
  return `(start:(day:${start.getUTCDate()},month:${start.getUTCMonth() + 1},year:${start.getUTCFullYear()}),end:(day:${end.getUTCDate()},month:${end.getUTCMonth() + 1},year:${end.getUTCFullYear()}))`;
}

function parseLinkedInDateRange(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const start = linkedInDate(record.start);
  const end = linkedInDate(record.end);
  return start && end ? { start, end } : null;
}

function linkedInDate(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const year = Number(record.year);
  const month = Number(record.month);
  const day = Number(record.day);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function mergeDaily(items: Array<{ dateStart: Date; dateEnd: Date; metrics: Partial<Record<LinkedInAnalyticsMetricKey, number>>; raw: unknown }>) {
  const byDate = new Map<string, { dateStart: Date; dateEnd: Date; metrics: Partial<Record<LinkedInAnalyticsMetricKey, number>>; raw: unknown[] }>();
  for (const item of items) {
    const key = item.dateStart.toISOString();
    const existing = byDate.get(key) ?? { dateStart: item.dateStart, dateEnd: item.dateEnd, metrics: {}, raw: [] };
    for (const [metric, value] of Object.entries(item.metrics)) {
      const key = metric as LinkedInAnalyticsMetricKey;
      existing.metrics[key] = (existing.metrics[key] ?? 0) + (value ?? 0);
    }
    existing.raw.push(item.raw);
    byDate.set(key, existing);
  }
  return Array.from(byDate.values());
}

function completeMetrics(metrics: Partial<Record<LinkedInAnalyticsMetricKey, number>>) {
  return {
    impressions: toCount(metrics.impressions),
    membersReached: toCount(metrics.membersReached),
    reactions: toCount(metrics.reactions),
    comments: toCount(metrics.comments),
    reshares: toCount(metrics.reshares),
    postSaves: toCount(metrics.postSaves),
    postSends: toCount(metrics.postSends),
    linkClicks: toCount(metrics.linkClicks),
    premiumCtaClicks: toCount(metrics.premiumCtaClicks),
    followersGainedFromContent: toCount(metrics.followersGainedFromContent),
    profileViewsFromContent: toCount(metrics.profileViewsFromContent),
  };
}

function latestTotalSnapshots<T extends { aggregation: string; linkedInPostUrn: string; source: string; capturedAt: Date }>(snapshots: T[]) {
  const totals = snapshots.filter((snapshot) => snapshot.aggregation === "TOTAL");
  const byPost = new Map<string, T>();
  for (const snapshot of totals) {
    const existing = byPost.get(snapshot.linkedInPostUrn);
    if (!existing || snapshot.capturedAt > existing.capturedAt || (snapshot.capturedAt.getTime() === existing.capturedAt.getTime() && snapshot.source === "API")) {
      byPost.set(snapshot.linkedInPostUrn, snapshot);
    }
  }
  return Array.from(byPost.values());
}

function sumSnapshots(snapshots: Array<ReturnType<typeof completeMetrics>>) {
  return snapshots.reduce((acc, snapshot) => ({
    impressions: acc.impressions + snapshot.impressions,
    membersReached: acc.membersReached + snapshot.membersReached,
    reactions: acc.reactions + snapshot.reactions,
    comments: acc.comments + snapshot.comments,
    reshares: acc.reshares + snapshot.reshares,
    postSaves: acc.postSaves + snapshot.postSaves,
    postSends: acc.postSends + snapshot.postSends,
    linkClicks: acc.linkClicks + snapshot.linkClicks,
    premiumCtaClicks: acc.premiumCtaClicks + snapshot.premiumCtaClicks,
    followersGainedFromContent: acc.followersGainedFromContent + snapshot.followersGainedFromContent,
    profileViewsFromContent: acc.profileViewsFromContent + snapshot.profileViewsFromContent,
  }), completeMetrics({}));
}

function buildTrend(snapshots: Array<ReturnType<typeof completeMetrics> & { dateStart: Date | null }>) {
  const byDate = new Map<string, ReturnType<typeof completeMetrics> & { label: string }>();
  for (const snapshot of snapshots) {
    if (!snapshot.dateStart) continue;
    const label = snapshot.dateStart.toISOString().slice(0, 10);
    const existing = byDate.get(label) ?? { label, ...completeMetrics({}) };
    const summed = sumSnapshots([existing, snapshot]);
    byDate.set(label, { label, ...summed });
  }
  return Array.from(byDate.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function lastThirtyDays() {
  return { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date(Date.now() + 24 * 60 * 60 * 1000) };
}

function rangeDays(range: string) {
  if (range === "7d") return 7;
  if (range === "90d") return 90;
  if (range === "365d") return 365;
  return 30;
}

function totalStartDate() {
  return new Date(Date.UTC(1970, 0, 1));
}

function totalEndDate() {
  return new Date(Date.UTC(9999, 11, 31));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toCount(value: unknown) {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function rate(value: number, total: number) {
  return total > 0 ? value / total : 0;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

async function safeResponseText(response: Response) {
  return (await response.text().catch(() => "")).slice(0, 300);
}
