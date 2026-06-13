import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendLinkedInLeadQueriesToSearchBacklog, buildLinkedInOriginalPostingQueries, isLinkedInJobUrl, linkedInLeadHasEnoughDetail, linkedInLeadMetadata } from "@/lib/linkedin/job-leads";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobSource: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const findUniqueMock = vi.mocked(prisma.jobSource.findUnique);
const upsertMock = vi.mocked(prisma.jobSource.upsert);

describe("LinkedIn job leads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recognizes LinkedIn job view URLs only", () => {
    expect(isLinkedInJobUrl("https://www.linkedin.com/jobs/view/123")).toBe(true);
    expect(isLinkedInJobUrl("https://linkedin.com/jobs/view/123?trk=public_jobs")).toBe(true);
    expect(isLinkedInJobUrl("https://www.linkedin.com/in/someone")).toBe(false);
    expect(isLinkedInJobUrl("https://jobs.lever.co/acme/123")).toBe(false);
  });

  it("generates original-posting queries without targeting LinkedIn", () => {
    const queries = buildLinkedInOriginalPostingQueries({
      company: "Acme",
      title: "Senior Frontend Engineer",
      location: "Remote US",
    });

    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((query) => query.includes("-site:linkedin.com"))).toBe(true);
    expect(queries.some((query) => query.includes('"Senior Frontend Engineer" "Acme"'))).toBe(true);
    expect(queries.some((query) => /greenhouse|lever|ashby/i.test(query))).toBe(true);
  });

  it("requires company, title, and pasted detail before normal capture scoring", () => {
    expect(linkedInLeadHasEnoughDetail({
      company: "Acme",
      title: "Senior Frontend Engineer",
      selectedText: "React TypeScript product UI role with design systems, accessibility, and platform ownership.",
    })).toBe(true);
    expect(linkedInLeadHasEnoughDetail({
      company: "Acme",
      title: "Senior Frontend Engineer",
      selectedText: "",
    })).toBe(false);
  });

  it("returns lead metadata with review guidance", () => {
    expect(linkedInLeadMetadata({
      pageUrl: "https://www.linkedin.com/jobs/view/123",
      company: "Acme",
      title: "Senior Frontend Engineer",
    })).toMatchObject({
      leadSource: "linkedin",
      linkedInJobUrl: "https://www.linkedin.com/jobs/view/123",
      needsManualText: true,
      captureGuidance: expect.stringContaining("Paste the job title"),
    });
  });

  it("keeps LinkedIn exclusion queries when merging lead searches into the backlog", async () => {
    findUniqueMock.mockResolvedValue({
      id: "source_1",
      config: {
        provider: "brave",
        queries: ["existing query"],
        linkedinLeadQueries: ["existing linkedIn query"],
      },
    } as never);
    upsertMock.mockResolvedValue({ id: "source_1" } as never);

    await appendLinkedInLeadQueriesToSearchBacklog([
      '"Senior Frontend Engineer" "Acme" careers apply -site:linkedin.com',
      'site:linkedin.com/jobs/view "Senior Frontend Engineer"',
      "   ",
    ]);

    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        config: expect.objectContaining({
          queries: expect.arrayContaining([
            "existing query",
            '"Senior Frontend Engineer" "Acme" careers apply -site:linkedin.com',
          ]),
          linkedinLeadQueries: expect.arrayContaining([
            "existing linkedIn query",
            '"Senior Frontend Engineer" "Acme" careers apply -site:linkedin.com',
          ]),
        }),
      }),
    }));
    const config = upsertMock.mock.calls[0]?.[0].update.config as { queries: string[] };
    expect(config.queries).not.toContain('site:linkedin.com/jobs/view "Senior Frontend Engineer"');
  });
});
