# Agent System Implementation Plan

## Current Framework And App Structure

- Framework: Next.js `13.5.11` App Router with React 18 and TypeScript.
- UI: Material UI v9 with app-wide theme in `src/app/theme.ts`, shared shell in `src/app/app-shell.tsx`, and reusable components under `src/components`.
- App pages:
  - `/dashboard`: command center, profile thresholds, review queue, pipeline.
  - `/profiles`: job search profile CRUD and AI profile suggestions.
  - `/jobs`: job review queue with status filters, desktop table, mobile swipe cards, signal search.
  - `/jobs/[id]`: job detail, generation actions, application prep.
  - `/resumes`: resume uploads, review, approved profile, generated materials.
  - `/applications`: application tracking and local browser assistant.
  - `/runs`: search run history.
  - `/settings`: AI/provider, profile links, notification, cron, and company source settings.
- API routes live under `src/app/api/**/route.ts`.
- Shared domain/services live mostly in:
  - `src/lib/job-search/*`
  - `src/lib/ai/*`
  - `src/lib/applications/*`
  - `src/lib/resumes/*`
  - `src/lib/github/*`

Note: repo instruction says to read `node_modules/next/dist/docs/` before Next code changes. That docs path is not present in this install, so implementation should rely on current source patterns and compile checks.

## Current Database / ORM Setup

- ORM: Prisma `5.22.0`.
- Database: PostgreSQL via `DATABASE_URL`.
- Prisma schema: `prisma/schema.prisma`.
- Current Docker Postgres maps host `5433` to container `5432`.
- Existing migrations are in `prisma/migrations`.
- Seed command: `tsx prisma/seed.ts`.

Important existing enums:

- `JobSourceType`: `greenhouse`, `lever`, `ashby`, `remoteok`, `weworkremotely`, `company_site`, `manual`.
- `JobMatchStatus`: includes discovery, review, approval, application, rejection, offer, and archive states.
- `TruthLevel`: `verified`, `inferred`, `estimated`, `needs_review`.
- `SearchRunStatus`, `SearchRunTrigger`, `ApplicationEventType`, `DigestMode`.

## Current Job / Resume / Application Models

Existing models that should be extended rather than replaced:

- `UserProfile`: current candidate profile. Has contact info, master summary, role/skill/domain JSON fields, Github repositories, projects, work experiences, resume uploads, and experience bullets.
- `ExperienceBullet`: current durable career fact unit. Has company, role, category, text, metrics, keywords, source text, truth level, and optional resume upload source.
- `Project`: project facts and technologies.
- `GithubRepository`: synced public GitHub context.
- `ResumeUpload`: uploaded resume text plus parsed JSON and approval status.
- `JobSearchProfile`: existing search profile. Already covers target titles, locations, remote preference, salary, industries, keyword filters, enabled/schedule fields, and match thresholds.
- `JobSource`: external source configuration. Already supports direct ATS sources and newly seeded `company_site` source list.
- `JobPosting`: existing job model. Has source, title/company/location, remote/salary, description, requirements, ATS provider, source IDs, application URL, raw data, content hash, and seen timestamps.
- `JobProfileMatch`: existing job-to-profile evaluation. Has overall and component scores, strongest matches, concerns, missing keywords, recommended action, explanation, status.
- `GeneratedResume` and `GeneratedCoverLetter`: current generated materials, linked to job and match.
- `Application`: current application tracker. Links user, job, match, resume, cover letter, status, notes, follow-up.
- `ApplicationEvent`: current application timeline.
- `Contact`: current contact model. Can evolve into recruiter contact.

The requested domain model maps naturally onto these existing tables:

- `CandidateProfile` should be either an extension of `UserProfile` or a new wrapper tied 1:1 to `UserProfile`. Prefer extending `UserProfile` first unless multiple candidate personas become a hard requirement.
- `CandidateEvidence` should be a new table, seeded from `ExperienceBullet`, `Project`, `GithubRepository`, approved `ResumeUpload`, user notes, and approved generated materials.
- `SearchProfile` should extend or alias `JobSearchProfile`, not duplicate it.
- `SearchProfilePerformance` should be new and tied to `JobSearchProfile`.
- `Job` should be implemented as extensions to `JobPosting` plus `JobProfileMatch`, not a duplicate table.
- `JobEvaluation` should be new or an extension of `JobProfileMatch`. New table is cleaner because it supports separate `fitScore`, `opportunityScore`, `confidenceScore`, evidence refs, and multiple agent runs.
- `ResumeProfile`, `ApplicationPacket`, `RecruiterContact`, `RecruiterOutreach`, `ApplicationOutcome`, and `AgentRun` should be new tables.

## Current Docker Setup

Current `docker-compose.yml` includes:

- `postgres`: `postgres:16-alpine`, database `job_search_os`.
- `mcp`: optional profile service built from `Dockerfile.mcp`.

Missing for requested system:

- No app container.
- No pgvector image/extension.
- No Redis.
- No worker container.
- No embeddings worker.

Recommended incremental Docker plan:

1. Replace Postgres image with a pgvector-compatible image, for example `pgvector/pgvector:pg16`, or install extension in a custom Postgres image.
2. Add `redis` only when async queues are introduced.
3. Add `worker` service running a TypeScript worker script with the same env as app.
4. Add app Dockerfile only after local dev behavior is stable.

## Current AI / OpenAI Integration Points

- `src/lib/ai/openai.ts`
  - Wraps OpenAI `responses.parse`.
  - Uses `OPENAI_API_KEY`.
  - Defaults to `OPENAI_MODEL` or `gpt-4.1-mini`.
  - Uses Zod schemas via `zodTextFormat`.
- `src/lib/ai/job.ts`
  - Scores jobs against search profiles with structured output.
  - Falls back to deterministic scoring from `src/lib/job-search/scoring.ts`.
- `src/lib/ai/resume.ts`
  - Tailors resumes.
  - Generates cover letters.
  - Validates generated resumes against source profile data.
  - Has deterministic fallbacks.
- `src/lib/ai/profile-suggestions.ts`
  - Suggests search profiles from candidate profile and GitHub context.
- `src/lib/ai/application-question.ts`
  - Answers application questions using approved profile/project evidence.

These are the right integration points for agents. The agent layer should wrap these functions with typed inputs/outputs and persist `AgentRun`.

## Current Test Setup

- No app-level test runner is configured.
- No `vitest.config.*`, `jest.config.*`, or `playwright.config.*` exists.
- Existing verification relies on:
  - `npx tsc --noEmit`
  - `npm run lint`
  - route smoke tests with `curl`
  - local Playwright assistant scripts for browser automation, not app tests.

Recommended test setup:

- Add Vitest for service/unit tests.
- Add small fixture directory, for example `src/test/fixtures`.
- Keep UI tests minimal at first. Use service tests for evidence rules, scoring, QA, and retrieval filters.

## Where The New Agent System Should Plug In

Use an orchestrated service layer under `src/lib/agents`.

Recommended structure:

```txt
src/lib/agents/
  types.ts
  run-agent.ts
  candidate-intelligence.ts
  search-profile-manager.ts
  job-fit-scorer.ts
  resume-strategy.ts
  application-packet-generator.ts
  application-qa.ts
  outcome-learning.ts
  daily-command-center.ts
```

Supporting services:

```txt
src/lib/evidence/
  ingest.ts
  retrieval.ts
  chunking.ts
  embeddings.ts
  confidence.ts

src/lib/application-packets/
  generate.ts
  qa.ts
  db.ts

src/lib/search-profiles/
  performance.ts
  optimizer.ts
```

Workflow integration points:

- Resume upload approval route: create `CandidateEvidence` from approved resume data.
- GitHub sync route: create or update project/repository evidence.
- Job discovery ingestion: run duplicate/stale detector and job fit scoring after `JobPosting` upsert.
- Job approval route: trigger resume strategy and application packet generation only after approval or explicit request.
- Existing prepare application package route: migrate toward `ApplicationPacket`.
- Dashboard: surface daily command center output and agent warnings.
- Settings/Profile pages: expose evidence and strategy status.

## Proposed Schema Changes

Do not duplicate current concepts unless needed. Add models that fill gaps and add fields to existing models.

New enums:

- `CandidateEvidenceType`
- `CandidateEvidenceSourceType`
- `EvidenceConfidence`
- `SearchProfileStatus`
- `AgentType`
- `AgentRunStatus`
- `RecommendedJobAction`
- `ResumeProfileStatus`
- `ApplicationPacketStatus`
- `RecruiterOutreachStatus`
- `ApplicationOutcomeType`

New models:

- `CandidateEvidence`
  - Relate to `UserProfile`.
  - Store source refs, confidence, usability flags, tags JSON, optional embedding metadata.
- `EvidenceChunk`
  - Relate to `CandidateEvidence`.
  - Store chunk text, metadata, embedding vector once pgvector is enabled.
- `SearchProfilePerformance`
  - Relate to `JobSearchProfile`.
- `JobEvaluation`
  - Relate to `JobPosting`, `JobSearchProfile`, optional `AgentRun`.
  - Store `fitScore`, `opportunityScore`, `confidenceScore`, action, strengths/risks/missing keywords/evidence refs.
- `ResumeProfile`
  - Relate to `User`.
- `ApplicationPacket`
  - Relate to `JobPosting`, `ResumeProfile`, `Application`, optional generated resume/cover letter.
  - Store drafts, evidence refs, QA JSON, status.
- `RecruiterContact`
  - Could either replace or coexist with `Contact`. Prefer new table only if current `Contact` is too generic.
- `RecruiterOutreach`
- `ApplicationOutcome`
- `AgentRun`

Existing model extensions:

- `UserProfile`: add positioning fields if not using separate `CandidateProfile`.
- `JobSearchProfile`: add description, priority, status, healthScore, notes. Keep existing `enabled` for compatibility during migration.
- `JobPosting`: add duplicate group/stale score fields if not modeled elsewhere.
- `JobProfileMatch`: optionally add links to latest `JobEvaluation`.
- `GeneratedResume` / `GeneratedCoverLetter`: add evidence refs only if not superseded by `ApplicationPacket`.

Vector storage:

- Prisma does not natively model `vector` cleanly. Use a SQL migration for `vector` columns and access vector search with `$queryRaw`.
- Keep metadata and confidence in normal Prisma fields.

## Proposed Service Architecture

Principles:

- Deterministic orchestration, typed agent inputs/outputs.
- Agent services do not talk to each other directly.
- Each agent call persists an `AgentRun`.
- Final materials use only verified or approved inferred evidence by default.
- No auto-apply and no auto-send.

Core flow:

1. Domain service gathers typed input.
2. Agent service calls deterministic baseline and optional OpenAI structured output.
3. Output is validated with Zod.
4. `AgentRun` is persisted.
5. Domain service writes recommendations/evaluations/packets.
6. UI displays output for user approval.

RAG service:

- `ingestEvidenceSource(source)` creates evidence and chunks.
- `embedPendingChunks()` runs in worker.
- `retrieveCandidateEvidence(args)` filters by confidence/tags/source first, then vector similarity.
- Retrieval returns evidence refs, snippets, confidence, source refs, and warnings.

Async work:

- Phase 1 can use background fire-and-forget route behavior already present.
- Phase 3 should add a worker process and job table or Redis queue.
- Avoid adding Redis until there is a clear queue abstraction.

## Risks Or Unknowns

- Scope is large. Implement in vertical slices to avoid destabilizing current job search and application flows.
- `UserProfile`, `ExperienceBullet`, and requested `CandidateProfile/CandidateEvidence` overlap. Need a careful migration path rather than parallel truth stores.
- pgvector requires Docker/database migration work and may affect local setup.
- No test runner exists. Add tests before broad agent work to protect truthfulness rules.
- Existing generated resume/cover letter tables do not store explicit evidence refs for every generated section.
- Current scoring is mostly `overallScore`; requested scoring needs separate fit/opportunity/confidence.
- Existing application package flow creates `GeneratedResume`, `GeneratedCoverLetter`, and `Application`; requested `ApplicationPacket` should wrap or gradually replace this.
- Current `Contact` model may be enough for recruiter contacts but lacks relevance score and outreach status.
- Some current company source filtering still admits noisy roles from broad ATS feeds. The new job fit agent should help, but source-level filtering may need iteration.
- Running multiple local Next dev servers can corrupt `.next`; keep one dev server active during implementation.

## First 5 Implementation Steps

1. Add a minimal test setup with Vitest and fixtures for candidate evidence, sample jobs, search profiles, outcomes, and generated drafts.
2. Add `AgentRun` model and typed `src/lib/agents/run-agent.ts` wrapper. Implement a no-op/sample deterministic agent run test.
3. Add `CandidateEvidence` and supporting enums. Backfill evidence from existing verified `ExperienceBullet`, `Project`, `GithubRepository`, and approved `ResumeUpload` data.
4. Add Evidence Library read/review UI and APIs before adding vector search, so evidence approval and usability rules are visible immediately.
5. Add `JobEvaluation` with `fitScore`, `opportunityScore`, and `confidenceScore`, then adapt existing job scoring to write evaluations while preserving current `JobProfileMatch` behavior.

## Phase Plan

### Phase 1: Foundation

- Keep existing app behavior intact.
- Add tests.
- Add `AgentRun`.
- Add typed agent framework.
- Add `CandidateEvidence` without RAG vectors.

### Phase 2: Evidence Library

- Ingest from approved resume/profile/project/GitHub data.
- Add evidence review/edit APIs.
- Add Evidence Library UI.
- Enforce default retrieval to verified and approved inferred evidence.

### Phase 3: Job Evaluation

- Add `JobEvaluation`.
- Implement `JOB_FIT_SCORER` with deterministic fallback plus optional OpenAI structured output.
- Write fit/opportunity/confidence and evidence refs.
- Update job views to show evaluation details.

### Phase 4: Search Profile Optimization

- Add `SearchProfilePerformance`.
- Compute performance metrics from matches/applications/outcomes.
- Implement `SEARCH_PROFILE_MANAGER`.
- Add Search Profile Optimizer UI.

### Phase 5: Application Packets

- Add `ResumeProfile` and `ApplicationPacket`.
- Implement Resume Strategy, Packet Generator, and QA agents.
- Adapt existing generation APIs to use `ApplicationPacket` while continuing to produce PDF/plain-text assets.

### Phase 6: RAG / pgvector

- Switch Docker Postgres to pgvector.
- Add `EvidenceChunk` and embedding worker.
- Implement chunking, embedding storage, and vector retrieval.
- Keep confidence and source filtering mandatory before final generation.

### Phase 7: Recruiter / Outreach / Outcomes

- Add recruiter contact/outreach models.
- Add outcome tracking.
- Implement Outcome Learning and Daily Command Center agents.
- Build analytics and agent review board.

## Stop Point

This document is the requested inspection and implementation plan. No application code changes were made as part of this planning step.
