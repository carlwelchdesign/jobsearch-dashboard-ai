import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Command Center market analysis", () => {
  it("loads the latest market intelligence run and renders the dashboard card", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");
    const cardSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/market-analysis-card.tsx"), "utf8");

    expect(pageSource).toContain('agentType: "MARKET_INTELLIGENCE"');
    expect(pageSource).toContain("<MarketAnalysisCard");
    expect(pageSource).toContain("latestManualSearchRun");
    expect(pageSource).toContain("latestCronSearchRun");
    expect(cardSource).toContain("Market Analysis");
    expect(cardSource).toContain("No market analysis report yet");
    expect(cardSource).toContain("Search and cron health");
    expect(cardSource).toContain("Search learning");
    expect(cardSource).toContain("Search adapted");
    expect(cardSource).toContain("Needs review");
    expect(cardSource).toContain("triggeredBy: cron");
  });

  it("keeps manual refresh wired to the existing market-intelligence endpoint", () => {
    const cardSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/market-analysis-card.tsx"), "utf8");

    expect(cardSource).toContain('postTo="/api/market-intelligence/run"');
    expect(cardSource).toContain("Run market brief");
    expect(cardSource).toContain("recommendedActions.slice(0, 3)");
  });
});
