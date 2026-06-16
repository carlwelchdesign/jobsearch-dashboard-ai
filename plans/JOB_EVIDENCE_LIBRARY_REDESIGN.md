# Job Evidence Library Redesign Plan

## Summary
Redesign `/resumes/profile` from a split "Role Resume Context" plus "Verified Bullet Bank" page into a Job Evidence Library. The default view should be an all-jobs career timeline where each job owns its bullets, confirmed tech, product context, source records, and cleanup actions. This preserves the existing resume-continuity requirement while making the page usable for improving application materials.

## Key Changes
- Replace the current separate role-context and bullet-bank sections with grouped job rows showing company, title, dates, bullet count, confirmed tech count, context status, and duplicate/source status.
- Add a grouped profile view model that groups `WorkExperience` rows by normalized company/title, attaches bullets by `workExperienceId` or normalized company/role, marks unmatched bullets for review, and calculates readiness per job.
- Add per-job editing with an expandable row, confirmed-tech chip editor, compact bullet table, scoped role-description digest, and version suggestion review.
- Add cleanup and backfill flow for duplicate source review, reviewed bullet matches, and explicit duplicate merge.
- Keep all bullets available in a secondary searchable/filterable power-editing table.

## Interfaces / Types
- No major schema migration is required because `ExperienceBullet.workExperienceId` already exists.
- Add internal view-model types such as `JobEvidenceGroup`, `JobEvidenceReadiness`, and `BulletMatchReview`.
- Add internal APIs for assigning/reassigning bullets, confirming auto-matched bullets in bulk, and merging duplicate work experiences after explicit review.
- Keep existing APIs for bullet create/update/delete, role-context save, digest role description, and version-suggestion approval.

## Test Plan
- Add/update tests covering grouped timeline rendering, expandable jobs, linked and auto-matched bullets, duplicate grouping without deletion, explicit duplicate merge, and confirmed-tech editing.
- Run targeted Vitest tests for the view model and API handlers, TypeScript, React Doctor, production build, smoke pages, and a visual check of `/resumes/profile`.

## Assumptions
- The source of truth should be organized around jobs held, not backend tables.
- Generated resumes must continue preserving every employer.
- Duplicate deletion is review-first, not automatic.
- Bullet backfill uses auto-match with user review.
- Confirmed tech uses a chip editor in v1.
