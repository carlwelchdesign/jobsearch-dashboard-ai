import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("email sync source contract", () => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/email/sync.ts"), "utf8");

  it("uses broad bounded Gmail queries and reports reauth as a provider blocker", () => {
    expect(source).toContain("broadJobResponseTerms");
    expect(source).toContain('\\"verification code\\"');
    expect(source).toContain('\\"thank you for applying\\"');
    expect(source).toContain("newer_than:${sinceDays}d");
    expect(source).toContain("Gmail connection is ${gmailConnection.status}. Reconnect Gmail in Settings.");
  });
});
