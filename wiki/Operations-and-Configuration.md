# Operations and Configuration

## Navigation Model

The app now emphasizes the active operating surfaces:

- Command Center
- Needs Me
- Jobs
- Apply Sprint
- Applications
- Settings

Older supporting pages remain accessible from Settings as admin/supporting tools.

## Settings

Settings includes:

- OpenAI configuration status
- email sync and OAuth status
- notification settings
- scheduled search settings
- application automation policy
- company-level automation overrides
- company source discovery
- GitHub sync and review
- links to supporting admin tools

## Job Search Cron

Scheduled job search runs call:

```txt
/api/cron/job-search
```

Scheduled runs use enabled search profiles where scheduling is enabled.

Set:

```bash
CRON_SECRET=...
```

Then cron requests should send:

```txt
Authorization: Bearer <CRON_SECRET>
```

Local manual run:

```bash
curl -X POST http://localhost:3000/api/jobs/search/run
```

Status endpoint:

```txt
/api/jobs/search/run/status
```

## Market Intelligence Research

The market intelligence brief runs from the Profiles page or `POST /api/market-intelligence/run`. It fetches trusted source pages, discovers relevant articles, extracts readable content, and stores only metadata, claims, summaries, short excerpts, and synthesis in `AgentRun.outputJson`.

Optional configuration:

```bash
MARKET_INTELLIGENCE_EXTRA_SOURCES="https://example.com/research"
MARKET_INTELLIGENCE_MAX_ARTICLES=8
```

`MARKET_INTELLIGENCE_EXTRA_SOURCES` is newline-separated. Keep it limited to trusted research, hiring-lab, labor-market, or role-trend sources. The app does not store full article snapshots.

## Database

Default Docker Postgres URL:

```txt
postgresql://postgres:postgres@localhost:5433/job_search_os?schema=public
```

Common commands:

```bash
npm run db:up
npm run db:down
npm run prisma:migrate
npm run prisma:migrate:deploy
npm run prisma:generate
npm run prisma:seed
```

## RAG Worker

Run embeddings worker:

```bash
npm run worker:embeddings
```

Docker worker:

```bash
docker compose --profile worker up --build worker
```

## Evidence Maintenance

Useful operations:

- backfill candidate evidence
- backfill evidence embeddings
- approve or reject inferred evidence
- edit evidence content
- update usability flags
- sync GitHub context
- keep Job Search OS project evidence current

## Duplicates

Audit duplicates:

```bash
tsx scripts/audit-job-duplicates.ts
```

The app also has duplicate/stale detection endpoints and agents for grouping duplicate jobs.

## Smoke Testing

Run:

```bash
npm run smoke:pages
```

This checks that key app pages render against a running local server.

## Development Notes

- Use existing App Router patterns.
- Use Prisma models and typed services instead of ad hoc persistence.
- Keep generated writing grounded in `CandidateEvidence`.
- Prefer deterministic fallbacks when provider keys are missing.
- Avoid destructive changes without explicit user approval.
- Keep LangGraph and LangChain imports out of generic route/module top levels. Import them lazily inside server-only workflow construction so Next.js RSC bundles for unrelated API routes do not include `@langchain/*`.
- Treat `ApplicationAutomationRun.workflowStateJson` as the UI projection of assistant workflow state, and `AgentRun.workflowStateJson` as the projection for graph-backed agents such as the recruiting agency. LangGraph checkpointing is the durable graph state layer.
- Treat assistant browser lifecycle events as the source of truth for terminal assistant state: submit confirmation and submit-click-then-close become applied, while close-before-submit becomes `NEEDS_USER` with `assistant_closed`.
- Treat application outcomes as canonical across duplicate trackers. When any duplicate tracker reaches a submitted status, archive stale approved/ready duplicates and sync sibling job matches.
- Use `/api/applications/integrity` to audit tracker, match, email, assistant, and resurfaced-job drift; use `POST /api/applications/integrity/repair` or the Dashboard repair control for deterministic repairs with `ApplicationEvent` audit entries.
- Use `AgentRun.graphThreadId`, `AgentRun.currentNode`, and `AgentRun.workflowVersion` for live agent activity and support/debug views.
- Use Agent Board reliability controls for graph-backed run recovery. `Repair` converts stale running runs into explicit failed runs, `Retry` creates child runs through `parentRunId`, and `Cancel` records a manual terminal failure.
- Search completion triggers agency-first automation when eligible 90+ matches exist and no recruiting agency run is active. The handoff appends structured metadata to the search run, links the agency `AgentRun` when available, and starts the agency with `triggeredBy: "search_auto"`. Bulk preparation is limited to approved/generated-material jobs so `needs_review` exceptions cannot skip agency approval.
- LangSmith tracing is opt-in. Configure `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`, optional `LANGSMITH_ENDPOINT`, and optional `LANGSMITH_TRACING_SAMPLING_RATE`.
- Keep LangSmith payloads redacted by default. Do not trace raw resumes, cover letters, prompts, application answers, secrets, screenshots, or browser HTML unless a future privacy review explicitly changes that policy.
- Local quality evaluations do not require LangSmith. Use `POST /api/observability/examples/backfill`, `POST /api/observability/evaluations/run`, `GET /api/observability/evaluations`, `GET /api/observability/outcomes`, `GET /api/observability/outcomes/trends`, `POST /api/observability/outcomes/trends/alerts`, `GET /api/observability/outcomes/trends/triage`, `POST /api/observability/outcomes/recompute`, `POST /api/observability/outcomes/propose-actions`, and `GET /api/observability/learning-impact` to inspect datasets, scores, outcome calibration, trend history, proposed improvements, regression triage, and active learning impact. Outcome calibration refreshes automatically after high-signal job, application, email, and assistant events; manual recompute is for repair/backfill. The outcomes response includes review-only actions plus drill-down details for resurfaced suppressed jobs, duplicate groups, rejected high-score matches, assistant failures, profiles, and sources. Action rows include linked proposal lifecycle metadata when available, the propose-actions endpoint turns current outcome review actions into deduped governed proposals, the trend alerts endpoint turns current regressions into review-only proposals, and the triage endpoint ranks open regression proposals for review.
- The deterministic evaluator currently supports `APPLICATION_ASSISTANT`, `RECRUITING_AGENCY`, `JOB_SEARCH`, and `JOB_MATCHING`. Add an optional `target` body/query value to backfill, evaluate, or inspect one target.
- `AgentImprovementProposal` acceptance is controlled. Low-risk mapped proposals create active `SkillAdjustment` rules consumed by future job-fit scoring, duplicate/stale detection, search profile review, application QA, and agency approval runs. Outcome calibration is actionable from Settings and detects applied-to-callback quality, rejected high-score matches, active duplicate groups, resurfaced suppressed jobs, and assistant failures; review actions recommend where to inspect noisy sources, profiles, duplicates, suppressions, or assistant runs without changing behavior, and they can be manually promoted into deduped proposals. Promoted actions remain visible with open, accepted, or dismissed lifecycle labels until the underlying outcome signal clears. `OutcomeCalibrationSnapshot` stores aggregate scorecard history only, so trend views can show whether callback rate, workflow scores, duplicate noise, resurfacing, high-score rejections, or assistant failures are improving without retaining sensitive application content. Regressing trends can be manually promoted into proposals labeled `outcome regression`; open regression proposals are prioritized as high, medium, or low and routed to the relevant review surface, but they remain review-only and do not apply changes automatically. Background refresh is best-effort and fail-open, so it must never block user-facing writes. Learning impact is also actionable from Settings: disabling a rule or running manual-triggered auto rollback marks it `REJECTED`, records rollback metadata in `patchJson`, excludes it from future skill runs, and captures a redacted `ROLLBACK` quality example. Settings rollback history shows disabled source, reason, impact snapshot, matching rollback examples, and follow-up proposal status. Auto rollback requires strong negative impact signals and is not scheduled in this phase. Repeated rollback examples can create review-only proposals, but they do not auto-activate replacement learning. High-risk, unmapped, prompt, scoring-policy, search-source, and workflow proposals remain review-only and do not rewrite prompts, code, or workflow policy automatically.
