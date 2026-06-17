# Slack Agent Ops Integration Plan

## Summary

Build Slack v1 as a Socket Mode ops and approval layer for Job Search OS. Slack posts redacted agent updates, approval cards, and read-only status responses while Prisma, `AgentRun`, `AgentRunEvent`, Jolene, and search-profile services remain the source of truth.

## Key Changes

- Add Slack runtime support with `@slack/bolt`, a `slack:dev` script, and a Socket Mode worker that runs alongside `npm run dev`.
- Required env: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_OPS_CHANNEL_ID`, `SLACK_APPROVALS_CHANNEL_ID`, and `NEXT_PUBLIC_APP_URL`; optional env: `SLACK_DECISION_LOG_CHANNEL_ID`, `SLACK_SIGNING_SECRET`.
- Add `NotificationType.slack` through Prisma migration so Slack delivery and failure logs are not mislabeled as push/email.
- Add server-side Slack modules for config validation, redacted Block Kit formatting, message posting, action routing, and approval handling.
- Update `.env.example`, README/wiki setup docs, and include a Slack app manifest example for Socket Mode, interactivity, slash commands, and minimal scopes.

## Behavior

- Post redacted Slack summaries when these complete:
  - Jolene Chief of Staff brief.
  - Jolene Operating Loop plan.
  - Recruiting Search Team optimization run.
- Approval cards support only existing internal actions:
  - Approve Jolene delegated proposal.
  - Approve Jolene operating-loop proposal.
  - Apply low-risk `SearchProfileChange`.
  - Roll back already-applied `SearchProfileChange`.
- Slack buttons validate the current database state before executing, update the Slack message with success/failure, and write durable `AgentRunEvent` or `NotificationLog` records.
- Add `/jso status` as a read-only Slack command that returns latest app status and links back to the app. Do not add full conversational control in v1.
- Keep Slack messages redacted by default: titles, ids, status, rationale summaries, and app links only. Do not include resume text, cover-letter bodies, email excerpts, compensation notes, or raw prompts.

## Test Plan

- Unit-test Slack config parsing for missing and present env vars.
- Unit-test Block Kit builders to confirm redacted output and expected action payloads.
- Unit-test action handlers with mocked Prisma/services:
  - Jolene approval succeeds.
  - Operating-loop approval succeeds.
  - Search change apply rejects high-risk or missing records.
  - Rollback rejects non-applied changes.
  - Slack API failure logs `NotificationType.slack` with failed status.
- Run Prisma migration/codegen, focused Vitest suites, TypeScript check, `npm run build`, and `git diff --check`.
- Manual smoke: start `npm run dev`, start `npm run slack:dev`, run `/jso status`, trigger a Jolene/search optimization run, approve one safe Slack card, and verify app state plus Slack message update.

## Assumptions

- V1 uses Socket Mode only. HTTP callbacks can be added later for production.
- Slack is not the source of truth and does not store durable approval state.
- Channel routing is env-based in v1, not a settings UI.
- No edits are needed in `src/lib/agents/candidate-intelligence.ts` for this first Slack release unless a later iteration wants candidate-intelligence-specific updates.
