# Full LangGraph Field-by-Field Application Assistant Control

## Summary
Implement the next assistant layer as true field-by-field LangGraph control. LangGraph becomes the decision-maker for every detected field, while the existing Python Playwright runner becomes a browser execution bridge that reports field inventory, waits for commands, executes fill/skip/upload actions, observes manual input, and reports results. Unknown required fields should get suggested answers first, then ask for approval or edit. Final submit remains manual-only.

## Key Changes
- Convert the assistant workflow from launch/status orchestration into a command loop:
  - Python emits structured field inventory and blocks for graph commands.
  - LangGraph evaluates each field and sends one command: `fill`, `upload`, `skip`, `ask_user`, `observe`, or `stop_for_submit`.
  - Each command/result is persisted to `workflowStateJson`, `actionsJson`, and `ApplicationEvent`.
- Add field decision state:
  - Track every field with stable `fieldId`, selector, label, input type, required status, category, current value, decision, confidence, memory match, and result.
  - Maintain `pendingCommand`, `pendingFieldId`, `pendingUserRequestId`, `filledFields`, `skippedFields`, `blockedFields`, and `observedManualFields`.
- Extend Python runner into a bridge:
  - Emit JSON events for `field_inventory`, `field_result`, `manual_input_observed`, `validation_error`, `submit_confirmation`, and `browser_closed`.
  - Poll a local command endpoint for the next command.
  - Execute commands without deciding policy itself.
  - Keep browser open while LangGraph or user input is pending.
- Extend LangGraph nodes:
  - `inspectPage`: ingest field inventory.
  - `decideNextField`: classify the next unhandled field.
  - `resolveKnownField`: use profile data, generated materials, uploads, and active low-risk memories.
  - `suggestUnknownAnswer`: generate a draft answer for unknown required/custom fields using existing question-helper/application-answer memory logic.
  - `pauseForUser`: create a Needs Me request with the suggested answer and field context.
  - `resumeWithUserAnswer`: apply approved/edited user answer and save memory.
  - `observeManualInput`: save manually typed values as field memories.
  - `validatePage`: detect required blanks or validation messages after filling.
  - `readyForSubmit`: stop before final submit and show exact fields filled, skipped, and needing review.
  - `detectSubmitOrClose`: mark applied on confirmation or reset to `NEEDS_USER` if closed before submit.
- Add APIs:
  - `POST /api/applications/[id]/assistant-workflow/events` for Python event ingestion.
  - `GET /api/applications/[id]/assistant-workflow/command` for Python command polling.
  - `POST /api/applications/[id]/assistant-workflow/command-result` for command execution results.
  - Extend `resume` so Needs Me answers can approve/edit suggested field answers and continue the graph.
- Update UI:
  - Apply Sprint shows live field-by-field progress: detected, filled, skipped, needs answer, and ready-to-submit.
  - Needs Me requests display the field label, suggested answer, why it was suggested, and approve/edit/skip choices.
  - The assistant page should not rely on raw logs for primary status, only as debugging detail.

## Public Interfaces / Data Model
- Add a durable assistant field state structure in `workflowStateJson`; add a separate table only if JSON state becomes too large or querying individual fields becomes necessary.
- Add command shape:
  - `id`, `type`, `fieldId`, `selector`, `value`, `reason`, `requiresUserApproval`, `createdAt`.
- Add event shape:
  - `type`, `fieldId`, `selector`, `label`, `inputType`, `required`, `valuePreview`, `result`, `message`, `at`.
- Field memory policy:
  - Low-risk contact/profile fields can become `AUTO_USE`.
  - Custom questions and sensitive fields become `ASK_FIRST`.
  - Blocked fields like CAPTCHA, password, SSN, payment, and file secrets are never saved.
- Keep final submission manual-only. The graph may detect a manual submit confirmation, but must not click submit in this phase.

## Test Plan
- Unit tests:
  - field decision routing for known safe fields, uploads, cover-letter textareas, unknown required fields, sensitive fields, and blocked fields.
  - command/event reducer updates workflow state idempotently.
  - suggested unknown answers create Needs Me requests and resume correctly.
  - safe memory policy stores low-risk fields as `AUTO_USE` and custom/sensitive fields as `ASK_FIRST`.
- API tests:
  - event ingestion updates workflow state.
  - command polling returns the next pending graph command.
  - command results advance the graph.
  - resume with approved/edited answer saves memory and returns a fill command.
- Runner tests:
  - Python bridge can parse command JSON, fill a target selector, report success/failure, and pause without exiting.
  - browser close before submit reports `browser_closed` and moves run to `NEEDS_USER`.
- Integration scenarios:
  - all-known application reaches `READY_TO_SUBMIT`.
  - unknown required question gets a suggested answer, waits for approval, fills after approval, and saves memory.
  - manually typed answer is observed, saved, and reused safely on a later similar field.
  - validation errors route back to the relevant field instead of leaving the run stuck.
  - submit confirmation marks the application `applied`.

## Assumptions
- Use graph-command-per-field control, not passive observation.
- Unknown required fields get a suggested answer before asking the user.
- Low-risk learned answers may auto-use; custom/sensitive learned answers stay ask-first.
- Python Playwright remains the browser execution layer.
- Final submit remains manual-only.
