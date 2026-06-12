import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ApplicationFieldLearningPage", () => {
  it("supports filtered review links and bulk approval for safe memories", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/app/applications/field-learning/page.tsx"), "utf8");
    const bulkSource = readFileSync(resolve(process.cwd(), "src/app/applications/field-learning/field-memory-bulk-actions.tsx"), "utf8");

    expect(pageSource).toContain("searchParams");
    expect(pageSource).toContain("host");
    expect(pageSource).toContain("applicationId");
    expect(pageSource).toContain("FieldMemoryBulkActions");
    expect(pageSource).toContain("safeReviewMemoryIds");
    expect(pageSource).toContain("memory.status === \"NEEDS_REVIEW\"");
    expect(pageSource).toContain("memory.sensitivity !== \"HIGH\"");
    expect(bulkSource).toContain("/api/application-field-memory/bulk");
    expect(bulkSource).toContain("Approve");
  });
});
