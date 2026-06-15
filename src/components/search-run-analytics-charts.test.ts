import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("SearchRunAnalyticsCharts source contract", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/search-run-analytics-charts.tsx"), "utf8");

  it("replaces the old retention graph language with outcome-focused charts", () => {
    expect(source).toContain("SearchRunInsightBoard");
    expect(source).toContain("RunQualityGauge");
    expect(source).toContain("OpportunityTerrainChart");
    expect(source).toContain("SignalRadar");
    expect(source).toContain("SourceYieldScatter");
    expect(source).toContain("QualityBandChart");
    expect(source).toContain("Search Momentum");
    expect(source).toContain("CompactKpi");
    expect(source).toContain("MiniChartPanel");
    expect(source).toContain("Signal rail");
    expect(source).toContain("Opportunity sheet");
    expect(source).not.toContain("OutcomeSegmentBar");
    expect(source).not.toContain("Run Outcome Mix");
    expect(source).not.toContain("Live conversion");
    expect(source).not.toContain("kept");
    expect(source).not.toContain("dropped");
  });
});
