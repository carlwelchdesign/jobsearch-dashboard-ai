import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Command Center subnav routes", () => {
  it("splits dashboard sections into focused subroutes with a shared subnav", () => {
    const contentSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/dashboard-content.tsx"), "utf8");
    const overviewSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");
    const searchSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/search/page.tsx"), "utf8");
    const emailOpsSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/email-ops/page.tsx"), "utf8");
    const socialSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/social/page.tsx"), "utf8");
    const marketSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/market/page.tsx"), "utf8");
    const pipelineSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/pipeline/page.tsx"), "utf8");

    expect(contentSource).toContain("Command Center:");
    expect(contentSource).toContain("Overview");
    expect(contentSource).toContain("Search Ops");
    expect(contentSource).toContain("Email Ops");
    expect(contentSource).toContain("Social");
    expect(contentSource).toContain("Market");
    expect(contentSource).toContain("Pipeline");
    expect(overviewSource).toContain("DashboardOverviewPage");
    expect(searchSource).toContain("DashboardSearchPage");
    expect(emailOpsSource).toContain("DashboardEmailOpsPage");
    expect(socialSource).toContain("DashboardSocialPage");
    expect(marketSource).toContain("DashboardMarketPage");
    expect(pipelineSource).toContain("DashboardPipelinePage");
  });

  it("keeps LinkedIn analytics and content studio access in the Social route", () => {
    const contentSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/dashboard-content.tsx"), "utf8");

    expect(contentSource).toContain("DashboardSocialPage");
    expect(contentSource).toContain("<LinkedInAnalyticsCard");
    expect(contentSource).toContain('href="/linkedin-content"');
    expect(contentSource).toContain("Open LinkedIn Content");
  });

  it("shows Jolene as a proactive Chief of Staff on the dashboard overview", () => {
    const contentSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/dashboard-content.tsx"), "utf8");

    expect(contentSource).toContain("Jolene, Chief of Staff");
    expect(contentSource).toContain("Operating Loop");
    expect(contentSource).toContain("/api/jolene/operating-loop");
    expect(contentSource).toContain("/api/jolene/operating-loop/approve");
    expect(contentSource).toContain("Run Operating Loop");
    expect(contentSource).toContain("propose first");
    expect(contentSource).toContain("/api/jolene/chief-of-staff/run");
    expect(contentSource).toContain("/api/jolene/chief-of-staff/approve");
    expect(contentSource).toContain("Ask Jolene");
    expect(contentSource).toContain("priority.evidence");
    expect(contentSource).toContain("Email Operations");
    expect(contentSource).toContain('href="/dashboard/email-ops"');
  });

  it("surfaces lifecycle readiness on the Command Center overview", () => {
    const contentSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/dashboard-content.tsx"), "utf8");
    const cockpitSource = readFileSync(resolve(process.cwd(), "src/components/readiness/readiness-cockpit.tsx"), "utf8");
    const readinessSource = readFileSync(resolve(process.cwd(), "src/lib/readiness/lifecycle.ts"), "utf8");

    expect(contentSource).toContain("ReadinessOperatingCockpit");
    expect(contentSource).toContain("buildLifecycleReadiness");
    expect(cockpitSource).toContain("Operating cockpit");
    expect(cockpitSource).toContain("Lifecycle readiness");
    expect(cockpitSource).toContain("Priority readiness worklist");
    expect(cockpitSource).toContain("Value proof");
    expect(readinessSource).toContain("setup.profile");
    expect(readinessSource).toContain("search.latest_run");
    expect(readinessSource).toContain("review.exceptions");
    expect(readinessSource).toContain("packet.materials");
    expect(readinessSource).toContain("apply.ready");
    expect(readinessSource).toContain("follow_up.due");
    expect(readinessSource).toContain("interview.prep");
    expect(readinessSource).toContain("outcome.signals");
    expect(readinessSource).toContain("trust.unsupported_claims");
    expect(readinessSource).toContain("health.system");
  });

  it("shows Email Ops workflow controls and safety copy in its dashboard route", () => {
    const contentSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/dashboard-content.tsx"), "utf8");

    expect(contentSource).toContain("DashboardEmailOpsPage");
    expect(contentSource).toContain("/api/jolene/email-ops/run");
    expect(contentSource).toContain("/api/jolene/email-ops/findings/");
    expect(contentSource).toContain("Calendar Drafts");
    expect(contentSource).toContain("Safety Policy");
  });

  it("surfaces recruiting search optimization on the Search Ops route", () => {
    const contentSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/dashboard-content.tsx"), "utf8");
    const commandCenterSource = readFileSync(resolve(process.cwd(), "src/components/search-run-command-center.tsx"), "utf8");

    expect(contentSource).toContain("searchOptimizationRun.findFirst");
    expect(contentSource).toContain("serializeSearchOptimization");
    expect(commandCenterSource).toContain("Recruiting Search Team");
    expect(commandCenterSource).toContain("Qualified yield");
    expect(commandCenterSource).toContain('href="/profiles"');
  });

  it("keeps market analysis centralized on the market dashboard route", () => {
    const contentSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/dashboard-content.tsx"), "utf8");
    const tabsSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/market-analysis-tabs.tsx"), "utf8");
    const chartsSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/market-analysis-charts.tsx"), "utf8");
    const profilesSource = readFileSync(resolve(process.cwd(), "src/app/profiles/page.tsx"), "utf8");

    expect(contentSource).toContain('agentType: "MARKET_INTELLIGENCE"');
    expect(contentSource).toContain("<MarketAnalysisCard");
    expect(contentSource).toContain("buildMarketTrendSeries");
    expect(tabsSource).toContain("MarketAnalysisCharts");
    expect(chartsSource).toContain("Role Lane Demand");
    expect(chartsSource).toContain("LineChart");
    expect(chartsSource).toContain("PieChart");
    expect(chartsSource).toContain("ScatterChart");
    expect(profilesSource).not.toContain("MarketIntelligencePanel");
    expect(profilesSource).not.toContain('agentType: "MARKET_INTELLIGENCE"');
  });
});
