import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildArchitectureDiagramSpecs, buildArchitectureTopologySpec, buildClaims, buildLinkedInContentFallback, planLinkedInPromptIntent, reviewDiagramSpecQuality, reviewLinkedInPostPrivacy, reviewPromptSatisfaction, reviewTopologySpecQuality, type ArchitectureTopologySpec, type LinkedInContentDirection, type LinkedInScreenshotAsset } from "@/lib/agents/linkedin-content";
import { buildSearchRunAnalytics } from "@/lib/job-search/run-analytics";
import { describe, expect, it } from "vitest";

describe("LinkedIn content agent helpers", () => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/agents/linkedin-content.ts"), "utf8");

  it("uses the dedicated LinkedIn content model for structured generation", () => {
    expect(source).toContain("getLinkedInContentModel");
    expect(source).toContain("generationModel");
    expect(source).toContain("model: input.model");
    expect(source).toContain("input: { ...input, contentPillar: pillar");
  });

  it("generates a grounded deterministic fallback without posting claims", () => {
    const output = buildLinkedInContentFallback({
      pillar: "app_progress",
      memoryPack: {
        aggregateFacts: ["Latest search funnel: Fetched 1000, New matches 25."],
        storyAngles: ["Workflow memory should feed content."],
        planSources: [{ filename: "PLAN.md", title: "Jolene Email Operations", summary: "Agents scan mail, draft calendar actions, and report to Jolene.", themes: ["Jolene", "Email Ops"] }],
        noveltySignals: { recentHooks: ["The next content system should remember the work before it writes."], recentTitles: ["Turning app memory into public product notes"], recentPillars: ["app_progress"], recentScreenshotRoutes: ["/dashboard"], avoidPhrases: ["future CMS", "operating system"] },
        analytics: {
          latestSearchRun: buildSearchRunAnalytics({ jobsFetched: 1000, jobsAfterDedupe: 500, jobsAfterFilters: 50, jobsSaved: 25 }),
          applicationStatusCounts: {},
          outcomeCounts: {},
          agentRunCounts: {},
          sourceCoverage: { activeSources: 42, querySources: 24, manualSources: 6, priorityOneSources: 8 },
        },
      },
    });

    expect(output.mode).toBe("deterministic");
    expect(output.generationModel).toBe("");
    expect(output.body).toContain("Jolene Email Operations");
    expect(output.body).not.toContain("fetched 1000");
    expect(output.body).not.toContain("below threshold 800");
    expect(output.body).not.toMatch(/\bposted\b/i);
    expect(output.body).not.toMatch(/—/);
  });

  it("uses prompt direction to vary deterministic fallback posts", () => {
    const output = buildLinkedInContentFallback({
      pillar: "workflow_design",
      direction: {
        prompt: "Write a decision diary about agents acting as documentarians.",
        tone: "bold_grounded",
        format: "decision_diary",
        legacyPillar: "workflow_design",
        visualDirection: "show agent run evidence",
        selectedAngle: "Decision diary: documentarians before automation",
        rejectedAngles: ["Generic app progress update"],
        intent: "workflow_story",
        obligations: {
          topic: "agents acting as documentarians",
          requiredConcepts: ["workflow story", "agents", "evidence"],
          requiredVisuals: ["app_screenshot"],
          forbiddenPhrases: ["future CMS"],
          allowSearchFunnelAnalytics: false,
        },
        promptRelevanceScore: 92,
        evidenceAnchors: [{ sourceType: "aggregate_fact", label: "Agent run evidence", text: "Agent runs record workflow evidence and review gates.", relevance: 92 }],
        rejectedEvidence: [],
      },
      memoryPack: {
        aggregateFacts: [],
        storyAngles: [],
        planSources: [],
        noveltySignals: { recentHooks: [], recentTitles: [], recentPillars: [], recentScreenshotRoutes: [], avoidPhrases: ["future CMS"] },
        analytics: {
          latestSearchRun: null,
          applicationStatusCounts: {},
          outcomeCounts: {},
          agentRunCounts: {},
          sourceCoverage: { activeSources: 0, querySources: 0, manualSources: 0, priorityOneSources: 0 },
        },
      },
    });

    expect(output.hook).toContain("product decision");
    expect(output.body).not.toContain("Write a decision diary");
    expect(output.body).toContain("documentarians before automation");
    expect(output.body).toContain("The artifact behind this note is Agent runs record workflow evidence and review gates.");
    expect(output.body).not.toMatch(/^(Scene|Evidence|Artifact|Decision|Consequence|Lesson|Teardown):/m);
  });

  it("honors detailed Job Search OS narrative briefs instead of falling back to stale plan angles", () => {
    const prompt = [
      "Brief for the documentarian agents: Today I want to publish a LinkedIn that shows the real progress behind my job search app and explains why I am building it.",
      "The post should position the app as more than a resume generator. It is becoming an agent-powered job search operating system that helps candidates understand their experience, find better-fit roles, generate stronger application materials, and continuously improve based on outcomes.",
      "The goal is not to spray and pray applications. The goal is higher-quality matches, better positioning, stronger materials, and a smarter feedback loop.",
      "Generate: 1. Primary LinkedIn post 150-250 words 2. Shorter alternate version under 100 words 3. Three hook options 4. One comment I could leave under the post 5. Screenshot caption options.",
      "Mention that I am building this from my own experience navigating the modern senior engineering job market after a layoff, but do not make the post a sob story.",
    ].join(" ");
    const output = buildLinkedInContentFallback({
      pillar: "app_progress",
      direction: {
        prompt,
        tone: "bold_grounded",
        format: "field_note",
        legacyPillar: "app_progress",
        visualDirection: "show safe app screenshots",
        selectedAngle: "Product narrative on Job Search OS clarity",
        rejectedAngles: ["Plan angle from Tighten Email Ops Signal Quality"],
        intent: planLinkedInPromptIntent(prompt),
        obligations: {
          topic: prompt,
          requiredConcepts: ["job search", "operating system", "agents", "resume", "cover letter", "job matching", "clarity", "quality", "feedback loop"],
          requiredVisuals: ["app_screenshot"],
          forbiddenPhrases: ["plan angle from", "tighten email ops", "the useful angle is"],
          allowSearchFunnelAnalytics: false,
        },
        promptRelevanceScore: 98,
        evidenceAnchors: [{
          sourceType: "aggregate_fact",
          label: "Job Search OS product context",
          text: "Job Search OS includes profile strategy, resume and cover letter generation, job matching, application tracking, analytics, and review-only LinkedIn drafts.",
          relevance: 98,
        }],
        rejectedEvidence: [{ sourceType: "plan", label: "Tighten Email Ops Signal Quality", text: "Make Email Ops strict by default.", relevance: 0 }],
      },
      memoryPack: {
        aggregateFacts: ["Job Search OS includes profile strategy, resume and cover letter generation, job matching, application tracking, analytics, and review-only LinkedIn drafts."],
        storyAngles: ["Plan angle from Tighten Email Ops Signal Quality"],
        planSources: [{ filename: "EMAIL.md", title: "Tighten Email Ops Signal Quality", summary: "Make Email Ops strict by default.", themes: ["Email Ops"] }],
        noveltySignals: { recentHooks: [], recentTitles: [], recentPillars: [], recentScreenshotRoutes: [], avoidPhrases: ["Plan angle from Tighten Email Ops Signal Quality"] },
        analytics: {
          latestSearchRun: null,
          applicationStatusCounts: {},
          outcomeCounts: {},
          agentRunCounts: {},
          sourceCoverage: { activeSources: 0, querySources: 0, manualSources: 0, priorityOneSources: 0 },
        },
      },
    });

    expect(planLinkedInPromptIntent(prompt)).toBe("job_search_os_narrative");
    expect(output.body).toContain("Primary LinkedIn post");
    expect(output.body).toContain("Shorter alternate version");
    expect(output.body).toContain("Hook options");
    expect(output.body).toContain("Comment");
    expect(output.body).toContain("Screenshot caption options");
    expect(output.body).toContain("senior engineering market");
    expect(output.body).toContain("not finished");
    expect(output.body).not.toContain("Plan angle from Tighten Email Ops");
    expect(output.body).not.toContain("The useful angle is");
    expect(output.body).not.toContain("The artifact behind this note");
    expect(output.hashtags).not.toContain("#AgenticAI");
  });

  it("selects Search Operations evidence for chart prompts instead of stale plan angles", () => {
    const output = buildLinkedInContentFallback({
      pillar: "search_learning",
      direction: {
        prompt: "Can we discuss the upgrades to the graphs and charts on the Search Operations page and why those enhancements might be better for the user to digest?",
        tone: "bold_grounded",
        format: "visual_walkthrough",
        legacyPillar: "search_learning",
        visualDirection: "show the search analytics dashboard",
        selectedAngle: "visual walkthrough about Search Operations chart upgrades",
        rejectedAngles: ["Tighten Email Ops Signal Quality", "Execute Source Management Plan"],
        intent: "analytics_insight",
        obligations: {
          topic: "Search Operations charts",
          requiredConcepts: ["analytics", "funnel", "aggregate", "insight", "evidence"],
          requiredVisuals: ["app_screenshot"],
          forbiddenPhrases: ["One plan in the build log keeps pulling me back", "documentarian loop"],
          allowSearchFunnelAnalytics: true,
        },
        promptRelevanceScore: 96,
        evidenceAnchors: [{
          sourceType: "analytics",
          label: "Search Operations analytics",
          text: "Latest Search Operations run: Fetched 19134, Qualified 39, New matches 21, Agency eligible 31; top blocker Existing job duplicate 2783.",
          relevance: 96,
        }],
        rejectedEvidence: [
          { sourceType: "plan", label: "Tighten Email Ops Signal Quality", text: "Make Email Ops strict by default.", relevance: 4 },
          { sourceType: "plan", label: "Execute Source Management Plan", text: "Add company-source creation and Brave-backed search-query support.", relevance: 6 },
        ],
      },
      memoryPack: {
        aggregateFacts: ["Latest search funnel: Fetched 19134, Detail candidates 19104, Scored 19104, Qualified 39, New matches 21, Agency eligible 31."],
        storyAngles: [],
        planSources: [
          { filename: "EMAIL.md", title: "Tighten Email Ops Signal Quality", summary: "Make Email Ops strict by default.", themes: ["Email Ops"] },
          { filename: "SOURCES.md", title: "Execute Source Management Plan", summary: "Add company-source creation and Brave-backed search-query support.", themes: ["Sources"] },
        ],
        noveltySignals: { recentHooks: [], recentTitles: [], recentPillars: [], recentScreenshotRoutes: [], avoidPhrases: ["documentarian loop"] },
        analytics: {
          latestSearchRun: buildSearchRunAnalytics({
            jobsFetched: 19134,
            jobsAfterDedupe: 22,
            jobsAfterFilters: 39,
            jobsSaved: 21,
            progress: [{ stats: { jobsFetched: 19134, detailCandidates: 19104, jobsScored: 19104, jobsAfterFilters: 39, jobsSaved: 21, agencyEligible: 31, existingJobDuplicates: 2783 } }],
          }),
          applicationStatusCounts: {},
          outcomeCounts: {},
          agentRunCounts: {},
          sourceCoverage: { activeSources: 49, querySources: 42, manualSources: 14, priorityOneSources: 16 },
        },
      },
    });

    expect(output.body).toContain("Search Operations");
    expect(output.body).toContain("The run I am using as the receipt: Latest Search Operations run");
    expect(output.body).toContain("The Search Operations dashboard");
    expect(output.body).not.toContain("One plan in the build log keeps pulling me back");
    expect(output.body).not.toContain("Tighten Email Ops Signal Quality");
    expect(output.body).not.toContain("Execute Source Management Plan");
    expect(output.body).not.toMatch(/^(Scene|Evidence|Artifact|Decision|Consequence|Signal|Before|After):/m);
  });

  it("renders before-after chart prompts as public post copy, not documentary scaffolding", () => {
    const output = buildLinkedInContentFallback({
      pillar: "search_learning",
      direction: {
        prompt: "Can we discuss the upgrades to the graphs and charts on the Search Operations page and why those enhancements might be better for the user to digest?",
        tone: "bold_grounded",
        format: "before_after",
        legacyPillar: "search_learning",
        visualDirection: "show the search analytics dashboard",
        selectedAngle: "Search Operations charts before and after",
        rejectedAngles: [],
        intent: "analytics_insight",
        obligations: {
          topic: "Search Operations charts",
          requiredConcepts: ["analytics", "funnel", "aggregate", "insight", "evidence"],
          requiredVisuals: ["app_screenshot"],
          forbiddenPhrases: ["One plan in the build log keeps pulling me back", "documentarian loop"],
          allowSearchFunnelAnalytics: true,
        },
        promptRelevanceScore: 100,
        evidenceAnchors: [{
          sourceType: "analytics",
          label: "Search Operations analytics",
          text: "Latest Search Operations run: Fetched 19134, Detail candidates 19104, Scored 19104, Qualified 39, New matches 21, Agency eligible 31; top blocker Below threshold 2766.",
          relevance: 100,
        }],
        rejectedEvidence: [],
      },
      memoryPack: {
        aggregateFacts: ["Latest search funnel: Fetched 19134, Detail candidates 19104, Scored 19104, Qualified 39, New matches 21, Agency eligible 31."],
        storyAngles: [],
        planSources: [],
        noveltySignals: { recentHooks: [], recentTitles: [], recentPillars: [], recentScreenshotRoutes: [], avoidPhrases: ["documentarian loop"] },
        analytics: {
          latestSearchRun: buildSearchRunAnalytics({
            jobsFetched: 19134,
            jobsAfterDedupe: 22,
            jobsAfterFilters: 39,
            jobsSaved: 21,
            progress: [{ stats: { jobsFetched: 19134, detailCandidates: 19104, jobsScored: 19104, jobsAfterFilters: 39, jobsSaved: 21, agencyEligible: 31, jobsBelowThreshold: 2766 } }],
          }),
          applicationStatusCounts: {},
          outcomeCounts: {},
          agentRunCounts: {},
          sourceCoverage: { activeSources: 49, querySources: 42, manualSources: 14, priorityOneSources: 16 },
        },
      },
    });
    const review = reviewPromptSatisfaction({
      direction: {
        prompt: "Can we discuss the upgrades to the graphs and charts on the Search Operations page and why those enhancements might be better for the user to digest?",
        tone: "bold_grounded",
        format: "before_after",
        legacyPillar: "search_learning",
        visualDirection: "show the search analytics dashboard",
        selectedAngle: "Search Operations charts before and after",
        rejectedAngles: [],
        intent: "analytics_insight",
        obligations: {
          topic: "Search Operations charts",
          requiredConcepts: ["analytics", "funnel", "aggregate", "insight", "evidence"],
          requiredVisuals: ["app_screenshot"],
          forbiddenPhrases: ["One plan in the build log keeps pulling me back", "documentarian loop"],
          allowSearchFunnelAnalytics: true,
        },
        promptRelevanceScore: 100,
        evidenceAnchors: [{
          sourceType: "analytics",
          label: "Search Operations analytics",
          text: "Latest Search Operations run: Fetched 19134, Detail candidates 19104, Scored 19104, Qualified 39, New matches 21, Agency eligible 31; top blocker Below threshold 2766.",
          relevance: 100,
        }],
        rejectedEvidence: [],
      },
      generated: output,
      visualAssets: [safeScreenshot()],
    });

    expect(output.title).toBe("Search Operations charts before and after");
    expect(output.body).toContain("Before, the chart story was basically a conversion line");
    expect(output.body).toContain("After, the dashboard has to explain");
    expect(output.body).toContain("The Search Operations page had a real comprehension problem");
    expect(output.body).toContain("The run I am using as the receipt: Latest Search Operations run");
    expect(output.body).not.toContain("before after about");
    expect(output.body).not.toMatch(/^(before after|Scene|Evidence|Artifact|Decision|Consequence|Signal):/im);
    expect(review.status).toBe("PASS");
  });

  it("passes safe aggregate content and rejects private data", () => {
    expect(reviewLinkedInPostPrivacy({
      hook: "A safer workflow starts with clear boundaries.",
      body: "The app tracks aggregate source coverage and review gates without exposing personal application data.",
      disclosureText: "Prepared by my agent content team from the Job Search OS build log.",
      sourceFacts: ["Direct ATS adapters and open-web query coverage are separated."],
      screenshotAssets: [{ label: "App screenshot", route: "/dashboard", privacyStatus: "PASS", warnings: [], description: "Aggregate metrics only." }],
      claims: [{ text: "Direct ATS adapters and open-web query coverage are separated.", provenance: "memory_pack.aggregateFacts", status: "grounded" }],
    })).toMatchObject({ status: "PASS", warnings: [] });

    expect(reviewLinkedInPostPrivacy({
      hook: "Update",
      body: "I applied at Acme for $180k. Email me at person@example.com.",
      disclosureText: "Prepared by agents.",
      sourceFacts: ["https://linkedin.com/jobs/view/123"],
      screenshotAssets: [],
    })).toMatchObject({
      status: "NEEDS_REVIEW",
      blockedTerms: expect.arrayContaining(["email address", "salary or compensation"]),
    });
  });

  it("detects architecture diagram prompts as architecture_diagram intent", () => {
    expect(planLinkedInPromptIntent("I would like a post documenting our system architecture with architectural diagrams")).toBe("architecture_diagram");
    expect(planLinkedInPromptIntent("Write about Jolene scanning my email")).toBe("email_ops");
  });

  it("builds architecture-specific fallback copy without the old generic template", () => {
    const direction = architectureDirection();
    const output = buildLinkedInContentFallback({
      pillar: "architecture",
      direction,
      memoryPack: {
        aggregateFacts: ["Latest search funnel: Fetched 1000, New matches 25."],
        storyAngles: [],
        planSources: [{ filename: "ARCH.md", title: "Architecture Plan", summary: "Document system layers and agent handoffs.", themes: ["Architecture"] }],
        noveltySignals: { recentHooks: [], recentTitles: [], recentPillars: [], recentScreenshotRoutes: [], avoidPhrases: ["future CMS"] },
        analytics: {
          latestSearchRun: null,
          applicationStatusCounts: {},
          outcomeCounts: {},
          agentRunCounts: {},
          sourceCoverage: { activeSources: 0, querySources: 0, manualSources: 0, priorityOneSources: 0 },
        },
      },
    });

    expect(output.body).toContain("Next.js App Router");
    expect(output.body).toContain("Prisma/Postgres");
    expect(output.body).toContain("AgentRun");
    expect(output.body).toContain("diagrams");
    expect(output.body).not.toContain("Today's content brief");
    expect(output.body).not.toContain("I would document");
    expect(output.body).not.toContain("The clearest source is");
    expect(output.body).not.toContain("Latest search funnel");
    expect(output.body).not.toContain("practical testbed");
    expect(output.body).not.toContain("latest run moved through");
    expect(output.body).not.toContain("blank page");
  });

  it("reviews architecture prompt satisfaction and requires diagram assets", () => {
    const direction = architectureDirection();
    const bad = reviewPromptSatisfaction({
      direction,
      generated: {
        title: "Search funnel notes",
        hook: "The latest run moved through a lot of jobs.",
        body: "The latest run moved through fetched 1000 and the boundary matters.",
      },
      visualAssets: [safeScreenshot()],
    });
    expect(bad.status).toBe("NEEDS_REVIEW");
    expect(bad.warnings.join(" ")).toContain("Architecture prompt requires");

    const good = reviewPromptSatisfaction({
      direction,
      generated: {
        title: "System architecture with diagrams",
        hook: "The architecture diagrams show the agent services and approval gates.",
        body: "The Next.js API routes coordinate agent services. Prisma/Postgres stores AgentRun memory, and LinkedIn publish approval gates keep external actions reviewed. The diagram shows this architecture.",
      },
      visualAssets: [{ label: "Architecture diagram", path: "/generated/test.png", mimeType: "image/png", description: "System Architecture", route: "diagram:system-architecture", assetType: "diagram", privacyStatus: "PASS", warnings: [] }],
    });
    expect(good.status).toBe("PASS");
  });

  it("passes prompt review when evidence is present and blocks when it is absent", () => {
    const direction: LinkedInContentDirection = {
      prompt: "Explain Search Operations chart upgrades",
      tone: "bold_grounded",
      format: "visual_walkthrough",
      legacyPillar: "search_learning",
      visualDirection: "show charts",
      selectedAngle: "Search Operations chart upgrades",
      rejectedAngles: [],
      intent: "analytics_insight",
      obligations: {
        topic: "Search Operations charts",
        requiredConcepts: ["analytics", "funnel", "aggregate", "insight", "evidence"],
        requiredVisuals: ["app_screenshot"],
        forbiddenPhrases: ["One plan in the build log keeps pulling me back"],
        allowSearchFunnelAnalytics: true,
      },
      promptRelevanceScore: 95,
      evidenceAnchors: [{ sourceType: "analytics", label: "Search Operations analytics", text: "Latest Search Operations run: Fetched 19134, Qualified 39, New matches 21.", relevance: 95 }],
      rejectedEvidence: [],
    };

    const good = reviewPromptSatisfaction({
      direction,
      generated: {
        title: "Search Operations chart upgrades",
        hook: "The analytics dashboard changed how the run is explained.",
        body: "The funnel is now easier to digest because the insight starts from blocker and saved-match evidence. Evidence: Latest Search Operations run: Fetched 19134, Qualified 39, New matches 21.",
      },
      visualAssets: [safeScreenshot()],
    });
    expect(good.status).toBe("PASS");

    const bad = reviewPromptSatisfaction({
      direction,
      generated: {
        title: "Generic build log",
        hook: "The build is improving.",
        body: "The content system is becoming a useful operating system.",
      },
      visualAssets: [safeScreenshot()],
    });
    expect(bad.status).toBe("NEEDS_REVIEW");
    expect(bad.warnings.join(" ")).toContain("evidence");
  });

  it("requires concrete body evidence and a passing app screenshot for visual prompts", () => {
    const direction: LinkedInContentDirection = {
      prompt: "Explain Search Operations chart upgrades",
      tone: "bold_grounded",
      format: "visual_walkthrough",
      legacyPillar: "search_learning",
      visualDirection: "show charts",
      selectedAngle: "Search Operations chart upgrades",
      rejectedAngles: [],
      intent: "analytics_insight",
      obligations: {
        topic: "Search Operations charts",
        requiredConcepts: ["analytics", "funnel", "aggregate", "insight", "evidence"],
        requiredVisuals: ["app_screenshot"],
        forbiddenPhrases: ["One plan in the build log keeps pulling me back"],
        allowSearchFunnelAnalytics: true,
      },
      promptRelevanceScore: 95,
      evidenceAnchors: [{ sourceType: "analytics", label: "Search Operations analytics", text: "Latest Search Operations run: Fetched 19134, Qualified 39, New matches 21.", relevance: 95 }],
      rejectedEvidence: [],
    };

    const genericEvidence = reviewPromptSatisfaction({
      direction,
      generated: {
        title: "Search Operations chart upgrades",
        hook: "The analytics dashboard changed how the run is explained.",
        body: "The funnel has aggregate insight. Evidence: pending.",
      },
      visualAssets: [safeScreenshot()],
    });
    expect(genericEvidence.status).toBe("NEEDS_REVIEW");
    expect(genericEvidence.warnings.join(" ")).toContain("evidence");

    const missingScreenshot = reviewPromptSatisfaction({
      direction,
      generated: {
        title: "Search Operations chart upgrades",
        hook: "The analytics dashboard changed how the run is explained.",
        body: "The funnel has aggregate insight. Evidence: Latest Search Operations run: Fetched 19134, Qualified 39, New matches 21.",
      },
      visualAssets: [],
    });
    expect(missingScreenshot.status).toBe("NEEDS_REVIEW");
    expect(missingScreenshot.warnings.join(" ")).toContain("app screenshot");

    const diagramOnly = reviewPromptSatisfaction({
      direction,
      generated: {
        title: "Search Operations chart upgrades",
        hook: "The analytics dashboard changed how the run is explained.",
        body: "The funnel has aggregate insight. Evidence: Latest Search Operations run: Fetched 19134, Qualified 39, New matches 21.",
      },
      visualAssets: [{ label: "Diagram", path: "/generated/diagram.png", mimeType: "image/png", description: "Diagram", route: "diagram:test", assetType: "diagram", privacyStatus: "PASS", warnings: [] }],
    });
    expect(diagramOnly.status).toBe("NEEDS_REVIEW");
  });

  it("grounds concrete body claims against source facts and selected evidence anchors", () => {
    const memoryPack = minimalMemoryPack(["Latest search funnel: Fetched 19134, Qualified 39, New matches 21."]);
    const direction: LinkedInContentDirection = {
      prompt: "Explain Search Operations chart upgrades",
      tone: "bold_grounded",
      format: "visual_walkthrough",
      legacyPillar: "search_learning",
      visualDirection: "show charts",
      selectedAngle: "Search Operations chart upgrades",
      rejectedAngles: [],
      intent: "analytics_insight",
      obligations: {
        topic: "Search Operations charts",
        requiredConcepts: ["analytics", "funnel", "aggregate", "insight", "evidence"],
        requiredVisuals: ["app_screenshot"],
        forbiddenPhrases: [],
        allowSearchFunnelAnalytics: true,
      },
      promptRelevanceScore: 95,
      evidenceAnchors: [{
        sourceType: "analytics",
        label: "Search Operations analytics",
        text: "Latest Search Operations run: Fetched 19134, Qualified 39, New matches 21.",
        relevance: 95,
        sourceRef: "analytics.latestSearchRun",
      }],
      rejectedEvidence: [],
    };

    const grounded = buildClaims({
      body: "The Search Operations run had Fetched 19134, Qualified 39, and New matches 21.",
      sourceFacts: ["Latest search funnel: Fetched 19134, Qualified 39, New matches 21."],
    }, memoryPack, direction);
    expect(grounded.some((claim) => claim.status === "ungrounded")).toBe(false);

    const ungrounded = buildClaims({
      body: "The dashboard now has 250 paying teams and 91 percent automated publishing.",
      sourceFacts: [],
    }, memoryPack, direction);
    expect(ungrounded).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "ungrounded" }),
    ]));
  });

  it("blocks the pasted bad-output family even when it contains analytics-shaped words", () => {
    const direction: LinkedInContentDirection = {
      prompt: "Can we discuss the upgrades to the graphs and charts on the Search Operations page and why those enhancements might be better for the user to digest?",
      tone: "bold_grounded",
      format: "before_after",
      legacyPillar: "search_learning",
      visualDirection: "show charts",
      selectedAngle: "Search Operations charts before and after",
      rejectedAngles: [],
      intent: "analytics_insight",
      obligations: {
        topic: "Search Operations charts",
        requiredConcepts: ["analytics", "funnel", "aggregate", "insight", "evidence"],
        requiredVisuals: ["app_screenshot"],
        forbiddenPhrases: ["One plan in the build log keeps pulling me back", "documentarian loop", "clearest source"],
        allowSearchFunnelAnalytics: true,
      },
      promptRelevanceScore: 95,
      evidenceAnchors: [{ sourceType: "analytics", label: "Search Operations analytics", text: "Latest Search Operations run: Fetched 19134, Qualified 39, New matches 21.", relevance: 95 }],
      rejectedEvidence: [],
    };
    const review = reviewPromptSatisfaction({
      direction,
      generated: {
        title: "before after about Can we discuss the upgrades to the graphs and charts",
        hook: "One plan in the build log keeps pulling me back.",
        body: "The clearest source is a funnel analytics insight. Evidence: pending. The documentarian loop says this dashboard should feel more real.",
      },
      visualAssets: [safeScreenshot()],
    });

    expect(review.status).toBe("NEEDS_REVIEW");
    expect(review.warnings.join(" ")).toContain("One plan in the build log keeps pulling me back");
    expect(review.warnings.join(" ")).toContain("clearest source");
    expect(review.warnings.join(" ")).toContain("evidence");
  });

  it("keeps documentary fallback formats distinct and gates funnel analytics by intent", () => {
    const formats = ["field_note", "lesson", "product_thesis", "teardown", "visual_walkthrough"] as const;
    const bodies = formats.map((format) => buildLinkedInContentFallback({
      pillar: "workflow_design",
      direction: {
        prompt: "Explain the content review upgrade",
        tone: "bold_grounded",
        format,
        legacyPillar: "workflow_design",
        visualDirection: "",
        selectedAngle: `${format} on content review`,
        rejectedAngles: [],
        intent: "workflow_story",
        obligations: {
          topic: "content review upgrade",
          requiredConcepts: ["workflow story", "agents", "evidence"],
          requiredVisuals: ["app_screenshot"],
          forbiddenPhrases: [],
          allowSearchFunnelAnalytics: false,
        },
        promptRelevanceScore: 90,
        evidenceAnchors: [{ sourceType: "aggregate_fact", label: "Review evidence", text: "Content reviews now require prompt evidence and source rationale.", relevance: 90 }],
        rejectedEvidence: [],
      },
      memoryPack: {
        aggregateFacts: ["Latest search funnel: Fetched 1000, New matches 25."],
        storyAngles: [],
        planSources: [],
        noveltySignals: { recentHooks: [], recentTitles: [], recentPillars: [], recentScreenshotRoutes: [], avoidPhrases: [] },
        analytics: {
          latestSearchRun: buildSearchRunAnalytics({ jobsFetched: 1000, jobsAfterDedupe: 500, jobsAfterFilters: 50, jobsSaved: 25 }),
          applicationStatusCounts: {},
          outcomeCounts: {},
          agentRunCounts: {},
          sourceCoverage: { activeSources: 0, querySources: 0, manualSources: 0, priorityOneSources: 0 },
        },
      },
    }).body);

    expect(new Set(bodies).size).toBe(formats.length);
    for (const body of bodies) {
      expect(body).toContain("The artifact behind this note is Content reviews now require prompt evidence and source rationale.");
      expect(body).not.toContain("fetched 1000");
      expect(body).not.toContain("Latest search funnel");
      expect(body).not.toMatch(/^(Scene|Evidence|Artifact|Decision|Consequence|Lesson|Teardown|Thesis):/m);
    }
  });

  it("creates architecture diagram specs for system architecture and content flow", () => {
    const specs = buildArchitectureDiagramSpecs(architectureDirection());
    expect(specs.map((spec) => spec.id)).toEqual(["system-architecture", "agent-content-flow"]);
    expect(specs[0].columns.flatMap((column) => column.items).join(" ")).toContain("Prisma/Postgres");
    expect(specs[0].diagramKind).toBe("system_architecture");
    expect(specs[0].relationships.length).toBeGreaterThan(0);
    expect(specs[0].callouts.join(" ")).toContain("provenance");
    expect(specs[0].provenance.length).toBeGreaterThan(0);
  });

  it("creates topology specs for system architecture prompts", () => {
    const spec = buildArchitectureTopologySpec(architectureDirection());
    expect(spec.id).toBe("job-search-os-topology");
    expect(spec.diagramKind).toBe("system_architecture");
    expect(spec.groups.map((group) => group.id)).toEqual(expect.arrayContaining(["experience", "control", "agents", "memory", "external"]));
    expect(spec.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["dashboard", "api-routes", "jolene-loop", "content-team", "postgres", "linkedin-publish"]));
    expect(spec.edges.length).toBeGreaterThan(6);
    expect(spec.legend.length).toBeGreaterThan(4);
    expect(spec.provenance.length).toBeGreaterThan(0);
  });

  it("reviews topology node, legend, density, overflow, and provenance quality", () => {
    const good = reviewTopologySpecQuality(buildArchitectureTopologySpec(architectureDirection()));
    expect(good.status).toBe("PASS");
    expect(good.checks.topology).toBe("PASS");
    expect(good.checks.legend).toBe("PASS");
    expect(good.checks.provenance).toBe("PASS");

    const bad = reviewTopologySpecQuality(badTopologySpec(), ["Legend card overflow: Too much."]);
    expect(bad.status).toBe("NEEDS_REVIEW");
    expect(bad.checks.topology).toBe("NEEDS_REVIEW");
    expect(bad.checks.legend).toBe("NEEDS_REVIEW");
    expect(bad.checks.provenance).toBe("NEEDS_REVIEW");
    expect(bad.warnings.join(" ")).toContain("overflow");
  });

  it("reviews staff-engineer diagram typography, spacing, overflow, and provenance", () => {
    const good = reviewDiagramSpecQuality(buildArchitectureDiagramSpecs(architectureDirection())[0]);
    expect(good.status).toBe("PASS");
    expect(good.checks.typography).toBe("PASS");
    expect(good.checks.provenance).toBe("PASS");

    const bad = reviewDiagramSpecQuality({
      id: "bad",
      title: "Bad",
      subtitle: "Bad",
      diagramKind: "system_architecture",
      rationale: "Bad",
      designIntent: "Bad",
      columns: [
        { title: "Too much", items: ["This label is intentionally far too long for a polished technical diagram and should trigger typography review because it will not scan well on LinkedIn", "Two", "Three", "Four", "Five"] },
        { title: "Another", items: ["Item"] },
        { title: "Another", items: ["Item"] },
        { title: "Another", items: ["Item"] },
        { title: "Another", items: ["Item"] },
        { title: "Another", items: ["Item"] },
      ],
      relationships: [],
      callouts: [],
      footer: "Bad",
      provenance: [],
    }, ["Diagram card overflow: Too much."]);
    expect(bad.status).toBe("NEEDS_REVIEW");
    expect(bad.warnings.join(" ")).toContain("overflow");
    expect(bad.checks.typography).toBe("NEEDS_REVIEW");
    expect(bad.checks.provenance).toBe("NEEDS_REVIEW");
  });

  it("keeps deterministic diagrams authoritative over optional AI polish", () => {
    expect(source).toContain("assetType?: \"screenshot\" | \"diagram\" | \"ai_polish\"");
    expect(source).toContain("LINKEDIN_ENABLE_AI_VISUAL_POLISH");
    expect(source).toContain("Treat AI polish as optional social texture");
    expect(source).toContain("passingDiagrams");
    expect(source).toContain("architecture-topology-v1");
    expect(source).toContain("topology_legend");
    expect(source).toContain("staff-engineer-html-v1");
  });

  it("captures app screenshots with enough viewport and chart paint time for rendered charts", () => {
    expect(source).toContain("viewport: { width: 1440, height: 1120 }");
    expect(source).toContain('locator("svg").first().waitFor');
    expect(source).toContain("waitForTimeout(500)");
  });
});

function safeScreenshot(): LinkedInScreenshotAsset {
  return {
    label: "Search Operations screenshot",
    path: "/generated/linkedin-content/search-operations.png",
    mimeType: "image/png",
    description: "Safe aggregate Search Operations dashboard screenshot.",
    route: "/dashboard/search",
    assetType: "screenshot",
    privacyStatus: "PASS",
    warnings: [],
  };
}

function minimalMemoryPack(aggregateFacts: string[]) {
  return {
    generatedAt: "2026-06-15T12:00:00.000Z",
    publicPolicy: "Aggregate only.",
    aggregateFacts,
    recentDecisions: [],
    lessonsLearned: [],
    storyAngles: [],
    doNotClaim: [],
    screenshotRecommendations: [],
    planSources: [],
    noveltySignals: { recentHooks: [], recentTitles: [], recentPillars: [], recentScreenshotRoutes: [], avoidPhrases: [] },
    analytics: {
      latestSearchRun: null,
      applicationStatusCounts: {},
      outcomeCounts: {},
      agentRunCounts: {},
      sourceCoverage: { activeSources: 0, querySources: 0, manualSources: 0, priorityOneSources: 0 },
    },
    memorySources: [],
    analyticsSources: [],
  };
}

function badTopologySpec(): ArchitectureTopologySpec {
  const base = buildArchitectureTopologySpec(architectureDirection());
  return {
    ...base,
    groups: [],
    nodes: [
      ...base.nodes,
      { id: "bad", label: "This node label is too long for topology readability", icon: "BAD", x: 1200, y: 900 },
      { id: "bad2", label: "Another long topology node label", icon: "BAD", x: 1210, y: 910 },
      { id: "bad3", label: "Another long topology node label", icon: "BAD", x: 1220, y: 920 },
      { id: "bad4", label: "Another long topology node label", icon: "BAD", x: 1230, y: 930 },
      { id: "bad5", label: "Another long topology node label", icon: "BAD", x: 1240, y: 940 },
    ],
    edges: [...base.edges, { from: "missing", to: "bad", label: "this connector label is intentionally too long", style: "solid" }],
    legend: [{ number: 1, title: "This legend card title is far too long for the side rail", color: "#fff", bullets: ["This legend bullet is intentionally far too long for a compact LinkedIn topology diagram side rail and should be flagged by QA.", "Two", "Three"] }],
    provenance: [],
  };
}

function architectureDirection(): LinkedInContentDirection {
  return {
    prompt: "I would like a post documenting our system architecture with architectural diagrams",
    tone: "bold_grounded",
    format: "decision_diary",
    legacyPillar: "architecture",
    visualDirection: "show system architecture diagrams",
    selectedAngle: "Architecture diagrams for Job Search OS",
    rejectedAngles: [],
    intent: "architecture_diagram",
    obligations: {
      topic: "system architecture with architectural diagrams",
      requiredConcepts: ["architecture", "Next.js", "API routes", "agent services", "Prisma/Postgres", "AgentRun", "memory", "approval gates", "LinkedIn publish", "diagram"],
      requiredVisuals: ["architecture_diagram"],
      forbiddenPhrases: ["practical testbed", "blank page", "boundary matters", "today's content brief", "i would document", "clearest source", "latest run moved through", "drop-off pattern"],
      allowSearchFunnelAnalytics: false,
    },
    promptRelevanceScore: 100,
    evidenceAnchors: [{ sourceType: "plan", label: "Architecture Plan", text: "Document system layers and agent handoffs.", relevance: 100 }],
    rejectedEvidence: [],
  };
}
