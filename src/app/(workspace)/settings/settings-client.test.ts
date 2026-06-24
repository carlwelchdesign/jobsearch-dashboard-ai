import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Settings client source contract", () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/settings/settings-client.tsx"), "utf8");
  const contentSource = readFileSync(resolve(process.cwd(), "src/app/settings/settings-content.tsx"), "utf8");

  it("shows and saves a dedicated LinkedIn content model setting", () => {
    expect(contentSource).toContain("DEFAULT_LINKEDIN_CONTENT_MODEL");
    expect(contentSource).toContain("DEFAULT_LINKEDIN_DIAGRAM_IMAGE_MODEL");
    expect(contentSource).toContain("aiSettings: true");
    expect(source).toContain("LinkedIn content model");
    expect(source).toContain("LinkedIn diagram image model");
    expect(source).toContain("/api/settings/ai");
    expect(source).toContain("linkedinContentModel");
    expect(source).toContain("linkedinDiagramImageModel");
    expect(source).toContain("Used only for public LinkedIn draft generation");
    expect(source).toContain("exact technical diagram text is rendered deterministically");
  });

  it("keeps the app-wide model read-only", () => {
    expect(source).toContain("App-wide model");
    expect(source).toContain("value={aiSettings.model} disabled");
  });

  it("has an explicit save action for application profile links before LinkedIn reconnect", () => {
    expect(source).toContain("saveProfileLinks");
    expect(source).toContain("Save profile links and format");
    expect(source).toContain("Application profile links saved.");
    expect(source).toContain("Save this URL before reconnecting LinkedIn.");
    expect(source).toContain("/api/settings/profile");
  });

  it("exposes the generated resume format selector in application settings", () => {
    expect(source).toContain("Resume format");
    expect(source).toContain("RESUME_FORMATS.map");
    expect(source).toContain("Used for generated resume previews and PDF exports. Resume text remains ATS-readable.");
    expect(contentSource).toContain("resumeFormat: normalizeResumeFormat");
  });
});
