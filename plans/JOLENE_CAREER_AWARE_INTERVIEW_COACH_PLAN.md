# Jolene Career-Aware Interview Coach Phase

## Summary

Evolve Jolene from an app-navigation/data lookup assistant into a career-aware advisor that can answer interview, positioning, and self-assessment questions using the user's full local career context. The Socure prompt failed because Jolene's action router misclassified pasted recruiter text as an email-sync command and because her default prompt context does not include enough candidate evidence, projects, outcomes, generated materials, and app-building work to answer deeply.

## Key Changes

- Add a Jolene intent gate before side-effect actions:
  - Only run `check_email`, `run_job_search`, or dedupe actions when the user clearly asks Jolene to perform that action.
  - Do not trigger actions from quoted/pasted recruiter text, job descriptions, interview prompts, or emails unless the user explicitly says to check/sync/run.
  - For ambiguous text containing "email", "look", "review", or "scan", prefer advisory answering over side effects.
- Add a career-aware context builder for Jolene:
  - Load compact candidate profile facts, approved evidence, work experiences, projects, GitHub-derived evidence, generated material themes, application outcomes, and recent high-signal app work.
  - Include this context for interview, career positioning, skills, accomplishments, "how does this apply to me", "what should I say", and company-specific prep questions.
  - Keep raw resumes, full cover letters, and long private content out of default prompts; pass summarized, evidence-backed snippets and IDs.
- Add interview/advisory retrieval tools:
  - `buildCareerContext`
  - `findEvidenceForTheme`
  - `answerInterviewPrompt`
  - `buildCompanyInterviewBrief`
  - `mapPromptToStories`
- Update Jolene response behavior:
  - For questions like "How have you observed this applies to me?", Jolene should synthesize a coaching answer, not perform an app action.
  - Answers should include direct observations, interview-ready talking points, evidence gaps, and suggested metrics to quantify.
  - If evidence is weak or missing, Jolene should say what she can support and recommend adding evidence to the Evidence Library.
- Add Socure-style interview prep support:
  - Recognize recruiter success-profile prompts.
  - Map each theme to the user's strongest stories: ownership, measurable impact, ambiguity, trade-offs, and AI workflow leverage.

## Public Interfaces and Types

- Extend Jolene action results with a non-mutating advisory action type such as `career_advice` or `interview_coaching`.
- Add a server-only Jolene career context module that returns compact, redacted career context.
- Keep `/api/jolene` request shape unchanged.
- No Prisma migration is required for this phase.

## Test Plan

- Add tests proving pasted recruiter text does not trigger `check_email`.
- Add tests for:
  - "How have you observed this applies to me?"
  - "How should I answer Socure's success profile question?"
  - "Give me stories for ownership, ambiguity, metrics, and AI workflows."
- Verify Jolene uses career context when available and gives a useful fallback when evidence is missing.
- Verify explicit email commands still work:
  - "check my Gmail"
  - "sync job response email"
- Run:
  - `npx vitest run src/lib/jolene/actions.test.ts --config vitest.config.ts`
  - `npx tsc --noEmit --pretty false`
  - `npm run build`

## Assumptions

- Jolene should answer career/interview questions from local app data before relying on generic LLM reasoning.
- Side-effect actions must require explicit commands, not keyword matches inside pasted content.
- The first implementation should use existing profile/evidence/material/application data and avoid adding a new memory schema.
- The next later phase can persist curated interview stories if this advisory layer proves useful.
