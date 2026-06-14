import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Settings client source contract", () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/settings/settings-client.tsx"), "utf8");
  const contentSource = readFileSync(resolve(process.cwd(), "src/app/settings/settings-content.tsx"), "utf8");

  it("shows and saves a dedicated LinkedIn content model setting", () => {
    expect(contentSource).toContain("DEFAULT_LINKEDIN_CONTENT_MODEL");
    expect(contentSource).toContain("aiSettings: true");
    expect(source).toContain("LinkedIn content model");
    expect(source).toContain("/api/settings/ai");
    expect(source).toContain("linkedinContentModel");
    expect(source).toContain("Used only for public LinkedIn draft generation");
  });

  it("keeps the app-wide model read-only", () => {
    expect(source).toContain("App-wide model");
    expect(source).toContain("value={aiSettings.model} disabled");
  });
});
