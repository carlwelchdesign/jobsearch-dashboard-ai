import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("email sync source contract", () => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/email/sync.ts"), "utf8");

  it("uses strict Gmail Primary and Updates job-response queries instead of broad recent mailbox scans", () => {
    expect(source).toContain("gmailCategoryJobResponseQueries");
    expect(source).toContain("category:primary");
    expect(source).toContain("category:updates");
    expect(source).toContain('"thank you for applying"');
    expect(source).not.toContain("broadRecentQuery");
  });

  it("tracks suppressed mail separately from scanned and ingested messages", () => {
    expect(source).toContain("suppressed: number");
    expect(source).toContain("provider.suppressed");
  });
});
