import { describe, expect, it } from "vitest";
import {
  assistantLogActions,
  assistantLogFieldPatterns,
  assistantLogScreenshots,
  buildAssistantRunFeedback,
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

  it("builds diagnostics for browser close before submit", () => {
    const feedback = buildAssistantRunFeedback({
      log: `
ASSISTANT_EVENT {"type":"workflow_started","message":"Playwright assistant runner started.","at":"2026-06-11T10:00:00Z"}
ASSISTANT_EVENT {"type":"browser_closed_without_submit","message":"Assistant browser closed before submit confirmation.","payload":{"closeReason":"without_submit","safeRetry":"relaunch_or_mark_applied_if_submitted"},"at":"2026-06-11T10:01:00Z"}
Assistant browser/page closed before a submission confirmation was observed.
`,
      run: {
        status: "NEEDS_USER",
        blockerType: "assistant_closed",
        blockerMessage: "The assistant browser was closed or stopped before submission.",
        startedAt: new Date("2026-06-11T10:00:00Z"),
        finishedAt: new Date("2026-06-11T10:01:00Z"),
      },
    });

    expect(feedback.diagnostics).toMatchObject({
      phase: "closed",
      severity: "warning",
      statusLabel: "Closed before submit",
      nextAction: "Relaunch the assistant, or mark applied if you submitted before the browser closed.",
    });
    expect(feedback.timeline.at(-1)).toMatchObject({
      type: "browser_closed_without_submit",
      severity: "warning",
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

  it("builds diagnostics for setup and page blockers", () => {
    expect(buildAssistantRunFeedback({
      log: "Unable to load assistant package: Application must be ready_to_apply before assisted form filling.",
      run: { status: "FAILED" },
    }).diagnostics).toMatchObject({
      phase: "failed",
      reason: "The assistant could not load the prepared application package.",
      nextAction: "Inspect the raw log, fix the setup issue, then relaunch.",
    });

    expect(buildAssistantRunFeedback({
      log: "This application page appears to be closed, removed, or unavailable. No form can be filled.",
      run: { status: "BLOCKED", blockerType: "closed_job" },
    }).diagnostics).toMatchObject({
      phase: "blocked",
      blockerType: "closed_job",
      nextAction: "Reject this application as Job unavailable.",
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

  it("summarizes counts and timeline actions for fill runs", () => {
    const feedback = buildAssistantRunFeedback({
      log: `
ASSISTANT_EVENT {"type":"page_opened","message":"Application page opened.","payload":{"url":"https://jobs.example.com/apply"},"at":"2026-06-11T10:00:00Z"}
Detected 7 application field(s).
Filled 4 safe text fields.
Filled 1 learned recurring field(s).
Uploaded 2 material file(s).
Field learning updated: saved 3, ignored 2, active 1, review 2 observed manual field(s).
Review every field in the browser. Submit manually only if everything is correct.
`,
      run: { status: "READY_TO_SUBMIT" },
    });

    expect(feedback.diagnostics).toMatchObject({
      phase: "waiting_for_review",
      severity: "success",
      counts: {
        detected: 7,
        filled: 5,
        uploaded: 2,
        learned: 3,
        ignored: 2,
        activeForAutofill: 1,
        needsReview: 2,
      },
    });
    expect(feedback.timeline.some((item) => item.type === "uploaded_materials")).toBe(true);
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
