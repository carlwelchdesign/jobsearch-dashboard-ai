# Live Recruiting Agency Activity Plan

## Summary
Add an inline live activity panel for recruiting agency runs on Dashboard and Applications. When the agency approves matches and prepares packets, the UI will show meaningful progress: candidates found, approval decisions, packet generation, skips, failures, and final totals. Activity will also be saved at summary level for later review.

## Key Changes
- Add persisted run activity:
  - Add `RECRUITING_AGENCY` to `AgentType`.
  - Add a general `AgentRunEvent` model linked to `AgentRun`, with `type`, `message`, `payloadJson`, and timestamps.
  - Keep event payloads summary-level, not full raw logs.
- Instrument `runRecruitingAgency`:
  - Create a parent `AgentRun` at start.
  - Emit events for `run_started`, `candidates_found`, `candidate_evaluating`, `match_approved`, `packet_started`, `packet_ready`, `candidate_failed`, `candidate_skipped`, and `run_completed`.
  - Preserve the existing final result shape and existing approval/package behavior.
- Add agency status API:
  - `GET /api/applications/agency/run/status?runId=...` returns run status, totals, recent events, started/updated timestamps.
  - If no `runId` is provided, return the latest running or most recent recruiting agency run for the current user.
  - Update `POST /api/applications/agency/run` to include `agentRunId` in the final response.
- Replace generic agency buttons with an `AgencyRunControl` client component:
  - Starts the existing POST request.
  - Polls the status endpoint every 1-2 seconds while running.
  - Renders an inline activity panel on Dashboard and Applications.
  - Shows recent decisions, current candidate, progress counts, failures, and completion summary.
  - Keeps existing "Agency running..." behavior and refreshes the page when complete.

## UI Behavior
- Inline panel appears near the existing agency command/next-action area.
- While running, show:
  - Current phase: finding candidates, approving match, preparing packet, finished.
  - Candidate being processed: company, title, score.
  - Decision trail: approved, skipped duplicate, failed with reason, packet ready.
  - Totals: found, processed, approved, prepared, skipped, failed.
- After completion, keep the latest summary visible until page refresh or next run.
- If polling fails, show a non-blocking warning and keep the agency request running.

## Test Plan
- Unit tests for `runRecruitingAgency` event emission:
  - Successful approval and packet preparation emits ordered events.
  - Duplicate/skipped candidates emit skip events without approval.
  - Packet preparation failure emits failure event and final failed count.
- Route tests:
  - `POST /api/applications/agency/run` returns existing result plus `agentRunId`.
  - `GET /api/applications/agency/run/status` returns latest run, events, and totals.
- UI/component tests where practical:
  - Agency run control shows running state, event list, completion state, and error state.
- Run existing relevant tests and `npm run build`.

## Assumptions
- Visibility target is inline on Dashboard and Applications.
- Persisted history should be summary-level, not a full low-level audit trail.
- The agency remains a local long-running POST workflow; live visibility is powered by persisted events plus polling, avoiding fragile detached background execution.
