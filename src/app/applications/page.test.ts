import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("/applications page agency workflow", () => {
  it("uses the recruiting agency flow instead of the manual add-application dropdown", () => {
    const pageSource = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8");

    expect(pageSource).toContain("Agency command center");
    expect(pageSource).toContain("/api/applications/agency/run");
    expect(pageSource).not.toContain("ApplicationCreateForm");
  });
});
