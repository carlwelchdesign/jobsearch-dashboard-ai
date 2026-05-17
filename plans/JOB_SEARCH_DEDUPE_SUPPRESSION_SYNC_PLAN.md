# Tighten Job Search Dedupe, Rejection Memory, and Cross-Page Sync

## Summary
Fix the app so a rejected or already-applied job cannot keep resurfacing through another profile, source, duplicate posting, dashboard card, agency queue, or Apply Sprint list. The current problem is that rejection/application state is stored mostly on individual matches, while discovery creates many matches for the same job across profiles. The implementation will introduce one user-level suppression source of truth and make every page and agent use it.

## Key Changes
- Add a user-level job suppression layer:
  - Store canonical job keys for rejected, archived, deleted-from-sprint, and submitted/applied jobs.
  - Treat rejection as job-wide by default across all profiles, sources, duplicate groups, and future searches.
  - Record the reason/source so agents can learn from the decision instead of only hiding the row.
- Strengthen dedupe and canonical matching:
  - Normalize company casing, punctuation, locations, title variants, and URLs more consistently.
  - Match duplicate postings by application URL, source job id, canonical company/title/location, and duplicate group siblings.
  - Propagate a rejected/applied status to active duplicate matches instead of leaving mixed states like `rejected + needs_review + approved`.
- Add auto cooldown for noisy companies:
  - If repeated rejects happen for similar roles at the same company, create a temporary company/title-family cooldown.
  - Default cooldown behavior: hide similar roles from that company for a limited period, with visible audit context.
  - Apply this to recurring companies like Mistral, 1Password, and Airbnb through the same generic rule, not hardcoded company exceptions.
- Unify page and agent filtering:
  - Replace page-specific suppression logic with one shared helper used by Jobs, Dashboard, Applications, Apply Sprint, recruiting agency candidate selection, search ingest, and bulk prep.
  - Dashboard “Needs Review,” Jobs list, agency counts, Applications command center, and Apply Sprint should agree on counts and visible items.
  - Submitted/applied jobs and rejected jobs should be excluded before scoring/approval wherever possible.
- Add reconciliation/backfill:
  - Scan existing applications, rejected matches, archived matches, duplicate groups, and known repeated-company patterns.
  - Populate the new suppression records.
  - Mark currently visible duplicate active matches as rejected/suppressed when they conflict with an existing rejection or submitted application.
  - Produce search-run stats showing jobs skipped for duplicate, rejected, submitted, or cooldown reasons.

## Public Interfaces / Data Model
- Add a suppression model such as `JobSuppression` with:
  - `userId`
  - `kind`: `REJECTED_JOB`, `SUBMITTED_JOB`, `ARCHIVED_JOB`, `COMPANY_COOLDOWN`
  - canonical job/company/title/location keys
  - optional `jobPostingId`, `jobProfileMatchId`, `applicationId`, `duplicateGroupId`
  - `reason`, `source`, `expiresAt`, `createdAt`, `updatedAt`
- Add shared library functions for:
  - creating suppression keys from a job
  - checking whether a job is suppressed for a user
  - recording suppression on reject/delete/apply
  - reconciling existing duplicate states
- Existing reject, bulk reject, Apply Sprint delete, mark-applied, and assistant submit paths must call the shared suppression recorder.

## Test Plan
- Unit tests:
  - canonical key generation handles company casing, title variants, remote/location variants, and URL variants.
  - rejected jobs suppress same canonical job across multiple profiles.
  - submitted/applied jobs suppress duplicate ready/apply-sprint entries.
  - company cooldown triggers after repeated rejects and expires correctly.
- Route tests:
  - single reject, bulk reject, and Apply Sprint delete create suppression records and update sibling matches.
  - application submit/mark-applied creates submitted suppression.
- Integration/query tests:
  - Jobs, Dashboard, Applications, Apply Sprint, and agency candidate selection return consistent counts for suppressed jobs.
  - fresh search ingest skips jobs already rejected/applied by canonical key.
- Data verification:
  - run reconciliation against current local data and verify Mistral, 1Password, and Airbnb repeated rejects no longer appear as active `needs_review`, `approved`, or `ready_to_apply` items unless explicitly allowed.

## Assumptions
- Default behavior is “fewer, stronger results.”
- Rejection is job-wide across all profiles and sources.
- Repeated-company noise should use automatic temporary cooldowns, with an audit trail.
- Similar roles at a cooled-down company should be hidden by default, not merely labeled.
