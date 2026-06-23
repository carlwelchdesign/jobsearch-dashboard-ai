# Resume Format + Resume Re-Onboarding Plan

## Summary
Implement a resume re-onboarding flow that lets the user upload a new resume, review parsed profile data, activate the latest approved upload as the active resume source, run agent review, and generate reviewable search profile suggestions. Generated job-specific resumes will use the approved master format for Professional Experience: `Company - Title | Dates`, `Skills: ...`, then bullet points.

## Key Changes
- Update generated resume formatting in `tailorResumeForJob` and its deterministic fallback so every Professional Experience entry renders:
  - `Company - Title | Date range`
  - `Skills: React, TypeScript, ...`
  - 1-5 truthful bullets
- Build the role-level `Skills:` line from approved evidence only:
  - Prefer `WorkExperience.resumeContext.confirmedTech` plus approved version suggestions.
  - Fall back to `WorkExperience.skills` from the approved resume upload.
  - Exclude needs-review/inferred version suggestions from resume text.
- Apply the same Professional Experience format to normal job resumes and custom opportunity resumes.
- Fix custom opportunity generation to use the same active-upload source filtering as normal job resume generation.

## Re-Onboarding Flow
- Keep the flow inside the existing Resumes area as a guided review wizard:
  - Upload resume.
  - Review parsed contact, summary, skills, work experience, role skills, achievements, projects, education, and certifications.
  - Approve the upload.
  - Show agent review results and search profile suggestions immediately after approval.
- Approval behavior:
  - Preserve old resume uploads and manual profile evidence for history.
  - Mark the newest approved upload as the active resume source by relying on the existing latest-approved-upload selection.
  - Recreate only records tied to the approved upload when re-approving that upload.
  - Do not mutate old generated resumes; users regenerate materials when they want the new format/source.
- Agent behavior:
  - Run `CANDIDATE_INTELLIGENCE` after approval using structured notes from the parsed resume.
  - Run a `SEARCH_PROFILE_MANAGER` resume-reonboarding mode that calls the existing profile suggestion logic and records an `AgentRun`.
  - Return suggested profiles with evidence and duplicate flags.
  - Let the user create selected profiles only; do not auto-replace or delete existing profiles.

## Public Interfaces And Data
- No Prisma migration or new `AgentType` needed.
- Extend existing API behavior:
  - `POST /api/resumes/uploads/[id]/approve` returns profile activation status, candidate review run id, search profile run id, and suggested profiles.
  - Existing profile creation API remains the write path for creating selected suggestions.
- Extend search profile manager output with a reviewable `suggestedProfiles` payload for resume re-onboarding.
- Reuse existing `AgentRun` and `AgentRunEvent` observability.

## Test Plan
- Add/extend resume generation tests:
  - Professional Experience uses header, `Skills:`, then bullets.
  - Role skills come from confirmed tech or work-experience skills.
  - Needs-review version suggestions do not appear.
  - Continuity fallback uses the same format.
- Add/extend upload approval tests:
  - Approval updates the active profile and upload state.
  - Old uploads are preserved.
  - Candidate intelligence and search profile review are triggered.
  - Suggested profiles are returned but not automatically created.
- Add/extend custom opportunity tests:
  - Custom opportunity resumes use active-upload work experiences.
  - Generated content follows the new role format.
- Run focused Vitest suites for resume generation, upload approval, profile suggestions, and custom opportunity generation, then run TypeScript and build checks.

## Assumptions
- "Active resume source" means the latest approved upload, with older uploads retained for history.
- Search profile suggestions are review-first: the app proposes profiles and the user creates selected ones.
- The desired change is content structure and ATS readability, not a new visual PDF design system.
