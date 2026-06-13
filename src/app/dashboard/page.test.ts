import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Command Center market analysis", () => {
  it("loads the latest market intelligence run and renders the dashboard card", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");
    const cardSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/market-analysis-card.tsx"), "utf8");
    const tabsSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/market-analysis-tabs.tsx"), "utf8");

    expect(pageSource).toContain('agentType: "MARKET_INTELLIGENCE"');
    expect(pageSource).toContain("findMany");
    expect(pageSource).toContain("buildMarketTrendSeries");
    expect(pageSource).toContain("<MarketAnalysisCard");
    expect(pageSource).toContain("<LinkedInAnalyticsCard");
    expect(pageSource).toContain("getLinkedInAnalyticsSummary");
    expect(pageSource).toContain("trendSeries={marketTrendSeries}");
    expect(pageSource).toContain("latestManualSearchRun");
    expect(pageSource).toContain("latestCronSearchRun");
    expect(cardSource).toContain("Market Analysis");
    expect(tabsSource).toContain("No market analysis report yet");
    expect(cardSource).toContain("MarketAnalysisTabs");
  });

  it("keeps manual refresh wired to the existing market-intelligence endpoint", () => {
    const cardSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/market-analysis-card.tsx"), "utf8");

    expect(cardSource).toContain('postTo="/api/market-intelligence/run"');
    expect(cardSource).toContain("Run market brief");
  });

  it("centralizes the detailed market brief on the dashboard instead of profiles", () => {
    const tabsSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/market-analysis-tabs.tsx"), "utf8");
    const chartsSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/market-analysis-charts.tsx"), "utf8");
    const profilesSource = readFileSync(resolve(process.cwd(), "src/app/profiles/page.tsx"), "utf8");

    expect(tabsSource).toContain("dynamic");
    expect(tabsSource).toContain("MarketAnalysisCharts");
    expect(chartsSource).toContain("Role Lane Demand");
    expect(chartsSource).toContain("Skill Signals");
    expect(chartsSource).toContain("Market Trend");
    expect(tabsSource).toContain("Fresh articles");
    expect(tabsSource).toContain("Search learning");
    expect(chartsSource).toContain("BarChart");
    expect(chartsSource).toContain("LineChart");
    expect(chartsSource).toContain("PieChart");
    expect(chartsSource).toContain("ScatterChart");
    const linkedinAnalyticsSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/linkedin-analytics-card.tsx"), "utf8");
    expect(linkedinAnalyticsSource).toContain("Post performance");
    expect(linkedinAnalyticsSource).toContain("Import CSV");
    expect(linkedinAnalyticsSource).toContain("LineChart");
    expect(linkedinAnalyticsSource).toContain("PieChart");
    expect(linkedinAnalyticsSource).toContain("ScatterChart");
    expect(profilesSource).not.toContain("MarketIntelligencePanel");
    expect(profilesSource).not.toContain('agentType: "MARKET_INTELLIGENCE"');
  });
});
