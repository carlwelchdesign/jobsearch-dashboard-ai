# Custom Opportunity Resume Page Plan

## Summary

Add a resume-focused workflow at `/resumes/custom-opportunity` where a recruiter role brief can be pasted, parsed into editable opportunity fields, and used to generate a tailored resume. The generated resume will be saved through the existing `JobPosting`/`JobProfileMatch`/`GeneratedResume` models so current generated-materials review, ATS checks, PDF export, and plain-text export keep working.

## Key Changes

- Add a new Resumes card/link for "Custom Opportunity" and add broader navigation only if it fits the existing UI without crowding.
- Build a client page with:
  - Large "Recruiter role brief" textarea.
  - Editable inferred fields: company, title, location, remote type, application URL.
  - "Extract details" action to infer missing fields from the pasted brief.
  - "Generate resume" action that saves the opportunity and returns the generated resume preview plus PDF/Text links.
- Add API endpoints:
  - `POST /api/resumes/custom-opportunity/infer`: accepts pasted text and returns inferred company/title/location/remote/application URL with fallback placeholders only when inference fails.
  - `POST /api/resumes/custom-opportunity/generate`: validates pasted text, creates or updates a manual job source named `Recruiter Opportunity`, ensures a usable `JobProfileMatch`, generates a tailored resume, runs ATS/QA checks, and returns `{ jobUrl, resumeId, pdfUrl, textUrl, resumePreview, warnings }`.

## Implementation Details

- Reuse existing resume generation logic from `tailorResumeForJob`, `createResumeStrategy`, `attachResumeQa`, and `checkAtsReadability`; extract shared server logic if needed to avoid duplicating the full `/api/jobs/[id]/generate-resume` route.
- Use `captureManualJob` for persistence/dedupe. If normal scoring creates no match, pick the highest-scoring enabled `JobSearchProfile` with `scoreJobForProfile`, run `runJobFitScoringAgent`, and use that match so intentional recruiter opportunities are not blocked by thresholds.
- Store source metadata in `rawData` with `captureSource: "Recruiter Opportunity"` and the original pasted brief.
- Do not create an `Application` or cover letter in this workflow. Users can open the saved job later if they want the full package path.
- Keep generated resumes visible in `/resumes/generated` and downloadable through existing `/api/resumes/generated/[id]/pdf` and `/plain-text` routes.

## Test Plan

- Add route tests for inference validation, generation with provided company/title, generation with inferred fields, and no-match fallback profile scoring.
- Verify generation rejects empty or too-short briefs with a clear 400 response.
- Verify generated response includes usable `resumeId`, `jobUrl`, `pdfUrl`, and `textUrl`.
- Run targeted Vitest tests for the new route/service plus existing generated-resume route tests.
- Run `npm run build` or the repo's nearest non-mutating type/build check after implementation.

## Assumptions

- The workflow saves generated material records because export/review already depends on persisted `GeneratedResume`.
- "Resume only" means no automatic cover letter, packet, or application tracker.
- Missing company/title should be inferred and editable; if still unavailable, use `Unknown company` / `Untitled role` only as a final fallback.
- No Prisma schema migration is needed.
