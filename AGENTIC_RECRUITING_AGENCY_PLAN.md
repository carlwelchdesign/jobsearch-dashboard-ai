# Agentic Recruiting Agency Workflow

## Summary

Replace the manual "Add application" flow with an agency-managed pipeline. High-confidence jobs should be automatically promoted by agents: `needs_review` -> `approved application` -> `ready_to_apply` with generated resume, cover letter, and packet. The user should mainly review ready applications and confirm final external submission.

## Key Changes

- Remove the Applications page "Add application" dropdown entirely.
- Add an "Agency command center" section on `/applications` with one primary action: `Run recruiting agency`.
- Implement `POST /api/applications/agency/run`:
  - Select unique, untracked `needs_review` matches with `overallScore >= 90`.
  - Exclude archived/rejected/applied jobs and any existing application canonical duplicates.
  - Require an application URL.
  - Mark selected matches `approved`.
  - Create or update `Application` rows with status `approved`.
  - Call existing packet generation via `prepareApplicationPackage(jobPostingId)`.
  - Successful packages move to `ready_to_apply`.
  - Failures stay `approved` and return blocker details.
  - Default limit: `10`; max limit: `25`.
- Keep final submission assist-only:
  - Agents may prepare packets and launch/fill the assistant flow.
  - User still confirms final submit on employer forms.
- Update `/applications` board:
  - Approved jobs appear in the `approved` column because they are real `Application` rows.
  - `ready_to_apply` column becomes the main Apply Sprint queue.
  - Empty state copy should say the agency will create application trackers from strong matches.
  - Existing manual tracker language should be removed.
- Update Dashboard/Daily Plan:
  - Prefer "Run recruiting agency" when there are 90+ unprocessed matches.
  - "Prepare packets" should no longer imply the user must manually create trackers first.
- Cron compatibility:
  - Reuse the same agency runner from `/api/cron/recruiting-agency`.
  - Manual button and cron share identical selection rules.
  - Vercel runs the agency cron daily after the scheduled job search window.

## Public Interfaces

- New API response shape for `POST /api/applications/agency/run`:
  - `requested`: `{ minimumScore: 90, limit: number, triggeredBy: "manual" | "cron" }`
  - `approved`: count
  - `prepared`: count
  - `failed`: count
  - `skipped`: count
  - `results`: per-job `{ matchId, jobId, applicationId?, company, title, score, status, error? }`
- No new submission API. Existing assistant launch remains the submission boundary.

## Test Plan

- API tests:
  - Auto-approves a 90+ `needs_review` match and creates an `Application`.
  - Calls package preparation and moves successful applications to `ready_to_apply`.
  - Does not duplicate existing applications by canonical job match.
  - Skips jobs without application URLs.
  - Leaves failed package jobs in `approved` with error details.
  - Does not touch rejected, archived, applied, or below-threshold jobs.
- Page tests or component assertions:
  - Applications page no longer renders the add-application dropdown.
  - Approved applications render in the approved column.
  - Ready packages render in `ready_to_apply`.
- Regression:
  - Low-level/hardware/aerospace exclusions continue preventing false-positive agency approval.
- Run `npm test` and `npm run build`.

## Completion Notes

- `POST /api/applications/agency/run` is the manual entrypoint.
- `GET|POST /api/cron/recruiting-agency` is the scheduled entrypoint.
- `/applications` no longer imports or renders `ApplicationCreateForm`.
- The old manual dropdown remains as an unused component file only; it is no longer part of the Applications workflow.

## Assumptions

- Auto-approval threshold is fixed at `90+` for v1.
- The agency may approve and prepare materials automatically, but does not submit applications.
- Existing `prepareApplicationPackage` remains the source of truth for resume, cover letter, QA, and packet creation.
- Existing orphan approved matches can be picked up by the new agency run and converted into real `Application` rows.
