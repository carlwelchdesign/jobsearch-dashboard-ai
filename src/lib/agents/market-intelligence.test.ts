import { describe, expect, it } from "vitest";
import { buildMarketIntelligenceReport, collectMarketResearch, discoverArticleUrls, extractResearchArticle } from "@/lib/agents/market-intelligence";

describe("market intelligence agent", () => {
  it("builds a review-only market brief from internal jobs and cited sources", () => {
    const report = buildMarketIntelligenceReport({
      lookbackDays: 45,
      generatedAt: new Date("2026-05-18T12:00:00.000Z"),
      profiles: [
        {
          id: "profile_1",
          name: "AI Product Frontend",
          performanceSnapshots: [{ healthScore: 72 }],
        } as any,
        {
          id: "profile_2",
          name: "Noisy Generic Frontend",
          performanceSnapshots: [{ healthScore: 44 }],
        } as any,
      ],
      candidateTerms: ["React", "TypeScript", "RAG", "Design Systems"],
      sources: [
        {
          title: "Indeed Hiring Lab",
          publisher: "Indeed",
          url: "https://www.hiringlab.org/",
          signal: "Posting trend context.",
          status: "checked",
        },
      ],
      researchDigest: [
        {
          title: "AI hiring update",
          publisher: "Example Research",
          url: "https://www.hiringlab.org/2026/05/ai-hiring",
          publishedAt: "2026-05-01T00:00:00.000Z",
          relevanceScore: 88,
          confidence: 0.8,
          excerpts: ["AI job postings for software developers continue to emphasize React, TypeScript, workflow automation, and agentic product skills."],
          claims: ["AI job postings emphasize frontend and agentic product skills."],
          implications: ["Position AI product/frontend evidence clearly."],
        },
      ],
      matches: [
        match({
          company: "Terzo",
          title: "Frontend Engineer",
          description: "React TypeScript AI agents workflow analytics enterprise SaaS",
          recommendedAction: "APPLY_NOW",
          overallScore: 93,
          applicationOutcome: "RECRUITER_SCREEN",
        }),
        match({
          company: "Linear",
          title: "Product Engineer",
          description: "React TypeScript workflow dashboard enterprise",
          recommendedAction: "MAYBE_APPLY",
          overallScore: 86,
        }),
      ],
    });

    expect(report.marketTemperature[0]).toMatchObject({
      lane: "AI product/frontend",
      jobCount: 2,
    });
    expect(report.skillSignals.find((signal) => signal.skill === "React")).toMatchObject({
      mentions: 2,
    });
    expect(report.recommendedActions.every((action) => action.reviewOnly)).toBe(true);
    expect(report.sourceDigest[0]).toMatchObject({
      title: "Indeed Hiring Lab",
      url: "https://www.hiringlab.org/",
    });
    expect(report.researchDigest[0]).toMatchObject({
      title: "AI hiring update",
      url: "https://www.hiringlab.org/2026/05/ai-hiring",
    });
    expect(report.researchSynthesis.sourceBackedClaims[0]).toContain("AI job postings");
  });

  it("extracts readable article summaries with excerpts and relevance", () => {
    const article = extractResearchArticle(`
      <html>
        <head>
          <meta property="og:title" content="Tech hiring and AI skills are shifting">
          <meta property="og:site_name" content="Indeed Hiring Lab">
          <meta property="article:published_time" content="2026-05-01T00:00:00.000Z">
        </head>
        <body>
          <article>
            <p>Software developer job postings are changing as employers ask for AI, React, TypeScript, and agentic workflow experience in product engineering roles.</p>
            <p>The labor market remains competitive, so candidates should focus on skills demand, portfolio evidence, and targeted outreach.</p>
            <p>Frontend and developer tools roles increasingly mention AI skills and automation experience in job postings.</p>
          </article>
        </body>
      </html>
    `, "https://www.hiringlab.org/2026/05/tech-hiring-ai-skills");

    expect(article).toMatchObject({
      title: "Tech hiring and AI skills are shifting",
      publisher: "Indeed Hiring Lab",
      publishedAt: "2026-05-01T00:00:00.000Z",
    });
    expect(article?.relevanceScore).toBeGreaterThan(20);
    expect(article?.excerpts[0]).toContain("Software developer job postings");
  });

  it("discovers trusted article URLs from HTML and RSS", () => {
    expect(discoverArticleUrls(`
      <a href="/2026/05/ai-job-market-update/">AI market</a>
      <item><link>https://www.hiringlab.org/2026/05/software-developer-jobs/</link></item>
    `, "https://www.hiringlab.org/")).toEqual(expect.arrayContaining([
      "https://www.hiringlab.org/2026/05/ai-job-market-update/",
      "https://www.hiringlab.org/2026/05/software-developer-jobs/",
    ]));
  });

  it("collects market research without storing full article bodies", async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const value = String(url);
      const body = value.endsWith("/article")
        ? `<html><head><meta property="og:title" content="AI software hiring trends"><meta property="og:site_name" content="Indeed Hiring Lab"></head><body><article><p>Software developer job postings increasingly mention AI, React, TypeScript, frontend platform, and workflow automation skills for product engineers.</p><p>Recent labor market data suggests hiring remains competitive but focused around practical AI skills and developer tools.</p><p>Candidates should connect portfolio evidence to skills demand in job postings.</p></article></body></html>`
        : `<html><body><a href="https://www.hiringlab.org/article">AI software hiring trends</a></body></html>`;
      return new Response(body, { headers: { "content-type": "text/html" } });
    };

    const articles = await collectMarketResearch({ fetchImpl: fetchImpl as typeof fetch });
    expect(articles[0]).toMatchObject({
      title: "AI software hiring trends",
      url: "https://www.hiringlab.org/article",
    });
    expect(JSON.stringify(articles[0])).not.toContain("<article>");
  });
});

function match(input: {
  company: string;
  title: string;
  description: string;
  recommendedAction: string;
  overallScore: number;
  applicationOutcome?: string;
}) {
  return {
    status: "needs_review",
    overallScore: input.overallScore,
    jobSearchProfileId: "profile_1",
    jobPosting: {
      id: `${input.company}-${input.title}`,
      company: input.company,
      title: input.title,
      description: input.description,
      requirements: [],
      niceToHaves: [],
      lastSeenAt: new Date("2026-05-18T00:00:00.000Z"),
      evaluations: [{ recommendedAction: input.recommendedAction, fitScore: input.overallScore, opportunityScore: 80 }],
      applications: input.applicationOutcome
        ? [{ status: "applied", outcomes: [{ outcome: input.applicationOutcome }] }]
        : [],
    },
  } as any;
}
