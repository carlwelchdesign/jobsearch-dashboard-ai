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
- Use `AgentRun.graphThreadId`, `AgentRun.currentNode`, and `AgentRun.workflowVersion` for live agent activity and support/debug views.
- Use Agent Board reliability controls for graph-backed run recovery. `Repair` converts stale running runs into explicit failed runs, `Retry` creates child runs through `parentRunId`, and `Cancel` records a manual terminal failure.
- LangSmith tracing is opt-in. Configure `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`, optional `LANGSMITH_ENDPOINT`, and optional `LANGSMITH_TRACING_SAMPLING_RATE`.
- Keep LangSmith payloads redacted by default. Do not trace raw resumes, cover letters, prompts, application answers, secrets, screenshots, or browser HTML unless a future privacy review explicitly changes that policy.
- Local quality evaluations do not require LangSmith. Use `POST /api/observability/examples/backfill`, `POST /api/observability/evaluations/run`, `GET /api/observability/evaluations`, `GET /api/observability/outcomes`, `POST /api/observability/outcomes/recompute`, and `GET /api/observability/learning-impact` to inspect datasets, scores, outcome calibration, proposed improvements, and active learning impact. Outcome calibration refreshes automatically after high-signal job, application, email, and assistant events; manual recompute is for repair/backfill. The outcomes response includes drill-down details for resurfaced suppressed jobs, duplicate groups, rejected high-score matches, assistant failures, profiles, and sources.
- The deterministic evaluator currently supports `APPLICATION_ASSISTANT`, `RECRUITING_AGENCY`, `JOB_SEARCH`, and `JOB_MATCHING`. Add an optional `target` body/query value to backfill, evaluate, or inspect one target.
- `AgentImprovementProposal` acceptance is controlled. Low-risk mapped proposals create active `SkillAdjustment` rules consumed by future job-fit scoring, duplicate/stale detection, search profile review, application QA, and agency approval runs. Outcome calibration is actionable from Settings and detects applied-to-callback quality, rejected high-score matches, active duplicate groups, resurfaced suppressed jobs, and assistant failures; drill-down rows explain which records caused each signal without changing behavior. Background refresh is best-effort and fail-open, so it must never block user-facing writes. Learning impact is also actionable from Settings: disabling a rule or running manual-triggered auto rollback marks it `REJECTED`, records rollback metadata in `patchJson`, excludes it from future skill runs, and captures a redacted `ROLLBACK` quality example. Settings rollback history shows disabled source, reason, impact snapshot, matching rollback examples, and follow-up proposal status. Auto rollback requires strong negative impact signals and is not scheduled in this phase. Repeated rollback examples can create review-only proposals, but they do not auto-activate replacement learning. High-risk, unmapped, prompt, scoring-policy, search-source, and workflow proposals remain review-only and do not rewrite prompts, code, or workflow policy automatically.
