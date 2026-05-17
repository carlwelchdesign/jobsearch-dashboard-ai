# Outcome Calibration and Agent Quality Plan

## Summary

Add a closed-loop outcome calibration layer so the app can measure whether agent behavior is producing better job-search results, not just whether individual runs completed. The system should connect job search, matching, agency approval, application assistant runs, rejections, applied outcomes, duplicate resurfacing, and user feedback into a shared quality scorecard.

## Key Changes

- Track outcome signals across `JOB_SEARCH`, `JOB_MATCHING`, `RECRUITING_AGENCY`, and `APPLICATION_ASSISTANT` using existing jobs, matches, applications, outcomes, suppressions, automation runs, evaluations, and proposals.
- Add an outcome calibration scorecard showing applied-to-callback rate, rejected high-score matches, duplicate/resurfacing noise, assistant failures, active proposals, and recent redacted quality examples.
- Add a recompute endpoint that captures high-signal bad outcomes as redacted `AgentQualityExample` rows for later evaluation and proposal generation.
- Keep LangSmith optional and fail-open; no raw resumes, cover letters, prompts, full form answers, screenshots, secrets, emails, or phone numbers should be stored in outcome quality payloads.
- Keep improvement behavior controlled: outcome metrics inform examples, proposals, and rollback decisions, but do not directly rewrite prompts, workflow policy, scoring policy, or search-source settings.

## Interfaces

- `GET /api/observability/outcomes`
  - Returns the current outcome calibration summary, workflow scorecards, and recent outcome quality signals for the default user.
- `POST /api/observability/outcomes/recompute`
  - Rebuilds outcome signals from existing data and creates missing redacted quality examples for repeated bad patterns.
- Settings adds an Outcome Calibration section near the existing Agent Quality and Learning Impact controls.

## Test Plan

- Unit tests for outcome calibration metrics and signal capture.
- API tests for read and recompute routes.
- Regression checks: `npx prisma validate`, `npx tsc --noEmit --pretty false`, focused observability tests, full `npm test`, `npm run build`, and `npm run smoke:pages`.

## Assumptions

- Reuse existing observability schema for v1; do not add a migration.
- Outcome examples are redacted metadata by default.
- Recompute is idempotent and should not duplicate quality examples.
- The first UI surface is Settings because it already contains agent quality, learning impact, rollback, and learning audit controls.
