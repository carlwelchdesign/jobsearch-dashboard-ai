# Application Automation

## Apply Sprint

Apply Sprint is the controlled application automation surface. It helps the user do less physical work while preserving judgment and safety gates.

It can:

- select ready applications
- show packet readiness
- prepare assistant package data
- launch the local browser assistant
- surface blocker state
- show logs and automation status

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

The assistant can:

- open the employer application URL
- fill safe known fields
- upload generated resume and cover letter files when matching controls are visible
- write selected application answers to a local text file
- report workflow activity and field progress to Apply Sprint
- detect blockers
- update automation run records
- ask the user for help through Needs Me

The assistant must not:

- bypass CAPTCHA
- use stealth settings
- rotate proxies
- invent answers
- fill sensitive demographic answers automatically

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
