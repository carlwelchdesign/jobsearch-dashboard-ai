# LangGraph Application Assistant Workflow Plan

## Summary
Use the application assistant as the first real LangGraph use case. Keep the existing Python Playwright runner, but move orchestration into a durable LangGraph JS workflow that tracks each application through: open application, inspect page, classify fields, fill known fields, pause for unknowns, observe user input, save field memory, detect submit/close, and update application state. Final submission remains manual-only.

## Key Changes
- Add LangGraph JS orchestration for the assistant workflow:
  - Use a `StateGraph` with persisted state keyed by `applicationId` / `automationRunId`.
  - Use LangGraph checkpointing so interrupted runs can resume after browser closure, server restart, user input, or validation failure.
  - Use human-in-the-loop interrupts for unknown required fields, sensitive fields, CAPTCHA/login blockers, and manual submit checkpoints.
- Keep Python Playwright as the browser runner:
  - Do not rewrite browser automation in this phase.
  - Change the runner contract from log-only inference to structured JSON events: page opened, fields detected, field filled, blocker found, manual value observed, ready to submit, submitted detected, browser closed.
  - Preserve existing log files as debugging artifacts.
- Add durable workflow state:
  - Track current node, current URL, detected fields, filled fields, pending user prompts, blocker state, learned memories, submit/close detection, and final outcome.
  - Store graph run metadata alongside `ApplicationAutomationRun`; add a lightweight `workflowStateJson` / `graphThreadId` style field if needed.
  - Continue writing `ApplicationEvent`, `ApplicationAutomationRun`, `ApplicationFieldMemory`, and `AgentUserRequest` records so current UI surfaces remain useful.
- Define graph nodes:
  - `loadPackage`: validate application, resume, cover letter, URL, field memories, and safety policy.
  - `launchBrowser`: start Python Playwright runner and create automation run.
  - `inspectPage`: collect page/frame field inventory and ATS context.
  - `classifyFields`: map fields to known categories, sensitive categories, learned memories, or unknown required prompts.
  - `fillKnownFields`: fill safe profile fields, resume/cover-letter uploads, cover-letter text, and approved low-risk memories.
  - `pauseForUser`: interrupt when user action is needed; create/update `AgentUserRequest`.
  - `observeManualInput`: receive observed user-filled fields from Python/UI and save memories through existing field-learning logic.
  - `readyForSubmit`: stop before submit and show manual submit checkpoint.
  - `detectSubmitOrClose`: update application as applied if submission confirmation is detected; reset to actionable/needs-user if browser closes before submit.
  - `finalizeRun`: close run with `SUBMITTED`, `READY_TO_SUBMIT`, `NEEDS_USER`, `BLOCKED`, or `FAILED`.
- Update UI/API behavior:
  - Launch assistant starts or resumes the LangGraph workflow instead of only spawning the script.
  - Apply Sprint displays current graph node, last event, blocker, fields filled, fields needing user input, and submit checkpoint.
  - Existing assistant log endpoint can remain, but add a workflow status endpoint that reads graph state and automation events.
  - User answers/manual observations resume the graph rather than being saved as disconnected feedback.

## Public Interfaces / Data Model
- Add dependency on LangGraph JS and use its checkpoint/human-interrupt model.
- Add or extend persistence fields:
  - `ApplicationAutomationRun.graphThreadId`
  - `ApplicationAutomationRun.workflowStateJson`
  - `ApplicationAutomationRun.currentNode`
- Add endpoints:
  - `POST /api/applications/[id]/assistant-workflow/start`
  - `POST /api/applications/[id]/assistant-workflow/resume`
  - `GET /api/applications/[id]/assistant-workflow/status`
  - Keep existing `/assistant-log` and `/field-learning` during migration.
- Python runner event protocol:
  - Emit newline-delimited JSON events with `type`, `automationRunId`, `applicationId`, `url`, `fields`, `selector`, `label`, `category`, `valueSource`, `message`, and timestamps.
  - Non-JSON logs stay allowed but are secondary.

## Test Plan
- Unit tests:
  - graph transition logic for success, blocker, manual input, browser close, and submit confirmation.
  - field classification routes unknown/sensitive fields to `pauseForUser`.
  - observed manual input stores `ApplicationFieldMemory` and resumes workflow.
- API tests:
  - start creates automation run and graph thread.
  - status returns current node/events.
  - resume accepts user answers and continues from checkpoint.
  - browser-close before submit moves run to `NEEDS_USER`, not stuck `RUNNING`.
- Integration scenarios:
  - known fields only: launches, fills, pauses at manual submit.
  - unknown required field: pauses, user fills/answers, memory saved, resumes.
  - cover-letter textarea: filled from generated cover letter.
  - user manually submits: confirmation detected, application marked `applied`.
  - user closes browser before submit: run resets to needs-user/actionable state.
- Regression checks:
  - existing Apply Sprint queue still filters submitted/rejected duplicates.
  - no automatic final submit in this phase.

## Assumptions
- Use real LangGraph JS for this first use case.
- Keep the existing Python Playwright runner for browser automation.
- Final application submission remains manual-only.
- LangGraph adoption is limited to the application assistant first; recruiting agency/search workflows are not migrated in this phase.
- Existing Prisma records remain the source of truth for UI compatibility; LangGraph adds durable orchestration, not a parallel product database.

Sources: LangGraph JS persistence and durable execution docs: https://docs.langchain.com/oss/javascript/langgraph/persistence and https://docs.langchain.com/oss/javascript/langgraph/durable-execution
