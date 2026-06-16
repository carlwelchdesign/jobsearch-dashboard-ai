import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("AppShell navigation", () => {
  it("keeps lifecycle workspaces in primary navigation", () => {
    const source = readFileSync(fileURLToPath(new URL("./app-shell.tsx", import.meta.url)), "utf8");

    expect(source).toContain('{ href: "/jobs", label: "Jobs"');
    expect(source).toContain('{ href: "/applications/assistant", label: "Apply Sprint"');
    expect(source).toContain('{ href: "/resumes/generated", label: "Materials"');
    expect(source).toContain('{ href: "/evidence", label: "Evidence"');
    expect(source).toContain('{ href: "/outcomes", label: "Outcomes"');
    expect(source).not.toContain('{ href: "/applications/field-learning", label: "Field Learning"');
  });
});
