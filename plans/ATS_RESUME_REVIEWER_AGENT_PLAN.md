# ATS Resume Reviewer Agent With Auto-Rewrite

## Summary
Add a dedicated `ATS_RESUME_REVIEWER` agent that reviews every generated job-specific resume for ATS readability, recruiter quality, keyword coverage, format risks, unsupported claims, and summary/experience red flags. When the agent finds clear high-confidence issues, it automatically rewrites and replaces the generated resume while preserving the original and review rationale in `generationNotes`.

## Key Changes
- Add new `AgentType`: `ATS_RESUME_REVIEWER`.
- Add a code-first skill registry entry so architecture coverage remains complete.
- Implement an ATS resume reviewer agent that accepts `jobPostingId`, `generatedResumeId`, and optional `userId`.
- Agent output includes status, ATS score, recruiter score, keyword coverage, format warnings, recruiter red flags, evidence risks, recommended edits, rewrite decision, and confidence.
- Reviewer runs after resume generation and after “Regenerate materials.”
- Auto-rewrite only when findings are concrete and confidence is high.
- Preserve the original resume text, rewritten text, review output, rewrite reason, and timestamp in `GeneratedResume.generationNotes.atsResumeReview`.
- Replace `markdown`, `plainText`, `html`, and refreshed `atsChecks` when the rewrite is applied.
- Do not auto-submit or mark an application applied. This remains resume-material improvement only.

## UI
- Show an `ATS Resume Review` panel on the application detail page.
- Display review status, ATS score, recruiter score, missing important keywords, red flags, and applied rewrite summary.
- If a rewrite was applied, show that the resume was automatically improved and that the original was preserved in review metadata.
- Do not add this panel to the generated resumes library in v1.

## Test Plan
- Agent flags awkward generated summary phrasing such as job/company repetition.
- Agent detects missing important role keywords from the job description.
- Agent detects missing or invalid contact/profile links.
- Agent flags ATS-hostile formatting and missing required sections.
- Agent flags unsupported or inferred technology/version claims.
- Clear high-confidence findings trigger an automatic rewrite and replacement.
- Low-confidence or minor findings do not rewrite.
- Original resume content is preserved in `generationNotes`.
- Normal resume generation stores ATS review output.
- Regenerate materials stores ATS review output.
- Skill registry covers the new `AgentType`.
- Run focused agent/generation tests, TypeScript, production build, and application page route check.

## Assumptions
- The reviewer is allowed to replace generated resume content automatically only for clear, high-confidence issues.
- The original generated resume must remain recoverable through stored metadata.
- The first UI surface is the application detail page.
- This agent reviews and improves resumes only; it does not submit applications or mutate external systems.
