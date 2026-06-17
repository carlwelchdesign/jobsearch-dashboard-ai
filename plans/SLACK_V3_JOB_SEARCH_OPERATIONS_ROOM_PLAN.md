# Slack V3: Job Search Operations Room

## Summary
Slack v3 should become the job-search operations room: agents post short operational updates, humans approve or challenge decisions, high-value opportunities get threaded rooms, and daily briefings keep the search moving. The app remains the durable system for records, approvals, rollback, evidence, and audit history.

Use Slack surfaces already compatible with the current Socket Mode worker: App Home, channel messages, threads, buttons, and modals. Default to threads inside the existing ops channel rather than auto-creating many Slack channels.

## Key Changes
- **Agent Ops Room**
  - Reuse `SLACK_OPS_CHANNEL_ID` as the main operations room.
  - Post short updates for search runs, promising jobs, rejected weak matches, profile-change suggestions, resume/cover-letter drafts, follow-ups due, interview prep, and search-quality alerts.
  - Every post links back to the app record and writes a durable app-side audit event.

- **Approval Queue V3**
  - Expand approval cards to support `Approve`, `Reject`, `Needs evidence`, `Open in app`, and `Discuss`.
  - Cover search profile edits, Jolene/Operating Loop proposals, Email Ops findings, LinkedIn drafts, outreach drafts, and search-strategy changes.
  - `Needs evidence` creates an app-owned clarification request or agent event; Slack only captures the user intent.

- **Opportunity Rooms**
  - For high-value jobs, create one Slack thread in the ops channel, not a new channel by default.
  - Thread contains the job post summary, company research, match rationale, resume/cover-letter status, contacts, interview prep, and decision history.
  - Store a durable app-side thread mapping so future agent updates append to the same Slack thread.

- **Agent Debate / Decision Log**
  - Agents may post concise tradeoff summaries in threads: why apply, why skip, what evidence is missing, what profile assumption changed.
  - No hidden chain-of-thought. Slack gets evidence summaries, recommendations, and final decision rationale.
  - Final decisions are written back into app records and `AgentRunEvent` history.

- **Daily Job Search Briefing**
  - Add `/jso morning`, `/jso evening`, and `/jso focus`.
  - Morning digest: top opportunities, stale applications, follow-ups due, search-quality issues, and one recommended action.
  - Evening digest: actions completed, unresolved blockers, decisions made, and tomorrow's first move.

- **Human Coach Mode**
  - Allow trusted reviewers to comment in selected opportunity or draft-review threads without app access.
  - Capture their Slack replies as app-side feedback records or agent events.
  - Coach comments never directly mutate applications, drafts, search profiles, or publishing state.

- **Interview Command Center**
  - Before an interview, post a prep thread with role summary, interviewer notes, likely questions, STAR stories, compensation notes, and gaps to review.
  - Include buttons for `Open prep`, `Needs stronger story`, `Mark reviewed`, and `Add coach note`.

- **Recruiter / Networking Follow-Up Assistant**
  - Post reminders for reply due, thank-you due, and follow-up after configured business-day windows.
  - Include generated draft options as review-only summaries with app links.
  - Slack never sends messages.

- **Build-in-Public / LinkedIn Draft Review**
  - Post LinkedIn draft summaries and review warnings into Slack.
  - Buttons: `Open draft`, `Needs edit`, `Approve in app`.
  - Final publishing stays in the app's existing LinkedIn approval/publish flow.

## Interfaces
- Add app-owned Slack thread mapping:
  - Entity type: job, application, LinkedIn draft, interview prep, follow-up, search optimization run.
  - Entity id, channel id, root message timestamp, thread timestamp, source agent run id, status, last synced timestamp.
- Extend Slack config:
  - Keep `SLACK_OPS_CHANNEL_ID`, `SLACK_APPROVALS_CHANNEL_ID`, and `SLACK_DECISION_LOG_CHANNEL_ID`.
  - Add optional `SLACK_COACH_USER_IDS` for trusted reviewers who can comment but not approve.
- Extend Slack actions:
  - `needs_evidence`, `reject_recommendation`, `discuss_in_thread`, `mark_reviewed`, `capture_coach_note`.
- Extend `/jso`:
  - `/jso morning`
  - `/jso evening`
  - `/jso focus`
  - `/jso opportunity <job id or application id>`
  - `/jso coach summary`

## Safety Rules
- Slack can summarize, discuss, request evidence, create review threads, and start confirmed internal work.
- Slack cannot submit applications, send email, publish LinkedIn posts, contact employers, mutate external calendars, or bypass app approval gates.
- Human coach input is advisory unless the app user explicitly approves a resulting app-side action.
- All decisions, rollback paths, and audit records live in the app.

## Test Plan
- Unit-test Slack thread mapping, block builders, and action payload parsing.
- Test approval actions for approve, reject, needs evidence, discuss, and coach note capture.
- Test daily briefing builders for empty, normal, blocker-heavy, and high-opportunity states.
- Mock Slack client tests for posting root opportunity threads and appending follow-up replies.
- Verify app-owned audit records are written for every Slack-originated decision.
- Full verification: focused Slack tests, full test suite, TypeScript, build, `git diff --check`, and manual Slack smoke.

## Assumptions
- V3 defaults to threads inside the ops channel, not auto-created per-job channels.
- Coach mode is advisory and Slack-only for reviewers; app access is not required.
- Durable Slack thread mapping should live in the app database because opportunity rooms are a core v3 behavior.
- Slack remains the operations room; the app remains the system of record.
