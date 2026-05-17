# Outcome Calibration Drill-Down Review Plan

## Summary

Add drill-down visibility to outcome calibration so aggregate signals become explainable. The app should show which companies, sources, search profiles, duplicate groups, rejected high-score jobs, resurfaced suppressed jobs, and assistant runs caused each workflow score. This is review UI only; it should not change agent behavior automatically.

## Key Changes

- Extend `getOutcomeCalibration` to return `details` with resurfaced suppressed jobs, active duplicate groups, rejected high-score matches, assistant failures, profile breakdowns, and source breakdowns.
- Add a compact drill-down UI under Settings → Outcome Calibration using existing MUI layout patterns and links to jobs/applications where possible.
- Keep `GET /api/observability/outcomes` and `POST /api/observability/outcomes/recompute` backward-compatible by adding `details` without changing existing fields.
- Keep payloads redacted and metadata-only; do not expose resumes, cover letters, prompts, form answers, screenshots, emails, phone numbers, or secrets.
- Do not add a migration; use existing job, match, application, outcome, suppression, source, profile, and automation-run data.

## Test Plan

- Unit tests for drill-down builders and profile/source breakdown calculations.
- API tests continue to verify outcome summary responses include details.
- Regression checks: Prisma validate, TypeScript, focused outcome calibration tests, full tests, build, and smoke pages.

## Assumptions

- First surface remains Settings because the scorecard already lives there.
- Drill-down is read-only and review-focused.
- A later plan can convert repeated drill-down findings into review-only action recommendations.
