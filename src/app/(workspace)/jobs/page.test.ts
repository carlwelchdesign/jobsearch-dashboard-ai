import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("/jobs page search", () => {
  it("uses one search field across job identity and table signals while preserving status view", () => {
    const source = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8");
    const tableSource = readFileSync(fileURLToPath(new URL("./jobs-table.tsx", import.meta.url)), "utf8");

    expect(source).toContain("q?: string");
    expect(source).toContain("normalizeSearchQuery");
    expect(source).toContain("company: { contains: searchQuery, mode: \"insensitive\" }");
    expect(source).toContain("title: { contains: searchQuery, mode: \"insensitive\" }");
    expect(source).toContain('name="q"');
    expect(source).toContain('type="hidden" name="statusView"');
    expect(tableSource).toContain("function filterByQuery");
    expect(tableSource).toContain("match.company");
    expect(tableSource).toContain("...match.strongestMatches");
    expect(tableSource).not.toContain("Search signals");
  });
});
