import type { JobSearchProfile, JobSource } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractBuiltInHowToApplyUrl, extractHimalayasApplyUrl, searchQueryAdapter } from "@/lib/job-search/adapters/search-query";

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
      applicationUrl: "https://jobs.ashbyhq.com/example/123/application",
      remoteType: "remote",
      atsProvider: "ashby",
    });
  });

  it("resolves Built In job detail pages to underlying Ashby application URLs", async () => {
    const raw = {
      sourceJobId: "search:builtin:job",
      company: "Brisk Teaching",
      title: "Frontend Engineer, Accessibility Contractor",
      location: "Remote",
      description: "Accessibility contract role",
      applicationUrl: "https://builtin.com/job/frontend-engineer-accessibility-contractor/9425940",
      rawData: { provider: "brave" },
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => builtInDetailHtml,
    } as Response);

    const normalized = await searchQueryAdapter.normalize(raw);

    expect(fetch).toHaveBeenCalledWith(raw.applicationUrl, expect.objectContaining({
      headers: expect.objectContaining({ "User-Agent": "JobSearchOS/1.0" }),
    }));
    expect(normalized).toMatchObject({
      applicationUrl: "https://jobs.ashbyhq.com/brisk-teaching/efaac331-a366-4bef-88ed-e3afb3127f5c/application",
      atsProvider: "ashby",
      rawData: {
        resolvedApplicationUrl: {
          source: "job_detail_page",
          originalUrl: raw.applicationUrl,
        },
      },
    });
  });

  it("extracts Built In how-to-apply URLs from job detail boot payloads", () => {
    expect(extractBuiltInHowToApplyUrl(builtInDetailHtml, "https://builtin.com/job/frontend-engineer-accessibility-contractor/9425940")).toBe(
      "https://jobs.ashbyhq.com/brisk-teaching/efaac331-a366-4bef-88ed-e3afb3127f5c",
    );
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

  it("resolves Himalayas job pages to direct application URLs before saving", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Senior Frontend Engineer, React",
                url: "https://himalayas.app/companies/newfire-global-partners/jobs/senior-frontend-engineer-react",
                description: "Remote React role",
                profile: { name: "Newfire Global Partners" },
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => himalayasDetailHtml,
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:himalayas.app "Senior Frontend Engineer"'] }));
    const normalized = await searchQueryAdapter.normalize(jobs[0]!);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      company: "Newfire Global Partners",
      title: "Senior Frontend Engineer, React",
      applicationUrl: "https://jobs.ashbyhq.com/newfire/abc-123/application",
      rawData: {
        expansionProvider: "himalayas",
        expandedFrom: "https://himalayas.app/companies/newfire-global-partners/jobs/senior-frontend-engineer-react",
      },
    });
    expect(normalized).toMatchObject({
      applicationUrl: "https://jobs.ashbyhq.com/newfire/abc-123/application",
      atsProvider: "ashby",
    });
  });

  it("suppresses Himalayas job pages when no direct application URL is exposed", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Senior Frontend Engineer, React",
                url: "https://himalayas.app/companies/newfire-global-partners/jobs/senior-frontend-engineer-react",
                description: "Remote React role",
                profile: { name: "Newfire Global Partners" },
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "<html><body><a href=\"/companies/newfire-global-partners\">Company</a></body></html>",
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:himalayas.app "Senior Frontend Engineer"'] }));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      applicationUrl: "https://himalayas.app/companies/newfire-global-partners/jobs/senior-frontend-engineer-react",
      listingReview: {
        reason: "Himalayas job page did not expose a direct application URL.",
        blocked: false,
      },
    });
  });

  it("suppresses Indeed search result pages instead of treating them as application URLs", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "React Developer Remote Jobs, Employment",
                url: "https://www.indeed.com/q-react-developer-remote-jobs.html?vjk=2b96b1e36b1939fe",
                description: "Search remote React developer jobs on Indeed.",
                profile: { name: "Indeed" },
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "<html><body><a href=\"/jobs?q=react+developer\">React developer jobs</a></body></html>",
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:indeed.com "React Developer" "remote"'] }));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      company: "Indeed",
      title: "React Developer Remote Jobs, Employment",
      applicationUrl: "https://www.indeed.com/q-react-developer-remote-jobs.html?vjk=2b96b1e36b1939fe",
      listingReview: {
        reason: "generic-listing listing page had no parseable individual job links.",
        blocked: false,
      },
    });
  });

  it("suppresses Dice search result pages instead of treating them as application URLs", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Front End Developer React Js Jobs",
                url: "https://www.dice.com/jobs/q-front+end+developer+react+js-jobs",
                description: "Search front end developer React JS jobs on Dice.",
                profile: { name: "Dice" },
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "<html><body><a href=\"/jobs/q-front+end+developer+react+js-jobs?page=2\">Next</a></body></html>",
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:dice.com "Front End Developer" "React"'] }));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      company: "Dice",
      title: "Front End Developer React Js Jobs",
      applicationUrl: "https://www.dice.com/jobs/q-front+end+developer+react+js-jobs",
      listingReview: {
        reason: "generic-listing listing page had no parseable individual job links.",
        blocked: false,
      },
    });
  });

  it("extracts Himalayas apply links from ATS URLs or apply anchors", () => {
    expect(extractHimalayasApplyUrl(himalayasDetailHtml, "https://himalayas.app/companies/newfire-global-partners/jobs/senior-frontend-engineer-react")).toBe(
      "https://jobs.ashbyhq.com/newfire/abc-123/application",
    );
    expect(extractHimalayasApplyUrl(
      "<a href=\"https://company.example.com/apply/senior-frontend-engineer\">Apply now</a>",
      "https://himalayas.app/companies/example/jobs/senior-frontend-engineer",
    )).toBe("https://company.example.com/apply/senior-frontend-engineer");
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

const builtInDetailHtml = `
  <html>
    <body>
      <a href="https://jobs.ashbyhq.com/brisk-teaching/efaac331-a366-4bef-88ed-e3afb3127f5c" target="_blank">Apply</a>
      <script>
        Builtin.jobPostInit({"job":{"id":9425940,"howToApply":"https://jobs.ashbyhq.com/brisk-teaching/efaac331-a366-4bef-88ed-e3afb3127f5c","companyName":"Brisk Teaching","title":"Frontend Engineer, Accessibility Contractor"}});
      </script>
    </body>
  </html>
`;

const himalayasDetailHtml = `
  <html>
    <body>
      <h1>Senior Frontend Engineer, React</h1>
      <a href="https://jobs.ashbyhq.com/newfire/abc-123/application">Apply now</a>
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
