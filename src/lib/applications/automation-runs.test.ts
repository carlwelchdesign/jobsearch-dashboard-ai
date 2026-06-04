import { describe, expect, it } from "vitest";
import {
  assistantLogActions,
  assistantLogFieldPatterns,
  assistantLogScreenshots,
  buildAutomationRunEventPayload,
  classifyAssistantLog,
  shouldRecoverRunningAutomationRun,
} from "@/lib/applications/automation-runs";

describe("application automation runs", () => {
  it("classifies a successful fill run as ready to submit", () => {
    expect(classifyAssistantLog(`
Filled 6 safe text fields.
Uploaded 2 material file(s).
Review every field in the browser. Submit manually only if everything is correct.
`)).toMatchObject({ status: "READY_TO_SUBMIT" });
  });

  it("classifies gated auto-submit completion", () => {
    expect(classifyAssistantLog("Auto-submit confirmed after safety checks passed.")).toMatchObject({ status: "SUBMITTED" });
  });

  it("classifies observed manual submit completion", () => {
    expect(classifyAssistantLog(`
Manual submit button click detected: Submit application
Tracker updated: Application marked applied.
`)).toMatchObject({ status: "SUBMITTED" });
    expect(classifyAssistantLog("Browser closed after manual submit click: Submit application")).toMatchObject({ status: "SUBMITTED" });
  });

  it("classifies browser close before submit as needing user review", () => {
    expect(classifyAssistantLog("Assistant browser/page closed before a submission confirmation was observed.")).toMatchObject({
      status: "NEEDS_USER",
      blockerType: "assistant_closed",
    });
  });

  it("does not classify detached-frame watcher failures after manual review as failed", () => {
    expect(classifyAssistantLog(`
Review every field in the browser. Submit manually only if everything is correct.
ASSISTANT_EVENT {"type":"ready_for_manual_submit","message":"Assistant is waiting for manual review and submit."}
Traceback (most recent call last):
playwright._impl._errors.Error: Locator.count: Frame was detached
`)).toMatchObject({
      status: "NEEDS_USER",
      blockerType: "assistant_closed",
    });
  });

  it("classifies skipped auto-submit as ready for manual review", () => {
    expect(classifyAssistantLog("Auto-submit skipped because a safety check did not pass.")).toMatchObject({
      status: "READY_TO_SUBMIT",
      blockerType: "auto_submit_skipped",
    });
  });

  it("classifies assistant blockers", () => {
    expect(classifyAssistantLog("Assistant paused.")).toMatchObject({
      status: "BLOCKED",
      blockerType: "manual_handoff",
    });
    expect(classifyAssistantLog("This application page appears to be closed, removed, or unavailable.")).toMatchObject({
      status: "BLOCKED",
      blockerType: "closed_job",
    });
    expect(classifyAssistantLog("We couldn't submit your application. Your application submission was flagged as possible spam.")).toMatchObject({
      status: "BLOCKED",
      blockerType: "ats_spam_block",
    });
  });

  it("extracts action summaries from logs", () => {
    expect(assistantLogActions(`
Filled 4 safe text fields.
Filled 1 configured demographic field(s).
Uploaded 2 material file(s).
Selected application answers: /tmp/answers.txt
`)).toEqual([
      { type: "filled_safe_fields", message: "4 safe text fields filled." },
      { type: "filled_demographic_fields", message: "1 configured demographic fields filled." },
      { type: "uploaded_materials", message: "2 material files uploaded." },
      { type: "prepared_selected_answers", message: "Selected custom-answer drafts were prepared." },
    ]);
  });

  it("extracts submit confirmation artifacts from logs", () => {
    expect(assistantLogScreenshots(`
Auto-submit confirmed after safety checks passed.
Submit confirmation screenshot: /tmp/submit-confirmation.png
Submit confirmation text: /tmp/submit-confirmation.txt
Submit confirmation summary: Thank you for applying. We received your application.
`)).toEqual([
      {
        type: "submit_confirmation",
        path: "/tmp/submit-confirmation.png",
        textPath: "/tmp/submit-confirmation.txt",
        summary: "Thank you for applying. We received your application.",
      },
    ]);
  });

  it("extracts safe reusable form patterns from assistant logs", () => {
    expect(assistantLogFieldPatterns(`
Detected fields after filling:
- first_name: filled | text | selector: input#firstName | first name
- email: filled | email | selector: input[name="email"] | email
- sensitive_unfilled: empty | select | selector: select#gender | gender
- unknown: empty | text | selector: textarea#custom | explain why you are interested
`)).toEqual([
      {
        category: "first_name",
        fieldKey: "input_firstname",
        inputType: "text",
        label: "first name",
        selector: "input#firstName",
      },
      {
        category: "email",
        fieldKey: "input_name_email",
        inputType: "email",
        label: "email",
        selector: 'input[name="email"]',
      },
    ]);
  });

  it("builds a compact application event for automation run state changes", () => {
    expect(buildAutomationRunEventPayload({
      automationRunId: "run_1",
      status: "READY_TO_SUBMIT",
      blockerType: "auto_submit_skipped",
      blockerMessage: "Auto-submit was skipped by a page-level safety check.",
      actionCount: 3,
      screenshotCount: 1,
      logPath: "/tmp/assistant.log",
    })).toEqual({
      source: "application_automation_run",
      automationRunId: "run_1",
      status: "READY_TO_SUBMIT",
      blockerType: "auto_submit_skipped",
      blockerMessage: "Auto-submit was skipped by a page-level safety check.",
      actionCount: 3,
      screenshotCount: 1,
      logPath: "/tmp/assistant.log",
    });
  });

  it("recovers running automation runs that are stale or have no live process", () => {
    const now = new Date("2026-05-16T12:00:00.000Z");
    expect(shouldRecoverRunningAutomationRun({
      status: "RUNNING",
      pid: 123,
      startedAt: new Date("2026-05-16T10:29:59.000Z"),
    }, {
      now,
      staleMinutes: 90,
      processAlive: () => true,
    })).toBe(true);

    expect(shouldRecoverRunningAutomationRun({
      status: "RUNNING",
      pid: 123,
      startedAt: new Date("2026-05-16T11:59:00.000Z"),
    }, {
      now,
      staleMinutes: 90,
      processAlive: () => false,
    })).toBe(true);

    expect(shouldRecoverRunningAutomationRun({
      status: "RUNNING",
      pid: 123,
      startedAt: new Date("2026-05-16T11:59:00.000Z"),
    }, {
      now,
      staleMinutes: 90,
      processAlive: () => true,
    })).toBe(false);
  });
});
