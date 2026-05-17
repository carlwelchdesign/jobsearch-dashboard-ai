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
- Treat `ApplicationAutomationRun.workflowStateJson` as the UI projection of assistant workflow state; LangGraph checkpointing is the durable graph state layer.
