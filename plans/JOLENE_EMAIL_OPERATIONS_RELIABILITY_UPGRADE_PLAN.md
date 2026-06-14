# Jolene Email Operations Reliability Upgrade

## Summary
Fix Email Ops so it becomes useful against the real inbox and existing stored mail. Current inspection shows three concrete failures: Gmail is `NEEDS_REAUTH`, latest Email Ops runs scanned `0` messages, some generated Gmail watchlist queries can return `Bad Request`, and the new findings pipeline does not backfill already-ingested job-response emails from May. The upgrade will make Email Ops loud about broken provider state, repair query generation, backfill existing records, and update application statuses where applicable.

## Key Changes
- Add provider health gates:
  - If Gmail/Outlook/IMAP is disconnected, expired, `NEEDS_REAUTH`, or returning API errors, Email Ops must show a blocking Jolene priority instead of "no updates."
  - Settings and `/dashboard/email-ops` should show provider status, last successful sync, last error, and required fix.
- Repair Gmail search:
  - Replace fragile watchlist queries like `"Company" (interview OR recruiter...)` with valid, bounded Gmail queries.
  - Add broad recent search terms for job outcomes, interview invites, scheduling, assessments, offers, rejections, and confirmations.
  - Cap and batch queries so one bad company/watchlist query cannot fail the whole scan.
- Add Email Ops backfill:
  - Process existing `EmailMessageRecord` rows from a configurable lookback window, default 90 days.
  - Create missing `EmailOpsFinding` rows for already-ingested rejections, confirmations, interviews, scheduling requests, assessments, offers, and needs-review messages.
  - Generate calendar proposals for existing interview/scheduling/assessment records where none exist.
- Improve outcome automation:
  - Auto-apply high-confidence clear rejections and confirmations if not already recorded.
  - Keep interviews, scheduling, assessments, offers, recruiter replies, ambiguous matches, and calendar writes approval-gated.
  - Add idempotency checks so repeated scans do not duplicate outcomes, findings, requests, or calendar drafts.
- Improve matching and noise handling:
  - Ignore obvious newsletters/job-alert digests unless they reference an active application.
  - Treat security-code/application-verification emails as application-blocked next-step findings, not generic `NEEDS_REVIEW`.
  - Strengthen company/title matching when company fields contain noisy labels like `Role @ Company`.

## Public Interfaces
- Extend `POST /api/jolene/email-ops/run` with optional:
  - `lookbackDays`
  - `includeBackfill`
  - `providerMode`
- Extend `GET /api/jolene/email-ops` to return:
  - provider health
  - last successful scan
  - last provider error
  - backfill summary
- Keep existing approval/dismiss endpoints unchanged.

## Test Plan
- Unit tests:
  - Gmail query builder emits valid bounded queries and isolates failed queries.
  - Provider `NEEDS_REAUTH` creates a visible blocker and does not claim "no updates."
  - Backfill creates findings from existing email records.
  - Rejections and confirmations auto-apply idempotently.
  - Interview/scheduling/assessment/offer findings require approval and create calendar drafts only.
  - Security-code emails become application-blocked next-step findings.
- Route tests:
  - Run Email Ops with backfill.
  - Return provider-health errors.
  - Approve/dismiss backfilled findings.
- UI tests:
  - `/dashboard/email-ops` shows disconnected Gmail as a blocker.
  - Shows existing backfilled findings, calendar drafts, and status updates.
  - Jolene Chief of Staff surfaces Email Ops blockers before optional work.
- Verification:
  - Run Prisma migration/generate if schema changes are needed.
  - Run targeted email/Jolene/dashboard tests, `tsc`, React Doctor, build, and route smoke checks.

## Assumptions
- Gmail must be reconnected before live inbox scanning can work.
- Existing stored Gmail records should be treated as valid backfill input.
- External email sending and external calendar writes remain blocked unless explicitly approved in a future feature.
