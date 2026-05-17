# Actionable Activated Learning Plan

## Summary
The quality loop now creates active `SkillAdjustment` records when safe proposals are accepted, but most agents only record that guidance instead of changing behavior. The next step is to make accepted learning actionable in bounded, deterministic ways for job matching, dedupe/search quality, application QA, and agency approval.

## Key Changes
- Add shared adjustment-consumption helpers that normalize known `GUIDANCE` and `QA_CHECK` proposal categories into rule flags.
- Ignore arbitrary free-text guidance unless it came from a recognized quality proposal category.
- Keep existing bounded `THRESHOLD` handling unchanged.
- Make `job_fit_scorer`, `duplicate_stale_job_detector`, `application_qa`, and `approve_agency_match` consume active learning rules through existing skill adjustment hooks.
- Include applied learning in relevant outputs, concerns, warnings, reasoning summaries, or agency failure messages.

## Test Plan
- Unit test adjustment helpers map known proposal payloads into rule flags and ignore unknown free text.
- Unit test job-fit scoring changes recommendation/concerns for rejected high-score learning cases.
- Unit test duplicate/stale detection applies stricter stale handling when dedupe learning is active.
- Unit test application QA adds cover-letter/field-classification warnings from active QA checks.
- Unit test agency approval applies candidate-quality guidance without bypassing suppression/application checks.
- Run Prisma validation, TypeScript, focused tests, full tests, build, and page smoke checks.

## Assumptions
- No schema migration is needed.
- Active learning remains deterministic and bounded to known proposal categories.
- Accepted proposals affect future agent runs, not old evaluations or job/application records.
