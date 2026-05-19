# Jolene Knowledge Depth Upgrade Plan

## Summary

Make Jolene substantially more useful by giving her deeper app-wide knowledge, semantic retrieval, and better synthesis before she answers. The next layer should focus less on adding more actions and more on making Jolene understand the whole app: jobs, applications, generated materials, evidence, outcomes, agent runs, failures, search profiles, market intelligence, and career context. Risky action confirmations should use inline chat buttons later, but this phase prioritizes better answers.

## Key Changes

- Add a global Jolene context builder.
  - Build one compact app-wide snapshot for every Jolene request: pipeline counts, active blockers, ready/applied applications, duplicate/suppression signals, recent agent failures, profile health, market intelligence, outcome trends, and recent user feedback.
  - Merge this with the current route context so Jolene can answer both “this page” and “whole app” questions.
  - Keep sensitive content summarized by default: no full resumes, cover letters, emails, application answers, or browser content unless explicitly requested.
- Add semantic app retrieval for Jolene.
  - Search across generated materials, applications, jobs, evidence, search profiles, agent runs, quality examples, outcomes, and wiki/docs.
  - Prefer existing embeddings/vector infrastructure where available; otherwise add a deterministic lexical fallback.
  - Return cited local records with links, record type, confidence, and short safe excerpts.
- Add query decomposition.
  - For broad questions like “why is this app not finding good jobs?” Jolene should break the question into app areas: search profiles, sources, scoring, duplicates, applications, outcomes, and agent failures.
  - Run the relevant read tools, then synthesize a grounded answer with specific evidence and next actions.
  - Do not answer broad operational questions from the current page context alone.
- Add answer quality rules.
  - Jolene must state what data she checked.
  - Jolene must distinguish known facts, likely causes, and recommended next steps.
  - Jolene must include direct links to relevant records where possible.
  - If evidence is weak, Jolene should say what is missing instead of giving a generic answer.
- Add inline confirmation groundwork, but only for display.
  - Extend Jolene message `actionJson` so planned risky actions can be rendered as structured cards later.
  - Do not implement execution of confirmed guarded actions in this phase.
  - Continue returning confirmation plans for risky actions.

## Public Interfaces And Types

- Extend Jolene context internals with:
  - `buildJoleneGlobalContext(userId)`
  - `retrieveJoleneKnowledge(query, userId)`
  - `synthesizeJoleneGroundedAnswer(message, routeContext, globalContext, retrievedItems)`
- Extend Jolene response `actionJson` with:
  - `checkedSources`
  - `retrievedItems`
  - `confidence`
  - `knownFacts`
  - `likelyCauses`
  - `recommendedActions`
- No Prisma migration required unless existing embedding storage cannot support non-evidence Jolene retrieval. If schema changes are needed, use a narrow `JoleneKnowledgeIndex` table with source type, source id, title, summary, href, metadata, embedding, and timestamps.

## Test Plan

- Unit tests:
  - “Where is my Linear cover letter?” still uses exact retrieval.
  - “Why is Linear still showing after I applied?” checks applications, matches, jobs, and outcomes.
  - “Why am I seeing duplicates?” checks duplicate groups, suppressions, rejected/applied resurfacing, and recent dedupe runs.
  - “Why am I not getting better jobs?” checks profiles, sources, search runs, job scores, rejected high-score jobs, and outcome trends.
  - “What should I say for Socure?” still uses career context and evidence-backed coaching.
- Integration tests:
  - `/api/jolene` preserves response shape.
  - Broad questions include `checkedSources` and `retrievedItems`.
  - Sensitive data is summarized, not dumped.
  - Missing evidence produces an honest gap statement.
- Verification:
  - `npx vitest run src/lib/jolene src/lib/adk --config vitest.config.ts`
  - `npx tsc --noEmit --pretty false`
  - `npm run build`
  - Smoke Jolene on `/dashboard`, `/jobs`, `/applications`, `/agents`, `/settings`.

## Assumptions

- The highest-value next improvement is answer depth and trustworthiness, not more autonomous mutation.
- Jolene should become app-aware across all data surfaces before she gets broader write permissions.
- Exact deterministic retrieval remains first for known material/application/job lookup.
- ADK remains the operator/control-plane layer, while local app data remains the source of truth.
