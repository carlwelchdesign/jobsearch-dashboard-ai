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
    expect(source).toContain('chartHeight={{ xs: 320, sm: 300, lg: 230 }}');
    expect(source).toContain('chartHeight={{ xs: 330, md: 320 }}');
    expect(source).toContain('gridTemplateRows: { xs: "118px minmax(0, 1fr)", sm: "1fr" }');
    expect(source).toContain("Signal rail");
    expect(source).toContain("Opportunity sheet");
    expect(source).not.toContain("OutcomeSegmentBar");
    expect(source).not.toContain("Run Outcome Mix");
    expect(source).not.toContain("Live conversion");
    expect(source).not.toContain("kept");
    expect(source).not.toContain("dropped");
  });
});
