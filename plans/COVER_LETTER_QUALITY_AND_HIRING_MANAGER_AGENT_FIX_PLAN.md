# Cover Letter Quality and Hiring-Manager Agent Fix

## Summary
- The Linear letter failed because it used the deterministic fallback, not the structured OpenAI writer. QA marked it `NEEDS_REVIEW`, but packet prep still allowed weak material into the application flow.
- Fix the root issue by making cover-letter quality a launch gate, not an advisory note.
- Add dedicated specialist agents for evidence selection and hiring-manager review, then quarantine/regenerate existing weak letters.

## Key Changes
- Add two new `AgentType` values with Prisma migration, skill registry coverage, roster visibility, quality-gate coverage, and docs:
  - `APPLICATION_EVIDENCE_CURATOR`: selects job-specific proof points from approved evidence, resume, projects, work history, and retrieved `usableFor: "coverLetter"` evidence.
  - `HIRING_MANAGER_REVIEWER`: scores the cover letter as a hiring manager would, checking role fit, specificity, company/job alignment, evidence coverage, unsupported claims, and generic/fallback patterns.
- Introduce shared material-quality types stored in `generationNotes` and packet `qualityReviewJson`:
  - `ApplicationEvidencePlan`
  - `HiringManagerMaterialReview`
  - `ApplicationMaterialQuality` with `status`, `launchable`, `reasons`, `score`, `evidenceRefs`, `generatedBy`, and optional rewrite notes.
- Update cover-letter generation so both packet prep and manual cover-letter generation use the same flow:
  - resume strategy
  - evidence curator
  - cover-letter writer
  - hiring-manager review
  - one rewrite attempt when review says the draft is fixable
  - existing Application QA and material-claim sync
- Fail closed when OpenAI is unavailable, times out, or structured generation fails:
  - deterministic fallback can be saved only as review-only material
  - it must not move the application to `ready_to_apply`
  - remove the hard-coded Agentic job-search paragraph and random first-three-bullets behavior from launchable output
- Tighten launch gates:
  - `prepareApplicationPackage` only transitions to `ready_to_apply` when URL, resume, cover letter, claims, packet QA, and `materialQuality.launchable === true` all pass
  - Apply Sprint, assistant launch, `next-ready`, extension-ready APIs, recruiting agency prep, and bulk prep suppress blocked materials with reason `material_quality_needs_review`
  - API responses may add optional `materialQuality` details while preserving existing fields

## Remediation
- Add `scripts/repair-application-materials.ts` with dry-run default and apply/regenerate modes.
- Scan generated cover letters and ready applications for:
  - `generatedBy: "deterministic_fallback"`
  - QA status not `PASS`
  - unsupported claims, severe warnings, or score below the pass threshold
  - fallback phrases like "Relevant examples from my approved profile include," generic "I am interested," and forced Agentic job-search paragraphs
- On apply:
  - mark weak cover letters with `materialQuality.status = "BLOCKED"`
  - sync packet QA and material claims
  - move affected `ready_to_apply` applications back to `approved` with `transitionApplicationState` source `application_material_quality_repair`
  - regenerate through the new pipeline when a direct application URL and sufficient evidence exist
  - preserve originals and audit history

## Test Plan
- Unit tests:
  - the pasted Linear fallback letter is blocked
  - a role-specific Linear/Product Engineer letter with supported React, TypeScript, full-stack, product, UX, and AI workflow evidence can pass
  - fallback generation never produces launchable materials
  - evidence curation does not select unrelated AR/defense bullets for product-engineering roles unless the job asks for that domain
  - new AgentTypes are covered by the skill registry, roster, and Generated Materials quality gate
- Integration tests:
  - packet prep does not transition to `ready_to_apply` when material quality is blocked
  - manual cover-letter generation stores review metadata and material claims
  - Apply Sprint, assistant launch, extension-ready, recruiting agency, and bulk prep all suppress blocked material
  - repair script dry-run/apply correctly quarantines weak letters and moves ready apps back to approved
- Verification commands:
  - targeted Vitest for resume/cover-letter generation, material agents, packet prep, application packets, Apply Sprint, recruiting agency, assistant launch, extension-ready, and repair script tests
  - `npx tsc --noEmit --pretty false`
  - `npm run build`
  - `git diff --check`

## Assumptions
- A Prisma enum migration is acceptable because new specialist agents were requested.
- No new database tables are needed; `AgentRun`, `generationNotes`, `ApplicationPacket.qualityReviewJson`, `MaterialClaim`, and `ApplicationEvent` are sufficient.
- Cover letters remain manual-review material; the app still never submits externally.
- Resume work-history continuity remains a hard requirement and must not be weakened while improving cover-letter relevance.
- `node_modules/next/dist/docs/` is absent, so implementation should follow existing App Router patterns.
