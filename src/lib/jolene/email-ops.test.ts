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

  it("suppresses no-action mail and cleans up stale noisy findings", () => {
    expect(source).toContain("cleanupNoisyRecentEmailOps");
    expect(source).toContain('email.classification === "UNRELATED" || email.classification === "NO_ACTION"');
    expect(source).toContain("input.sync.suppressed");
    expect(source).toContain("stale noisy finding or calendar draft");
  });

  it("creates calendar drafts only for matched high-confidence next steps", () => {
    expect(source).toContain("!finding.matchedApplicationId || finding.confidenceScore < 80");
    expect(source).toContain('const calendarEligibleClassifications = new Set<EmailMessageClassification>(["INTERVIEW_REQUEST", "SCHEDULING_REQUEST", "CODING_ASSESSMENT", "TAKE_HOME"])');
  });
});
