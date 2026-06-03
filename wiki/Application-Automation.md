# Application Automation

## Apply Sprint

Apply Sprint is the controlled application automation surface. It helps the user do less physical work while preserving judgment and safety gates.

It can:

- select ready applications
- show packet readiness
- run the recruiting agency from a primary command panel
- prepare approved packets, sync packet records, open the sprint console, and launch the next ready application from a consistent operations grid
- prepare assistant package data
- launch the local browser assistant
- surface blocker state
- show logs and automation status

The Chrome extension can start the same flow with **Apply Now** after saving a job. It remembers the last saved job, uses the active tab URL as the final application URL, prepares or reuses the custom resume and cover letter, creates the `ready_to_apply` application, and launches the local assistant.

## Application Packets

An application packet is generated per approved job and may include:

- tailored resume
- cover letter
- application answers
- recruiter message
- hiring manager message
- company brief
- project links
- evidence references
- QA warnings

Packets can be:

- draft
- needs review
- approved
- submitted
- archived

## Thank-You Drafts

Application detail pages can create draft-only thank-you messages after recruiter screens, hiring-manager conversations, technical interviews, panel/onsite rounds, final interviews, informational conversations, or custom stages.

The form captures stage, interviewer name/title, LinkedIn URL, interview date, tone, and conversation notes. The app saves a `ThankYouDraft` with:

- email subject and body
- short LinkedIn message
- interviewer snapshot
- evidence references
- quality review warnings

These drafts are manual-send artifacts. Creating one does not send email or LinkedIn messages, create contacts, record outcomes, update application status, or schedule follow-ups automatically.

## Application Answer Memory

The system stores reusable answers to application questions with reuse policy and sensitivity level.

Answer memory supports:

- finding likely reusable answers
- selecting an answer for a packet
- tracking usage
- avoiding automatic use of sensitive answers unless policy allows it

Sensitive answer-memory encryption was deferred unless sensitive reuse is expanded later.

## Local Browser Assistant

The assistant is a local Playwright workflow orchestrated by a LangGraph-backed application workflow.

Install:

```bash
npm run assistant:install
```

Run manually:

```bash
npm run assistant:apply -- <application-id>
```

The app can also launch it from the UI.

### LangGraph Workflow

LangGraph is used for durable assistant orchestration, not direct browser control.

Current graph responsibilities:

- validate that an application package is ready
- launch the local Playwright runner
- checkpoint workflow state in Postgres
- persist current node, events, field inventory, pending command, and counts on `ApplicationAutomationRun.workflowStateJson`
- create or resume field-level commands when the assistant needs a known value, upload, skip, or user answer
- stop at `READY_TO_SUBMIT` for manual review
- emit optional redacted LangSmith traces for launch, field inventory, command decisions, command results, Needs Me resume, browser close, submit detection, and reset
- capture failures, repairs, manual corrections, and user mistake reports as redacted quality examples for local evaluation

The Playwright runner remains the browser execution bridge. It opens the employer application URL, fills safe known fields, uploads files, reports field inventory to the workflow, polls for commands, executes fill/upload/skip commands, observes manual input, and watches for submit confirmation.

The current implementation intentionally keeps the older broad fill pass before the field-command loop. This preserves coverage for known fields, learned form rules, saved field memories, demographic settings, and uploads. LangGraph then handles remaining unresolved fields and user pauses.

### Field Learning

When the user manually fills a field or answers a Needs Me field prompt, the assistant can store that answer as application field memory.

Memory policy:

- low-risk profile/contact fields may become `AUTO_USE`
- custom questions and sensitive answers stay `ASK_FIRST`
- blocked fields such as passwords, CAPTCHA, SSN, payment, secrets, resumes, and cover letters are not saved as reusable field memories

### Test Reset

Apply Sprint has a selected-application reset button for autofill testing. It clears assistant automation runs and open assistant blockers for that application and stops any tracked runner process. It does not reject the job, delete the application, or remove learned memories.

### LangSmith Observability

LangSmith tracing is optional and redacted by default. It is used to debug assistant failures such as missed cover letter fields, stale running states, unknown-field pauses, command failures, and user corrections. Trace metadata is also stored on `ApplicationAutomationRun.observabilityJson` so user-reported feedback can be connected back to the relevant assistant run.

### Evaluation Loop

The assistant quality loop works without LangSmith configuration. Backfill creates redacted examples from recent assistant runs, evaluation scores classify pass/fail/needs-review behavior, and repeated failures create propose-only improvement proposals. The current categories include manual submit detection, browser lifecycle issues, field classification, cover letter fields, and runtime errors.

The assistant can:

- open the employer application URL
- fill safe known fields
- upload generated resume and cover letter files when matching controls are visible
- write selected application answers to a local text file
- report workflow activity and field progress to Apply Sprint
- observe safe manual field edits for future field memory
- detect submit intent, submit confirmation, and browser close lifecycle events
- detect blockers
- update automation run records
- ask the user for help through Needs Me
- detect Ashby possible-spam/reCAPTCHA blocks as `ats_spam_block` and recommend normal Chrome assisted fill

The assistant must not:

- bypass CAPTCHA
- use stealth settings
- rotate proxies
- mask browser automation signals
- invent answers
- fill sensitive demographic answers automatically

## Ashby Safe Apply Path

Ashby may flag Playwright-controlled submissions as possible spam. Job Search OS treats that as a blocker, not something to bypass.

When the assistant sees Ashby copy such as `We couldn't submit your application`, `possible spam`, or reCAPTCHA anti-spam guidance, it records `ats_spam_block`, keeps the application out of applied state, creates a Needs Me item, and recommends retrying in the user's normal Chrome profile.

The Chrome extension supports `Apply Now` after saving a job and `Fill from Job Search OS` on a ready application URL. Apply Now prepares materials and launches the local assistant from the user's current tab URL; Fill from Job Search OS loads the local assistant package, fills safe known fields and obvious cover-letter/application-answer fields, highlights upload fields that require manual file selection, and never clicks submit. If Ashby still blocks normal Chrome submission, the recommended fallback is company direct or recruiter outreach, not stealth automation.

## Auto-Submit Policy

The system supports global and company-level auto-submit configuration.

Company policy modes:

- inherit
- allow
- block

Safety gates still apply. Company-level overrides exist because some companies or ATS flows may be trusted, while others should always stop for manual review.

## Blockers

When automation cannot safely continue, it creates an agent user request.

Examples:

- unknown application question
- login or OAuth wall
- CAPTCHA
- unclear field
- missing approved packet
- unapproved sensitive answer
- policy forbids submit

The user resolves blockers in Needs Me. If the answer can be reused later, it can be saved to answer memory.
