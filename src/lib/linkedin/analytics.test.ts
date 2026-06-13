import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  buildLinkedInAnalyticsAuthorizeUrl,
  getLinkedInAnalyticsSummary,
  importLinkedInAnalyticsCsv,
  syncLinkedInPostAnalytics,
} from "@/lib/linkedin/analytics";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    linkedInAnalyticsConnection: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    linkedInPostDraft: {
      findMany: vi.fn(),
    },
    linkedInPostMetricSnapshot: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const connectionFindUniqueMock = vi.mocked(prisma.linkedInAnalyticsConnection.findUnique);
const connectionUpdateMock = vi.mocked(prisma.linkedInAnalyticsConnection.update);
const draftFindManyMock = vi.mocked(prisma.linkedInPostDraft.findMany);
const snapshotFindManyMock = vi.mocked(prisma.linkedInPostMetricSnapshot.findMany);
const snapshotUpsertMock = vi.mocked(prisma.linkedInPostMetricSnapshot.upsert);

describe("LinkedIn analytics helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("LINKEDIN_CLIENT_ID", "client_1");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "secret_1");
    snapshotUpsertMock.mockResolvedValue({ id: "snapshot_1" } as never);
  });

  it("builds an analytics authorization URL with r_member_postAnalytics", () => {
    const url = new URL(buildLinkedInAnalyticsAuthorizeUrl({ state: "state_1", origin: "http://localhost:3000" }));

    expect(url.searchParams.get("scope")).toContain("r_member_postAnalytics");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/linkedin/analytics/callback");
  });

  it("imports CSV metrics and links known drafts by post URN", async () => {
    draftFindManyMock.mockResolvedValue([
      { id: "draft_1", linkedInPostUrn: "urn:li:ugcPost:123", linkedInPostId: null },
    ] as never);

    const result = await importLinkedInAnalyticsCsv("user_1", [
      "postUrn,date,impressions,membersReached,reactions,comments,reshares,postSaves,linkClicks",
      "urn:li:ugcPost:123,2026-06-13,1200,840,32,6,3,5,14",
    ].join("\n"));

    expect(result.imported).toBe(1);
    expect(snapshotUpsertMock).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        userId: "user_1",
        linkedInPostDraftId: "draft_1",
        linkedInPostUrn: "urn:li:ugcPost:123",
        source: "CSV",
        aggregation: "DAILY",
        impressions: 1200,
        membersReached: 840,
        reactions: 32,
        comments: 6,
        reshares: 3,
        postSaves: 5,
        linkClicks: 14,
      }),
    }));
  });

  it("summarizes latest post totals into executive KPIs", async () => {
    connectionFindUniqueMock.mockResolvedValue({
      status: "CONNECTED",
      scopes: ["openid", "profile", "email", "r_member_postAnalytics"],
      lastSyncedAt: new Date("2026-06-13T12:00:00Z"),
      lastError: null,
    } as never);
    snapshotFindManyMock.mockResolvedValue([
      metricSnapshot({ linkedInPostUrn: "urn:li:ugcPost:1", impressions: 1000, membersReached: 700, reactions: 20, comments: 4, reshares: 1 }),
      metricSnapshot({ linkedInPostUrn: "urn:li:ugcPost:2", impressions: 500, membersReached: 300, reactions: 8, comments: 1, reshares: 1, postSaves: 2 }),
      metricSnapshot({ linkedInPostUrn: "urn:li:ugcPost:1", aggregation: "DAILY", dateStart: new Date("2026-06-12T00:00:00Z"), impressions: 300, reactions: 5 }),
    ] as never);

    const summary = await getLinkedInAnalyticsSummary("user_1", "30d");

    expect(summary.connection.connected).toBe(true);
    expect(summary.kpis.impressions).toBe(1500);
    expect(summary.kpis.membersReached).toBe(1000);
    expect(summary.kpis.engagement).toBe(35);
    expect(summary.kpis.engagementRate).toBeCloseTo(35 / 1500);
    expect(summary.topPosts[0].postUrn).toBe("urn:li:ugcPost:1");
    expect(summary.trend[0]).toMatchObject({ label: "2026-06-12", impressions: 300, reactions: 5 });
  });

  it("syncs published posts through the LinkedIn analytics API", async () => {
    connectionFindUniqueMock.mockResolvedValue({
      status: "CONNECTED",
      accessToken: "access_1",
      scopes: ["r_member_postAnalytics"],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    } as never);
    connectionUpdateMock.mockResolvedValue({ id: "connection_1" } as never);
    draftFindManyMock.mockResolvedValue([
      { id: "draft_1", linkedInPostUrn: "urn:li:ugcPost:123", linkedInPostId: "urn:li:ugcPost:123", publishedAt: new Date() },
    ] as never);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const parsed = new URL(url);
      const metric = parsed.searchParams.get("queryType") ?? "IMPRESSION";
      const daily = parsed.searchParams.get("aggregation") === "DAILY";
      return new Response(JSON.stringify({
        elements: [{
          count: metric === "IMPRESSION" ? 100 : 3,
          metricType: metric,
          ...(daily ? { dateRange: { start: { year: 2026, month: 6, day: 12 }, end: { year: 2026, month: 6, day: 13 } } } : {}),
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const result = await syncLinkedInPostAnalytics("user_1");

    expect(result.posts).toBe(1);
    expect(result.snapshots).toBeGreaterThan(1);
    expect(snapshotUpsertMock).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ linkedInPostDraftId: "draft_1", source: "API" }),
    }));
    expect(connectionUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user_1" },
      data: expect.objectContaining({ status: "CONNECTED", lastError: null }),
    }));
  });
});

function metricSnapshot(input: Partial<Record<string, unknown>>) {
  return {
    id: "snapshot",
    linkedInPostDraftId: null,
    linkedInPostUrn: "urn:li:ugcPost:1",
    linkedInPostId: null,
    source: "CSV",
    aggregation: "TOTAL",
    dateStart: new Date("1970-01-01T00:00:00Z"),
    dateEnd: new Date("9999-12-31T00:00:00Z"),
    capturedAt: new Date("2026-06-13T12:00:00Z"),
    impressions: 0,
    membersReached: 0,
    reactions: 0,
    comments: 0,
    reshares: 0,
    postSaves: 0,
    postSends: 0,
    linkClicks: 0,
    premiumCtaClicks: 0,
    followersGainedFromContent: 0,
    profileViewsFromContent: 0,
    draft: { id: "draft_1", title: "Post title", contentPillar: "app_progress", publishedAt: new Date("2026-06-12T00:00:00Z") },
    ...input,
  };
}
