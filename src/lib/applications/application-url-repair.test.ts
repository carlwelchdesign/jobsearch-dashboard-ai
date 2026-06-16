import { beforeEach, describe, expect, it, vi } from "vitest";
import { repairApplicationUrls } from "@/lib/applications/application-url-repair";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/applications/state-transitions", () => ({
  transitionApplicationState: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobPosting: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const findManyMock = vi.mocked(prisma.jobPosting.findMany);

describe("repairApplicationUrls", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
  });

  it("does not resolve Working Nomads tracker assets as application URLs", async () => {
    findManyMock.mockResolvedValue([
      job({
        rawData: {
          item: {
            description: '<a href="https://www.googletagmanager.com/gtm.js?id=GTM-123">Apply now</a>',
          },
        },
      }),
    ] as never);

    const result = await repairApplicationUrls();

    expect(result).toMatchObject({
      mode: "dry-run",
      candidates: 1,
      resolved: 0,
      cleared: 1,
      applicationsMoved: 1,
    });
    expect(result.items[0]).toMatchObject({
      action: "cleared",
      previousUrl: "https://www.workingnomads.com/job/go/1641404/",
    });
  });

  it("resolves Working Nomads links when they point to direct application targets", async () => {
    findManyMock.mockResolvedValue([
      job({
        rawData: {
          item: {
            description: '<a href="https://company.example.com/careers/frontend-engineer/apply">Apply now</a>',
          },
        },
      }),
    ] as never);

    const result = await repairApplicationUrls();

    expect(result).toMatchObject({
      candidates: 1,
      resolved: 1,
      cleared: 0,
      applicationsMoved: 0,
    });
    expect(result.items[0]).toMatchObject({
      action: "resolved",
      resolvedUrl: "https://company.example.com/careers/frontend-engineer/apply",
    });
  });

  it("does not resolve generic employer career home pages", async () => {
    findManyMock.mockResolvedValue([
      job({
        rawData: {
          item: {
            description: '<a href="https://career.proxify.io/">Apply now</a>',
          },
        },
      }),
    ] as never);

    const result = await repairApplicationUrls();

    expect(result).toMatchObject({
      candidates: 1,
      resolved: 0,
      cleared: 1,
      applicationsMoved: 1,
    });
  });

  it("does not resolve generic campaign pages that only mention apply in tracking params", async () => {
    findManyMock.mockResolvedValue([
      job({
        rawData: {
          item: {
            description: '<a href="https://me.lemon.io/escape-the-matrix?from=fordevs-apply-projects">Apply now</a>',
          },
        },
      }),
    ] as never);

    const result = await repairApplicationUrls();

    expect(result).toMatchObject({
      candidates: 1,
      resolved: 0,
      cleared: 1,
      applicationsMoved: 1,
    });
  });

  it("does not resolve generic form landing pages without job identity", async () => {
    findManyMock.mockResolvedValue([
      job({
        rawData: {
          item: {
            description: '<a href="https://lemon.io/form-the-union/?from=fordevs">Apply now</a>',
          },
        },
      }),
    ] as never);

    const result = await repairApplicationUrls();

    expect(result).toMatchObject({
      candidates: 1,
      resolved: 0,
      cleared: 1,
      applicationsMoved: 1,
    });
  });

  it("resolves custom apply paths when they include job-specific path data", async () => {
    findManyMock.mockResolvedValue([
      job({
        rawData: {
          item: {
            description: '<a href="https://fmgsuite.applytojob.com/apply/2RnFttw4Yk/Jr-Front-End-Developer-Remote">Apply now</a>',
          },
        },
      }),
    ] as never);

    const result = await repairApplicationUrls();

    expect(result).toMatchObject({
      candidates: 1,
      resolved: 1,
      cleared: 0,
    });
    expect(result.items[0]?.resolvedUrl).toBe("https://fmgsuite.applytojob.com/apply/2RnFttw4Yk/Jr-Front-End-Developer-Remote");
  });
});

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job_1",
    company: "Working Nomads",
    title: "Senior Frontend Engineer",
    applicationUrl: "https://www.workingnomads.com/job/go/1641404/",
    rawData: {},
    source: { type: "search_query" },
    applications: [{ id: "app_1", status: "ready_to_apply" }],
    ...overrides,
  };
}
