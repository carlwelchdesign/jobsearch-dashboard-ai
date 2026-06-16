# Recruiter-Format Resume Experience With Safe Version Suggestions

## Summary
- Update tailored resumes to follow the recruiter-friendly structure per role: `Company - Title | Dates`, optional `"Application/Product Name"`, a concise application context sentence, outcome bullets, and `Tech Used: ...`.
- Add timeframe-based version inference, but keep it review-first: agents may suggest likely versions from role dates and source evidence, but exact versions appear in resumes only after approval.
- Preserve the current continuity guard so every employer remains listed and no employment gaps are introduced.

## Key Changes
- Add a `resumeContext Json @default("{}")` field to `WorkExperience` with typed helpers for application context, confirmed tech, and version suggestions.
- Add `src/lib/resumes/version-inference.ts` to suggest versions only for technologies already present in role evidence.
- Update role-description digesting to attach recruiter-format context and review-only version suggestions.
- Add `PATCH /api/resumes/work-experiences/[id]/resume-context` for role-context edits and version-suggestion review.
- Update `/resumes/profile` with role-context review grouped by work experience.
- Update resume generation to render confirmed recruiter-format context and approved versions only.
- Update material QA to flag unapproved inferred version language in generated materials.

## Test Plan
- Unit-test version inference, recruiter-format rendering, digest context creation, API updates, and material QA flags.
- Run focused Vitest suites, TypeScript, React Doctor, build, and diff checks.

## Assumptions
- Version policy is review-first.
- Unsupported application titles, scale, users, or versions are omitted from resume text until supported by source evidence or user confirmation.
- Existing saved resumes are not rewritten automatically; regenerated resumes use the new format.
