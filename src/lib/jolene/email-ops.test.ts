import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Jolene Email Operations source contract", () => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/jolene/email-ops.ts"), "utf8");

  it("creates a parent Email Ops run with specialist child agents", () => {
    expect(source).toContain('agentType: "JOLENE_EMAIL_OPERATIONS"');
    expect(source).toContain('"EMAIL_INBOX_SCOUT"');
    expect(source).toContain('"EMAIL_APPLICATION_MATCHER"');
    expect(source).toContain('"EMAIL_OUTCOME_CLASSIFIER"');
    expect(source).toContain('"EMAIL_SCHEDULING_COORDINATOR"');
    expect(source).toContain('"EMAIL_ACTION_DRAFTER"');
    expect(source).toContain('"EMAIL_PRIVACY_REVIEWER"');
    expect(source).toContain('"EMAIL_OPS_REPORTER"');
    expect(source).toContain("parentRunId");
  });

  it("keeps high-risk inbox actions approval-gated and calendar-only as drafts", () => {
    expect(source).toContain('status: "NEEDS_APPROVAL"');
    expect(source).toContain('status: "DRAFT"');
    expect(source).toContain("Offers always require explicit human review.");
    expect(source).toContain("no external calendar writes were made");
    expect(source).toContain("externalSendBlocked: true");
  });

  it("auto-applies only low-risk high-confidence internal classifications", () => {
    expect(source).toContain('const lowRiskAutoClassifications = new Set<EmailMessageClassification>(["REJECTION", "AUTOMATED_CONFIRMATION"])');
    expect(source).toContain('status: "AUTO_APPLIED"');
    expect(source).toContain("email.confidenceScore >= 85");
  });
});
