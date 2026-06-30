import type { JobSearchProfile, JobSource } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectSearchProviderFromUrl, extractBuiltInJobDetail, extractBuiltInHowToApplyUrl, extractHimalayasApplyUrl, parseDiceListingJobs, searchQueryAdapter } from "@/lib/job-search/adapters/search-query";

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

  it("labels local commute query results with the targeted city location", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        web: {
          results: [
            {
              title: "Senior Frontend Engineer",
              url: "https://jobs.ashbyhq.com/local-role/123",
              description: "React TypeScript product role",
              profile: { name: "Local Co" },
            },
          ],
        },
      }),
    } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({
      queries: ['"Senior Frontend Engineer" "Ventura, CA" jobs'],
    }));

    expect(jobs[0]).toMatchObject({
      company: "Local Co",
      title: "Senior Frontend Engineer",
      location: "Ventura, CA",
    });
  });

  it("labels local commute county queries when no specific city is present", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        web: {
          results: [
            {
              title: "Senior Software Engineer",
              url: "https://jobs.lever.co/local-role/456",
              description: "React TypeScript product role",
              profile: { name: "County Co" },
            },
          ],
        },
      }),
    } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({
      queries: ['"Senior Software Engineer" "Santa Barbara County" jobs'],
    }));

    expect(jobs[0]).toMatchObject({
      company: "County Co",
      title: "Senior Software Engineer",
      location: "Santa Barbara County, CA",
    });
  });

  it("detects requested remote-source providers from URLs", () => {
    expect(detectSearchProviderFromUrl("https://remotive.com/remote-jobs/software-dev/frontend-engineer")).toBe("remotive");
    expect(detectSearchProviderFromUrl("https://www.remoterocketship.com/jobs/senior-frontend-engineer/")).toBe("remote_rocketship");
    expect(detectSearchProviderFromUrl("https://jsremotely.com/jobs/react-engineer")).toBe("js_remotely");
    expect(detectSearchProviderFromUrl("https://www.kickresume.com/jobs/frontend-engineer/")).toBe("kickresume");
    expect(detectSearchProviderFromUrl("https://remoteok.com/remote-react-jobs")).toBe("remoteok");
    expect(detectSearchProviderFromUrl("https://www.toptal.com/freelance-jobs/developers/jobs")).toBe("toptal");
    expect(detectSearchProviderFromUrl("https://www.eztrackr.app/")).toBe("eztrackr");
  });

  it("records broad provider metadata for ATS domains outside the Prisma ATS enum", async () => {
    const raw = {
      sourceJobId: "search:teamtailor:role",
      company: "Acme",
      title: "Senior Frontend Engineer",
      location: "Remote",
      description: "Remote React TypeScript role",
      applicationUrl: "https://jobs.teamtailor.com/acme/jobs/123-senior-frontend-engineer",
      rawData: { provider: "brave" },
    };

    const normalized = await searchQueryAdapter.normalize(raw);

    expect(normalized.atsProvider).toBe("other");
    expect(normalized.rawData).toMatchObject({
      provider: "brave",
      searchProvider: "teamtailor",
    });
    expect(detectSearchProviderFromUrl("https://jobs.jobylon.com/jobs/123")).toBe("jobylon");
    expect(detectSearchProviderFromUrl("https://company.taleo.net/careersection/jobdetail.ftl")).toBe("oracle_taleo");
    expect(detectSearchProviderFromUrl("https://company.successfactors.com/career?job=123")).toBe("sap_successfactors");
  });

  it("suppresses aggregator listing pages when no job detail links are parseable", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Frontend Engineer Jobs on Monster",
                url: "https://www.monster.com/jobs/search?q=frontend-engineer&where=remote",
                description: "Search frontend engineer jobs on Monster.",
                profile: { name: "Monster" },
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "<html><body>No public job detail links</body></html>",
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:monster.com/jobs/search "Frontend Engineer" "remote"'] }));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      company: "Monster",
      listingReview: expect.objectContaining({
        url: "https://www.monster.com/jobs/search?q=frontend-engineer&where=remote",
        provider: "brave",
        blocked: false,
      }),
      rawData: expect.objectContaining({
        listingReview: true,
        searchProvider: "monster",
      }),
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
      company: "Brisk Teaching",
      title: "Frontend Engineer, Accessibility Contractor",
      applicationUrl: "https://jobs.ashbyhq.com/brisk-teaching/efaac331-a366-4bef-88ed-e3afb3127f5c/application",
      atsProvider: "ashby",
      rawData: {
        builtIn: {
          detailUrl: raw.applicationUrl,
        },
        resolvedApplicationUrl: {
          source: "job_detail_page",
          originalUrl: raw.applicationUrl,
        },
      },
    });
    expect(normalized.description).toContain("Improve accessibility for a React product.");
  });

  it("extracts Built In how-to-apply URLs from job detail boot payloads", () => {
    expect(extractBuiltInHowToApplyUrl(builtInDetailHtml, "https://builtin.com/job/frontend-engineer-accessibility-contractor/9425940")).toBe(
      "https://jobs.ashbyhq.com/brisk-teaching/efaac331-a366-4bef-88ed-e3afb3127f5c",
    );
  });

  it("extracts Built In detail metadata and external apply anchors", () => {
    const detail = extractBuiltInJobDetail(builtInExternalApplyDetailHtml, "https://builtin.com/job/frontend-engineer/8269411");

    expect(detail).toMatchObject({
      applicationUrl: "https://company.example.com/careers/frontend-engineer/apply",
      title: "Frontend Engineer",
    });
    expect(detail.description).toContain("Own the complete frontend experience for geospatial workflows.");
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
                url: "https://builtin.com/jobs/remote/dev-engineering/search/front-end-engineer?page=2",
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
    expect(jobs[0]?.description).toContain("Expanded from: https://builtin.com/jobs/remote/dev-engineering/search/front-end-engineer?page=2");
    expect(jobs[0]?.rawData).toMatchObject({
      provider: "brave",
      expansionProvider: "builtin",
      expandedFrom: "https://builtin.com/jobs/remote/dev-engineering/search/front-end-engineer?page=2",
      builtIn: {
        detailUrl: "https://builtin.com/job/senior-fullstack-frontend-engineer/8896228",
      },
    });
    expect(jobs).not.toContainEqual(expect.objectContaining({
      applicationUrl: "https://builtin.com/jobs/remote/dev-engineering/search/front-end-engineer?page=2",
    }));
  });

  it("falls back to Built In job-card anchors when JSON-LD is missing", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Best Remote Front End Developer Jobs 2026 | Built In",
                url: "https://builtin.com/jobs/remote/dev-engineering/search/front-end-engineer?page=2",
                description: "Remote frontend job search results",
                profile: { name: "Built In" },
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => builtInListingWithoutJsonLdHtml,
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:builtin.com "Frontend Engineer" "remote"'] }));

    expect(jobs.map((job) => job.applicationUrl)).toEqual([
      "https://builtin.com/job/frontend-engineer/8269411",
      "https://builtin.com/job/frontend-engineer-web-react-nextjs/7777777",
    ]);
    expect(jobs[0]).toMatchObject({
      company: "Code Metal",
      title: "Frontend Engineer",
    });
  });

  it("normalizes Built In expanded jobs to true external application links", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Best Remote Front End Developer Jobs 2026 | Built In",
                url: "https://builtin.com/jobs/remote/dev-engineering/search/front-end-engineer?page=2",
                description: "Remote frontend job search results",
                profile: { name: "Built In" },
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => builtInListingWithoutJsonLdHtml,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => builtInExternalApplyDetailHtml,
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:builtin.com "Frontend Engineer" "remote"'] }));
    const normalized = await searchQueryAdapter.normalize(jobs[0]!);

    expect(normalized).toMatchObject({
      company: "Code Metal",
      title: "Frontend Engineer",
      applicationUrl: "https://company.example.com/careers/frontend-engineer/apply",
      rawData: {
        builtIn: {
          detailUrl: "https://builtin.com/job/frontend-engineer/8269411",
          removed: false,
        },
        resolvedApplicationUrl: {
          source: "job_detail_page",
          originalUrl: "https://builtin.com/job/frontend-engineer/8269411",
          applicationUrl: "https://company.example.com/careers/frontend-engineer/apply",
        },
      },
    });
    expect(normalized.description).toContain("Own the complete frontend experience for geospatial workflows.");
  });

  it("keeps removed Built In detail pages reviewable without application URLs", async () => {
    const raw = {
      sourceJobId: "search:builtin:removed",
      company: "Code Metal",
      title: "Frontend Engineer",
      location: "Remote",
      description: "Listing summary",
      applicationUrl: "https://builtin.com/job/frontend-engineer/8269411",
      rawData: { provider: "brave", expansionProvider: "builtin" },
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => builtInRemovedDetailHtml,
    } as Response);

    const normalized = await searchQueryAdapter.normalize(raw);

    expect(normalized.applicationUrl).toBeUndefined();
    expect(normalized.atsProvider).toBe("unknown");
    expect(normalized.rawData).toMatchObject({
      builtIn: {
        detailUrl: raw.applicationUrl,
        removed: true,
        reason: "Built In detail page says the job was removed.",
      },
      missingApplicationUrl: {
        source: "builtin_detail_page",
        detailUrl: raw.applicationUrl,
        reason: "Built In detail page says the job was removed.",
      },
    });
  });

  it("keeps Built In detail pages reviewable when they do not expose external application URLs", async () => {
    const raw = {
      sourceJobId: "search:builtin:unresolved",
      company: "Built In",
      title: "Senior Frontend Engineer",
      location: "Remote",
      description: "Listing summary",
      applicationUrl: "https://builtin.com/job/frontend-engineer/8269411",
      rawData: { provider: "brave", expansionProvider: "builtin" },
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => "<html><body><h1>Senior Frontend Engineer</h1><button>Apply</button></body></html>",
    } as Response);

    const normalized = await searchQueryAdapter.normalize(raw);

    expect(normalized.applicationUrl).toBeUndefined();
    expect(normalized.rawData).toMatchObject({
      sourceApplicationUrl: {
        url: raw.applicationUrl,
      },
      applicationUrlQuality: {
        launchable: false,
        kind: "board_intermediary",
      },
      missingApplicationUrl: {
        source: "builtin_detail_page",
      },
    });
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

  it("returns a blocked listing-review record for protected Himalayas job pages", async () => {
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
        text: async () => cloudflareChallengeHtml,
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:himalayas.app "Senior Frontend Engineer"'] }));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      listingReview: {
        reason: "Himalayas job page returned a bot-protection/block page.",
        blocked: true,
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
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:indeed.com "React Developer" "remote"'] }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      company: "Indeed",
      title: "React Developer Remote Jobs, Employment",
      applicationUrl: "https://www.indeed.com/q-react-developer-remote-jobs.html?vjk=2b96b1e36b1939fe",
      listingReview: {
        reason: "Indeed listing pages are not fetched server-side because they return bot-protection challenges.",
        blocked: true,
      },
    });
  });

  it("keeps individual Indeed job URLs reviewable without making them launchable", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: {
          results: [
            {
              title: "React Developer",
              url: "https://www.indeed.com/viewjob?jk=abc123def456",
              description: "Remote React developer role.",
              profile: { name: "Indeed" },
            },
          ],
        },
      }),
    } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:indeed.com/viewjob "React Developer"'] }));
    const normalized = await searchQueryAdapter.normalize(jobs[0]!);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.listingReview).toBeUndefined();
    expect(normalized.applicationUrl).toBeUndefined();
    expect(normalized.rawData).toMatchObject({
      sourceApplicationUrl: {
        url: "https://www.indeed.com/viewjob?jk=abc123def456",
      },
      applicationUrlQuality: {
        launchable: false,
        kind: "board_intermediary",
      },
    });
  });

  it("does not promote Recruitee jobs that redirect to the Recruitee marketing site", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 301,
      ok: false,
      headers: new Headers({ location: "https://recruitee.com/careers_not_hosted" }),
    } as Response);

    const raw = {
      sourceJobId: "search:recruitee:broken",
      company: "Shop Apotheke Europe",
      title: "Senior Frontend Engineer, React",
      location: "Remote Germany",
      description: "React frontend role.",
      applicationUrl: "https://shopapothekeeurope.recruitee.com/o/senior-frontend-engineer-react-mwd-in-berlin-or-remote-germany",
      rawData: { provider: "brave", searchProvider: "recruitee" },
    };

    const normalized = await searchQueryAdapter.normalize(raw);

    expect(fetch).toHaveBeenCalledWith(raw.applicationUrl, expect.objectContaining({
      method: "HEAD",
      redirect: "manual",
    }));
    expect(normalized.applicationUrl).toBeUndefined();
    expect(normalized.atsProvider).toBe("unknown");
    expect(normalized.rawData).toMatchObject({
      sourceApplicationUrl: {
        url: raw.applicationUrl,
      },
      applicationUrlQuality: {
        launchable: false,
        kind: "auth_or_paywall",
      },
    });
  });

  it("promotes Recruitee jobs only when they redirect to a company career page", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: new Headers({ location: "https://career.churchdesk.com/o/senior-frontend-engineer-react-remote" }),
    } as Response);

    const raw = {
      sourceJobId: "search:recruitee:custom-career",
      company: "ChurchDesk",
      title: "Senior Frontend Engineer, React",
      location: "Remote",
      description: "React frontend role.",
      applicationUrl: "https://churchdesk.recruitee.com/o/senior-frontend-engineer-react-remote",
      rawData: { provider: "brave", searchProvider: "recruitee" },
    };

    const normalized = await searchQueryAdapter.normalize(raw);

    expect(normalized).toMatchObject({
      applicationUrl: "https://career.churchdesk.com/o/senior-frontend-engineer-react-remote",
      atsProvider: "other",
      rawData: {
        resolvedApplicationUrl: {
          source: "job_detail_page",
          originalUrl: raw.applicationUrl,
          applicationUrl: "https://career.churchdesk.com/o/senior-frontend-engineer-react-remote",
        },
      },
    });
  });

  it("expands Dice search result pages into individual job detail links", async () => {
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
        text: async () => diceListingHtml,
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:dice.com "Front End Developer" "React"'] }));

    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.applicationUrl)).toEqual([
      "https://www.dice.com/job-detail/1c463470-ecc8-45a0-b1a7-8c72c6fcafd9",
      "https://www.dice.com/job-detail/72b1e2e3-525f-4097-8add-88d9ccd1e503",
    ]);
    expect(jobs[0]).toMatchObject({
      company: "Dice",
      title: "Senior React Developer",
      rawData: {
        expansionProvider: "dice",
        expandedFrom: "https://www.dice.com/jobs/q-front+end+developer+react+js-jobs",
      },
    });
  });

  it("suppresses Dice listing pages when no individual job detail links are parseable", async () => {
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
      listingReview: {
        reason: "dice listing page had no parseable individual job links.",
        blocked: false,
      },
    });
  });

  it("dedupes Dice job detail links extracted from listing HTML", () => {
    const jobs = parseDiceListingJobs(diceListingHtml, {
      title: "Front End Developer React Js Jobs",
      url: "https://www.dice.com/jobs/q-front+end+developer+react+js-jobs",
      description: "Search front end developer React JS jobs on Dice.",
      profile: { name: "Dice" },
    }, "site:dice.com React", profile());

    expect(jobs.map((job) => job.applicationUrl)).toEqual([
      "https://www.dice.com/job-detail/1c463470-ecc8-45a0-b1a7-8c72c6fcafd9",
      "https://www.dice.com/job-detail/72b1e2e3-525f-4097-8add-88d9ccd1e503",
    ]);
  });

  it("expands Dice q-react.js listing pages from embedded job payloads", () => {
    const jobs = parseDiceListingJobs(diceEmbeddedListingHtml, {
      title: "React.js jobs | Dice.com",
      url: "https://www.dice.com/jobs/q-react.js-jobs",
      description: "React.js jobs",
      profile: { name: "Dice" },
    }, "site:dice.com React", profile());

    expect(jobs.map((job) => job.applicationUrl)).toEqual([
      "https://www.dice.com/job-detail/c5b1d610-2cea-4659-b5df-32e998a2685a",
      "https://www.dice.com/job-detail/4e635806-b8a7-4c6c-88c4-247f09f970a4",
    ]);
    expect(jobs[0]).toMatchObject({
      company: "SolutionIT, Inc.",
      title: "React.js Developer",
      location: "US",
      rawData: {
        expansionProvider: "dice",
        expandedFrom: "https://www.dice.com/jobs/q-react.js-jobs",
        item: {
          easyApply: true,
          workplaceTypes: ["Remote"],
        },
      },
    });
    expect(jobs[0]?.description).toContain("React.js, JSON, MongoDB");
    expect(jobs[0]?.description).toContain("Employment type: Contract, Third Party");
    expect(jobs[0]?.description).toContain("Dice easy apply: yes");
  });

  it("prefers embedded Dice job data over generic Dice listing result text", () => {
    const jobs = parseDiceListingJobs(diceEmbeddedListingHtml, {
      title: "React.js jobs | Dice.com",
      url: "https://www.dice.com/jobs/q-react.js-jobs",
      description: "Generic Dice search listing text.",
      profile: { name: "Dice" },
    }, "site:dice.com React", profile());

    expect(jobs[1]).toMatchObject({
      company: "Motion Recruitment Partners, LLC",
      title: "Senior Software Engineer / React and Robotics / Boston",
      location: "Boston, Massachusetts, USA",
    });
    expect(jobs[1]?.description).toContain("robotics start-up in Boston");
    expect(jobs[1]?.description).not.toContain("Generic Dice search listing text.");
  });

  it("discovers friendly alternate links for paywalled Remotive leads", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Senior Frontend Engineer • Acme Remote | Remotive.com",
                url: "https://remotive.com/remote-jobs/software-dev/senior-frontend-engineer-acme-remote-123456",
                description: "Acme Remote · Software Development · full-time · Worldwide",
                profile: { name: "Remotive" },
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Senior Frontend Engineer - Acme Remote",
                url: "https://jobs.ashbyhq.com/acme/abc-123",
                description: "Acme Remote is hiring a Senior Frontend Engineer to build React products.",
                profile: { name: "Acme Remote" },
              },
            ],
          },
        }),
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:remotive.com/remote-jobs "Senior Frontend Engineer"'] }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(2, expect.any(URL), expect.objectContaining({
      headers: expect.objectContaining({ "X-Subscription-Token": "brave_key" }),
    }));
    expect((vi.mocked(fetch).mock.calls[1]?.[0] as URL).searchParams.get("q")).toContain("\"Acme Remote\" \"Senior Frontend Engineer\" jobs");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      company: "Acme Remote",
      title: "Senior Frontend Engineer - Acme Remote",
      applicationUrl: "https://jobs.ashbyhq.com/acme/abc-123",
      rawData: {
        expansionProvider: "remotive-alternate",
        expandedFrom: "https://remotive.com/remote-jobs/software-dev/senior-frontend-engineer-acme-remote-123456",
      },
    });
    expect(jobs[0]?.description).toContain("Discovered via Remotive lead");
    expect(jobs[0]?.description).toContain("Remotive source must be attributed");
  });

  it("suppresses paywalled Remotive leads when no friendly alternate link is found", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Senior Frontend Engineer • Acme Remote | Remotive.com",
                url: "https://remotive.com/remote-jobs/software-dev/senior-frontend-engineer-acme-remote-123456",
                description: "Acme Remote · Software Development · full-time · Worldwide",
                profile: { name: "Remotive" },
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Senior Frontend Engineer • Acme Remote | Remotive.com",
                url: "https://remotive.com/remote-jobs/software-dev/senior-frontend-engineer-acme-remote-123456",
                description: "Unlock full access to apply before everyone else.",
                profile: { name: "Remotive" },
              },
            ],
          },
        }),
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:remotive.com/remote-jobs "Senior Frontend Engineer"'] }));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      applicationUrl: "https://remotive.com/remote-jobs/software-dev/senior-frontend-engineer-acme-remote-123456",
      listingReview: {
        reason: "Remotive listing is paywall-gated and no friendly alternate URL was found.",
        blocked: true,
      },
    });
  });

  it("strips Remotive URLs during final application URL safety validation", async () => {
    const normalized = await searchQueryAdapter.normalize({
      sourceJobId: "search:remotive:test",
      company: "Acme Remote",
      title: "Senior Frontend Engineer",
      location: "Remote",
      description: "Remotive lead",
      applicationUrl: "https://remotive.com/remote-jobs/software-dev/senior-frontend-engineer-acme-remote-123456",
      rawData: { provider: "brave" },
    });

    expect(normalized.applicationUrl).toBeUndefined();
  });

  it("expands Working Nomads listing pages through the public jobs API", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Remote TypeScript Jobs",
                url: "https://www.workingnomads.com/remote-typescript-jobs",
                description: "Explore fully remote TypeScript jobs.",
                profile: { name: "Working Nomads" },
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => workingNomadsJobs,
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:workingnomads.com "TypeScript" "remote"'] }));

    expect(fetch).toHaveBeenCalledWith("https://www.workingnomads.com/api/exposed_jobs/", expect.objectContaining({
      headers: expect.objectContaining({ Accept: "application/json" }),
    }));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      company: "Acme Remote",
      title: "Senior TypeScript Engineer",
      location: "Anywhere",
      applicationUrl: "https://jobs.ashbyhq.com/acme/ts-123/application",
      rawData: {
        expansionProvider: "workingnomads",
        expandedFrom: "https://www.workingnomads.com/remote-typescript-jobs",
        detailUrl: "https://www.workingnomads.com/job/go/123456/",
      },
    });
  });

  it("does not promote Working Nomads detail URLs when no external apply URL is exposed", async () => {
    const normalized = await searchQueryAdapter.normalize({
      sourceJobId: "search:workingnomads:1641405",
      company: "Proxify",
      title: "Senior Frontend Developer",
      location: "Remote",
      description: "Working Nomads detail",
      applicationUrl: "https://www.workingnomads.com/job/go/1641405/",
      rawData: {
        provider: "brave",
        expansionProvider: "workingnomads",
        detailUrl: "https://www.workingnomads.com/job/go/1641405/",
      },
    });

    expect(normalized.applicationUrl).toBeUndefined();
    expect(normalized.rawData).toMatchObject({
      sourceApplicationUrl: {
        url: "https://www.workingnomads.com/job/go/1641405/",
      },
      applicationUrlQuality: {
        launchable: false,
        kind: "board_intermediary",
      },
    });
  });

  it("suppresses Working Nomads listings when the API has no matching jobs", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Remote TypeScript Jobs",
                url: "https://www.workingnomads.com/remote-typescript-jobs",
                description: "Explore fully remote TypeScript jobs.",
                profile: { name: "Working Nomads" },
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{
          url: "https://www.workingnomads.com/job/go/999/",
          title: "Payroll Specialist",
          description: "Accounting operations role.",
          company_name: "Backoffice Co",
          tags: "payroll,accounting",
          location: "Remote",
        }],
      } as Response);

    const jobs = await searchQueryAdapter.fetchJobs(profile(), source({ queries: ['site:workingnomads.com "TypeScript" "remote"'] }));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      applicationUrl: "https://www.workingnomads.com/remote-typescript-jobs",
      listingReview: {
        reason: "Working Nomads API had no matching jobs for this listing.",
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

const builtInListingWithoutJsonLdHtml = `
  <html>
    <body>
      <main>
        <div id="job-card-8269411">
          <a data-id="company-title"><span>Code Metal</span></a>
          <a href="/job/frontend-engineer/8269411" data-id="job-card-title">Frontend Engineer</a>
        </div>
        <div id="job-card-7777777">
          <a data-id="company-title"><span>Outlive</span></a>
          <a href="/job/frontend-engineer-web-react-nextjs/7777777" data-id="job-card-title">Frontend Engineer - Web (React / Next.js)</a>
        </div>
        <a href="/jobs/remote/dev-engineering/search/front-end-engineer?page=3">Next</a>
        <a href="/companies/code-metal">Code Metal</a>
      </main>
    </body>
  </html>
`;

const builtInDetailHtml = `
  <html>
    <body>
      <section data-id="job-description">
        <h2>The Role</h2>
        <p>Improve accessibility for a React product.</p>
      </section>
      <a href="https://jobs.ashbyhq.com/brisk-teaching/efaac331-a366-4bef-88ed-e3afb3127f5c" target="_blank">Apply</a>
      <script>
        Builtin.jobPostInit({"job":{"id":9425940,"howToApply":"https://jobs.ashbyhq.com/brisk-teaching/efaac331-a366-4bef-88ed-e3afb3127f5c","companyName":"Brisk Teaching","title":"Frontend Engineer, Accessibility Contractor"}});
      </script>
    </body>
  </html>
`;

const builtInExternalApplyDetailHtml = `
  <html>
    <body>
      <a>Code Metal</a>
      <h1>Frontend Engineer</h1>
      <section data-id="job-description">
        <h2>The Role</h2>
        <p>Own the complete frontend experience for geospatial workflows.</p>
        <p>Build React and TypeScript interfaces for mission-critical users.</p>
      </section>
      <a href="https://company.example.com/careers/frontend-engineer/apply">Apply Now</a>
      <script>
        Builtin.jobPostInit({"job":{"id":8269411,"companyName":"Code Metal","title":"Frontend Engineer"}});
      </script>
    </body>
  </html>
`;

const builtInRemovedDetailHtml = `
  <html>
    <body>
      <h1>Frontend Engineer</h1>
      <p>Sorry, this job was removed at 06:22 p.m. (CST) on Thursday, Jun 04, 2026</p>
      <button>Apply</button>
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

const cloudflareChallengeHtml = `
  <html>
    <head><title>Just a moment...</title></head>
    <body>
      <script src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script>
    </body>
  </html>
`;

const diceListingHtml = `
  <html>
    <body>
      <a href="/job-detail/1c463470-ecc8-45a0-b1a7-8c72c6fcafd9">Senior React Developer</a>
      <a href="https://www.dice.com/job-detail/1c463470-ecc8-45a0-b1a7-8c72c6fcafd9">Senior React Developer duplicate</a>
      <a href="https://www.dice.com/job-detail/72b1e2e3-525f-4097-8add-88d9ccd1e503">Front End Engineer</a>
      <a href="/jobs/q-front+end+developer+react+js-jobs?page=2">Next</a>
    </body>
  </html>
`;

const diceEmbeddedListingHtml = `
  <html>
    <body>
      <script>
        self.__next_f.push([1,"{\\"jobs\\":[{\\"id\\":\\"d65c8be5e42f1f2c83c346e313394f06\\",\\"guid\\":\\"c5b1d610-2cea-4659-b5df-32e998a2685a\\",\\"detailsPageUrl\\":\\"https://www.dice.com/job-detail/c5b1d610-2cea-4659-b5df-32e998a2685a\\",\\"companyName\\":\\"SolutionIT, Inc.\\",\\"employmentType\\":\\"Contract, Third Party\\",\\"jobLocation\\":{\\"country\\":\\"US\\",\\"displayName\\":\\"US\\"},\\"postedDate\\":\\"2026-06-11T18:01:35Z\\",\\"modifiedDate\\":\\"2026-06-12T03:02:33Z\\",\\"summary\\":\\"Solution IT Inc. is looking for React.js Developer. Must have skills React.js, JSON, MongoDB.\\",\\"title\\":\\"React.js Developer\\",\\"easyApply\\":true,\\"workplaceTypes\\":[\\"Remote\\"]},{\\"id\\":\\"53837836549287bcaa133979701dc83f\\",\\"guid\\":\\"4e635806-b8a7-4c6c-88c4-247f09f970a4\\",\\"detailsPageUrl\\":\\"https://www.dice.com/job-detail/4e635806-b8a7-4c6c-88c4-247f09f970a4\\",\\"companyName\\":\\"Motion Recruitment Partners, LLC\\",\\"employmentType\\":\\"Full-time\\",\\"jobLocation\\":{\\"city\\":\\"Boston\\",\\"state\\":\\"Massachusetts\\",\\"country\\":\\"USA\\",\\"displayName\\":\\"Boston, Massachusetts, USA\\"},\\"postedDate\\":\\"2026-06-10T00:02:54Z\\",\\"modifiedDate\\":\\"2026-06-12T00:04:13Z\\",\\"summary\\":\\"A robotics start-up in Boston is hiring a Principal Software Engineer.\\",\\"title\\":\\"Senior Software Engineer / React and Robotics / Boston\\",\\"easyApply\\":true,\\"workplaceTypes\\":[\\"On-Site\\"]},{\\"id\\":\\"duplicate\\",\\"guid\\":\\"c5b1d610-2cea-4659-b5df-32e998a2685a\\",\\"detailsPageUrl\\":\\"https://www.dice.com/job-detail/c5b1d610-2cea-4659-b5df-32e998a2685a\\",\\"companyName\\":\\"Duplicate\\",\\"title\\":\\"Duplicate\\"}],\\"meta\\":{\\"currentPage\\":1}}"]);
      </script>
    </body>
  </html>
`;

const workingNomadsJobs = [
  {
    url: "https://www.workingnomads.com/job/go/123456/",
    title: "Senior TypeScript Engineer",
    description: "<p>Build React and TypeScript interfaces.</p><p><strong>If interested, please apply here:</strong> <a href=\"https://jobs.ashbyhq.com/acme/ts-123/application\">Apply</a></p>",
    company_name: "Acme Remote",
    category_name: "Development",
    tags: "typescript,react,frontend",
    location: "Anywhere",
    pub_date: "2026-06-11T11:06:58-04:00",
  },
  {
    url: "https://www.workingnomads.com/job/go/654321/",
    title: "Payroll Specialist",
    description: "Accounting operations role.",
    company_name: "Backoffice Co",
    category_name: "Finance",
    tags: "payroll,accounting",
    location: "Remote",
    pub_date: "2026-06-11T11:06:58-04:00",
  },
];

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
