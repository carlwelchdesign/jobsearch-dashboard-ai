import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("AppShell navigation", () => {
  it("uses daily job-search language in primary navigation", () => {
    const source = readFileSync(fileURLToPath(new URL("./app-shell-nav.tsx", import.meta.url)), "utf8");

    expect(source).toContain('{ href: "/dashboard", label: "Today"');
    expect(source).toContain('{ href: "/dashboard/search", label: "Find Jobs"');
    expect(source).toContain('{ href: "/applications/assistant", label: "Apply"');
    expect(source).toContain('{ href: "/resumes/generated", label: "Materials"');
    expect(source).toContain('{ href: "/needs-me", label: "Follow Up"');
    expect(source).toContain('{ href: "/architecture", label: "System"');
    expect(source).toContain("systemSubItems");
    expect(source).toContain('{ href: "/evidence", label: "Evidence"');
    expect(source).toContain('{ href: "/outcomes", label: "Outcomes"');
    expect(source).not.toContain('{ href: "/applications/field-learning", label: "Field Learning"');
  });
});
