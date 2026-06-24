import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ApplicationFieldLearningPage", () => {
  it("redirects filtered review links to Learning settings", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/app/applications/field-learning/page.tsx"), "utf8");

    expect(pageSource).toContain("searchParams");
    expect(pageSource).toContain("host");
    expect(pageSource).toContain("applicationId");
    expect(pageSource).toContain("redirect");
    expect(pageSource).toContain("/settings/learning");
    expect(pageSource).toContain("#settings-field-learning");
  });

  it("moves the full review and bulk approval UI into Learning settings", () => {
    const settingsSource = readFileSync(resolve(process.cwd(), "src/app/settings/settings-content.tsx"), "utf8");
    const bulkSource = readFileSync(resolve(process.cwd(), "src/app/applications/field-learning/field-memory-bulk-actions.tsx"), "utf8");

    expect(settingsSource).toContain("settings-field-learning");
    expect(settingsSource).toContain("FieldMemoryBulkActions");
    expect(settingsSource).toContain("FieldMemoryActions");
    expect(settingsSource).toContain("safeReviewMemoryIds");
    expect(settingsSource).toContain("memory.status === \"NEEDS_REVIEW\"");
    expect(settingsSource).toContain("memory.sensitivity !== \"HIGH\"");
    expect(bulkSource).toContain("/api/application-field-memory/bulk");
    expect(bulkSource).toContain("Approve");
  });
});
