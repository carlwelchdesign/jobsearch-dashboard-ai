import { describe, expect, it } from "vitest";
import {
  manualOrAuthGatedProviderCoverage,
  mergeSearchQuerySourceConfig,
  requestedProviderCoverage,
  searchQueryTemplates,
  sourceCatalog,
} from "@/lib/job-search/source-catalog";

const queryAliases: Record<string, string[]> = {
  "Oracle Taleo": ["taleo.net", "oracle"],
  "SAP SuccessFactors": ["successfactors.com", "sap"],
  "Wellfound": ["wellfound.com", "angellist"],
  "USAJOBS": ["usajobs.gov"],
  "Join": ["join.com"],
};

describe("source catalog provider coverage", () => {
  it("lists every requested provider in the source catalog", () => {
    const names = new Set(sourceCatalog.map((item) => item.name));

    for (const provider of requestedProviderCoverage) {
      expect(names.has(provider), provider).toBe(true);
    }
  });

  it("has search query coverage for each non-manual requested provider", () => {
    const manual = new Set<string>(manualOrAuthGatedProviderCoverage);
    const haystack = searchQueryTemplates.join("\n").toLowerCase();

    for (const provider of requestedProviderCoverage) {
      if (manual.has(provider)) continue;
      const aliases = queryAliases[provider] ?? [provider.toLowerCase().replace(/\s+\(.*\)$/, "").replace(/\s+/g, "")];
      expect(aliases.some((alias) => haystack.includes(alias.toLowerCase())), provider).toBe(true);
    }
  });

  it("merges new default queries without removing custom user queries", () => {
    const custom = '"Frontend Engineer" "found on LinkedIn" "apply"';
    const merged = mergeSearchQuerySourceConfig({
      provider: "brave",
      queries: [custom],
      maxResultsPerQuery: 3,
      maxFetch: 42,
    });

    expect(merged.queries).toContain(custom);
    expect(merged.queries).toContain('site:bullhorn.com "Frontend Engineer" "React" "remote"');
    expect(merged.queries).toContain('site:ziprecruiter.com/jobs "Frontend Engineer" "React" "remote"');
    expect(merged.maxResultsPerQuery).toBe(3);
    expect(merged.maxFetch).toBe(42);
  });
});
