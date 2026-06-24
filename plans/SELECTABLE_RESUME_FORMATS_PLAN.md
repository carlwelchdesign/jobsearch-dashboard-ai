# Selectable Resume Formats In Settings

## Summary
Add a global resume format setting that controls generated resume PDF exports and in-app resume previews. The default is a screenshot-inspired, ATS-safe two-column format. Existing generated resumes render with the current selected format without regeneration.

## Key Changes
- Add `UserProfile.resumeFormat` with default `modern_two_column`.
- Support `modern_two_column`, `atelier`, `tschichold`, and `swiss`.
- Add a selector to `/settings/application`.
- Keep generated resume markdown/plain text unchanged.
- Render PDF exports and application-detail previews from the selected live setting.

## Verification
- Focused settings/API, PDF, and preview tests.
- TypeScript, production build, React Doctor, browser screenshots, and PDF rendering checks.
