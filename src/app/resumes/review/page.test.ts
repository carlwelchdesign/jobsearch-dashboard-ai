import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Resume review page upload selection", () => {
  it("ignores stale pending uploads once a newer upload is approved", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/resumes/review/page.tsx"), "utf8");

    expect(source).toContain('parsingStatus: "approved"');
    expect(source).toContain('parsingStatus: "needs_review"');
    expect(source).toContain("createdAt: { gt: latestApprovedUpload.createdAt }");
  });
});
