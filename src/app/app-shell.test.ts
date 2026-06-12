import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("AppShell navigation", () => {
  it("keeps Apply Sprint in primary navigation and leaves Jobs out of the daily workflow", () => {
    const source = readFileSync(fileURLToPath(new URL("./app-shell.tsx", import.meta.url)), "utf8");

    expect(source).toContain('{ href: "/applications/assistant", label: "Apply Sprint"');
    expect(source).not.toContain('{ href: "/jobs", label: "Jobs"');
    expect(source).not.toContain('{ href: "/applications/field-learning", label: "Field Learning"');
    expect(source).not.toContain('eyebrow: "Review matches"');
  });
});
