# Fix Resume Upload Redirect + Generated Resume Parsing

## Summary
Fix the resume re-onboarding flow so a successful upload immediately sends the user to `/resumes/review`, and harden resume parsing so the generated master resume format is parsed correctly instead of treating summary/skills text as company/title data. Add a manual "Re-parse upload" action so the already-bad pending upload can be repaired in place after the parser fix.

## Key Changes
- Redirect successful uploads to `/resumes/review`.
- Recognize generated resume section headers and `Company - Title | Dates` role headers.
- Keep summary, skills, role skills, and bullets in the correct parsed fields.
- Add a review-page re-parse action that updates only the upload's parsed JSON and keeps approval separate.

## Test Plan
- Parser regression tests for generated resume input.
- Re-parse route tests for non-approval mutation boundaries.
- Upload redirect source coverage.
- Focused Vitest, TypeScript, build, React Doctor, and diff checks.
