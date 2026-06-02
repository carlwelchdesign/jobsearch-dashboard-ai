import type { JobSearchProfile, JobSource } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchQueryAdapter } from "@/lib/job-search/adapters/search-query";

describe("searchQueryAdapter", () => {
  beforeEach(() => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "brave_key");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns no results when the Brave key is missing", async () => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "");

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source());

    expect(jobs).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches Brave web results and normalizes ATS provider metadata", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        web: {
          results: [
            {
              title: "Senior Frontend Engineer",
              url: "https://jobs.ashbyhq.com/example/123",
              description: "Remote React TypeScript role",
              profile: { name: "Example" },
            },
          ],
        },
      }),
    } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:jobs.ashbyhq.com "Senior Frontend Engineer" "remote"'] }));
    const normalized = await searchQueryAdapter.normalize(jobs[0]!);

    expect(fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      headers: expect.objectContaining({ "X-Subscription-Token": "brave_key" }),
    }));
    expect(jobs[0]).toMatchObject({
      company: "Example",
      title: "Senior Frontend Engineer",
      location: "Remote",
      applicationUrl: "https://jobs.ashbyhq.com/example/123",
    });
    expect(normalized).toMatchObject({
      remoteType: "remote",
      atsProvider: "ashby",
    });
  });

  it("expands Built In listing results into individual jobs", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Best Remote Front End Developer Jobs 2026 | Built In",
                url: "https://builtin.com/jobs/remote/dev-engineering/front-end",
                description: "Remote frontend job search results",
                profile: { name: "Built In" },
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => builtInListingHtml,
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:builtin.com "Frontend Engineer" "remote"'] }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.applicationUrl)).toEqual([
      "https://builtin.com/job/senior-fullstack-frontend-engineer/8896228",
      "https://builtin.com/job/staff-frontend-engineer/8991269",
    ]);
    expect(jobs[0]).toMatchObject({
      company: "Affirm",
      title: "Senior Fullstack Frontend Engineer",
      location: "Remote",
    });
    expect(jobs[0]?.description).toContain("Expanded from: https://builtin.com/jobs/remote/dev-engineering/front-end");
    expect(jobs[0]?.rawData).toMatchObject({
      provider: "brave",
      expansionProvider: "builtin",
      expandedFrom: "https://builtin.com/jobs/remote/dev-engineering/front-end",
    });
    expect(jobs).not.toContainEqual(expect.objectContaining({
      applicationUrl: "https://builtin.com/jobs/remote/dev-engineering/front-end",
    }));
  });

  it("returns a listing-review record for blocked Remote Rocketship search pages", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Senior Frontend Engineer Jobs - Remote Rocketship",
                url: "https://www.remoterocketship.com/jobs/senior-frontend-engineer/?page=1&sort=DateAdded&jobTitle=Frontend+Engineer&seniority=senior",
                description: "1,410 total jobs for Senior Frontend Engineer. Search remote jobs.",
                profile: { name: "Remote Rocketship" },
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['"Senior Frontend Engineer" "remote"'] }));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      company: "Remote Rocketship",
      title: "Senior Frontend Engineer Jobs - Remote Rocketship",
      applicationUrl: "https://www.remoterocketship.com/jobs/senior-frontend-engineer/?page=1&sort=DateAdded&jobTitle=Frontend+Engineer&seniority=senior",
      listingReview: {
        blocked: true,
        provider: "brave",
        reason: "generic-listing listing page returned HTTP 403.",
      },
    });
  });

  it("returns a listing-review record for generic filtered listing pages that cannot be expanded", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Remote frontend jobs search results",
                url: "https://example-board.test/jobs/search?page=1&sort=date&query=frontend",
                description: "Search results for remote frontend engineer jobs.",
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "<html><body><a href=\"/jobs/search?page=2\">Next</a></body></html>",
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['"Frontend Engineer" "remote"'] }));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.listingReview).toMatchObject({
      blocked: false,
      reason: "generic-listing listing page had no parseable individual job links.",
      url: "https://example-board.test/jobs/search?page=1&sort=date&query=frontend",
    });
  });
});

const builtInListingHtml = `
  <html>
    <head>
      <script type="application/ld&#x2B;json">
        {
          "@graph": [
            {
              "@type": "ItemList",
              "itemListElement": [
                {
                  "position": 1,
                  "name": "Senior Fullstack Frontend Engineer",
                  "url": "https://builtin.com/job/senior-fullstack-frontend-engineer/8896228",
                  "description": "React &amp; TypeScript role"
                },
                {
                  "position": 2,
                  "name": "Staff Frontend Engineer",
                  "url": "https://builtin.com/job/staff-frontend-engineer/8991269",
                  "description": "Remote platform role"
                }
              ]
            }
          ]
        }
      </script>
    </head>
    <body>
      <main>
        <div id="job-card-8896228">
          <a data-id="company-title"><span>Affirm</span></a>
          <a href="/job/senior-fullstack-frontend-engineer/8896228" data-id="job-card-title">Senior Fullstack Frontend Engineer</a>
        </div>
        <div id="job-card-8991269">
          <a data-id="company-title"><span>Built In</span></a>
          <a href="/job/staff-frontend-engineer/8991269" data-id="job-card-title">Staff Frontend Engineer</a>
        </div>
      </main>
    </body>
  </html>
`;

function profile(input: Partial<JobSearchProfile> = {}) {
  return {
    id: "profile_1",
    userId: "user_1",
    name: "Frontend",
    maxResultsPerRun: 10,
    ...input,
  } as JobSearchProfile;
}

function source(config: Record<string, unknown> = {}) {
  return {
    id: "source_1",
    name: "Search Query Backlog",
    type: "search_query",
    baseUrl: "https://search.brave.com",
    enabled: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    config: {
      queries: ['"Senior Frontend Engineer" "remote"'],
      maxResultsPerQuery: 5,
      maxFetch: 20,
      ...config,
    },
  } as JobSource;
}
