import { describe, expect, it } from "vitest";
import {
  localCommuteSearchQueryTemplates,
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
  "Remote Rocketship": ["remoterocketship.com"],
  "JS Remotely": ["jsremotely.com"],
  "Pyjama Jobs by Kickresume": ["kickresume.com/jobs"],
};

describe("source catalog provider coverage", () => {
  it("prioritizes local commute searches without forcing remote-only results", () => {
    const localHaystack = localCommuteSearchQueryTemplates.join("\n").toLowerCase();

    expect(searchQueryTemplates.slice(0, localCommuteSearchQueryTemplates.length)).toEqual(localCommuteSearchQueryTemplates);
    for (const city of ["Ventura", "Oxnard", "Santa Barbara", "Goleta", "Thousand Oaks", "Woodland Hills", "Calabasas"]) {
      expect(localHaystack).toContain(city.toLowerCase());
    }
    expect(localCommuteSearchQueryTemplates.some((query) => !/\bremote\b/i.test(query))).toBe(true);
  });

  it("lists every requested provider in the source catalog", () => {
    const names = new Set(sourceCatalog.map((item) => item.name));

    for (const provider of requestedProviderCoverage) {
      expect(names.has(provider), provider).toBe(true);
    }
  });

  it("has search query coverage for each requested active search-query provider", () => {
    const haystack = searchQueryTemplates.join("\n").toLowerCase();
    const catalogByName = new Map(sourceCatalog.map((item) => [item.name, item]));

    for (const provider of requestedProviderCoverage) {
      const source = catalogByName.get(provider);
      if (!source || source.connector !== "search_query" || source.status !== "active") continue;
      const aliases = queryAliases[provider] ?? [provider.toLowerCase().replace(/\s+\(.*\)$/, "").replace(/\s+/g, "")];
      expect(aliases.some((alias) => haystack.includes(alias.toLowerCase())), provider).toBe(true);
    }
  });

  it("keeps manual and adapter-backed requested sources exempt from Brave query requirements", () => {
    const catalogByName = new Map(sourceCatalog.map((item) => [item.name, item]));

    for (const provider of manualOrAuthGatedProviderCoverage) {
      expect(requestedProviderCoverage).toContain(provider);
      expect(catalogByName.get(provider)?.status, provider).toBe("manual");
    }
    expect(catalogByName.get("Remote OK")?.connector).toBe("api");
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
    expect(merged.queries).toContain('"Senior Frontend Engineer" "Ventura, CA" jobs');
    expect(merged.queries).toContain('"Product Engineer" "Calabasas, CA" jobs');
    expect(merged.queries).toContain('site:ziprecruiter.com/jobs "Frontend Engineer" "React" "remote"');
    expect(merged.queries).toContain('site:remoterocketship.com/jobs "Senior Frontend Engineer" "React" "remote"');
    expect(merged.queries).toContain('site:jsremotely.com "React" "TypeScript" "remote"');
    expect(merged.maxResultsPerQuery).toBe(3);
    expect(merged.maxFetch).toBe(42);
  });
});
