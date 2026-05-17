# Cross-Agent Quality Scoring Plan

## Summary

The next step is to make the local/LangSmith-style quality loop evaluate more than the application assistant. The app now captures graph and agent failures, but the evaluator still mainly scores assistant behavior. This plan adds practical quality scoring for recruiting agency, job search/dedupe, and job matching so repeated bad recommendations, resurfaced rejected jobs, failed agency packets, and noisy searches become measurable issues with review-only improvement proposals.

## Key Changes

- Extend quality evaluation beyond `APPLICATION_ASSISTANT`:
  - Add evaluators for `RECRUITING_AGENCY`, `JOB_SEARCH`, and `JOB_MATCHING`.
  - Keep the existing API shape for `/api/observability/evaluations/run`, but allow an optional `target` filter.
  - Continue storing all results locally; LangSmith remains optional and redacted.
- Add quality example capture for high-signal failures:
  - Recruiting agency: stale graph repair, manual cancel, retry-after-failure, candidate packet failure, zero useful candidates, and duplicate/skipped-heavy runs.
  - Job search: duplicate resurfacing, rejected/applied job resurfacing, stale company repeats, low saved-to-fetched ratio, and source noise.
  - Job matching: user rejection after high score, missing suppression memory, weak score explanation, and repeated company/title false positives.
- Add target-specific deterministic scoring:
  - `RECRUITING_AGENCY`: packet success rate, duplicate avoidance, failure recovery, and useful candidate yield.
  - `JOB_SEARCH`: dedupe effectiveness, suppression adherence, source quality, and fresh-result ratio.
  - `JOB_MATCHING`: score/rejection alignment, explanation quality, rejection-memory alignment, and evidence fit.
- Improve proposals:
  - Group failed evaluations by target and failure category.
  - Create review-only `AgentImprovementProposal` records.
  - Do not auto-apply changes to search profiles, scoring weights, prompts, skills, or workflows.

## Public Interfaces

- `POST /api/observability/evaluations/run`
  - Accept optional body: `{ "target": "RECRUITING_AGENCY" | "JOB_SEARCH" | "JOB_MATCHING" | "APPLICATION_ASSISTANT" }`.
  - If omitted, run all supported evaluators.
  - Response includes per-target scanned/evaluated/proposal counts.
- `GET /api/observability/evaluations`
  - Accept optional query `target`.
  - Return grouped dataset/evaluation/proposal summaries by target.
- No schema migration required.

## Test Plan

- Unit tests for recruiting agency, job search, and job matching evaluators.
- API tests for optional target filtering and invalid targets.
- Proposal tests proving target/category grouping and propose-only status.
- Regression checks: Prisma validate, TypeScript, focused quality tests, full tests, build, and smoke pages.

## Assumptions

- Deterministic local evaluators are the default for v1.
- LangSmith is optional and redacted.
- Improvement proposals remain review-only.
- This plan measures existing workflows before moving more workflows into LangGraph.
