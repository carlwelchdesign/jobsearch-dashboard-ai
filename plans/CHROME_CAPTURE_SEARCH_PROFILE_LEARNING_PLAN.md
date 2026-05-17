# Chrome Capture Search Profile Learning

## Summary

When the Chrome extension saves a job and the capture flow returns `0 matching profiles`, treat that as a strong user intent signal. The app will automatically create an enabled draft search profile for similar jobs, biased toward AI-native product/frontend work like Job Search OS while preserving broader senior frontend/product engineering compatibility.

## Key Changes

- Add a capture-driven profile creation service used by `POST /api/jobs/capture`.
- Trigger only when `captureManualJob()` returns zero matches.
- Use existing `JobSearchProfile` fields; no migration.
- Avoid duplicate captured-intent profiles.
- Return profile creation metadata to the extension.
- Update extension status copy to show when a profile was created.

## Test Plan

- Add service coverage for Terzo-style AI-native frontend capture, duplicate avoidance, and broad urgent-search defaults.
- Update capture API tests for zero-match profile metadata and nonzero-match no-op behavior.
- Run focused tests, TypeScript, and production build.

## Assumptions

- Auto-create draft, zero-matches-only, dual-track behavior is the chosen default.
- Existing familiar search profiles remain unchanged.
- The profile is enabled immediately and can be edited or disabled from `/profiles`.
