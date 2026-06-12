# Operations and Configuration

## Navigation Model

The app now emphasizes the active operating surfaces:

- Command Center
- Apply Sprint
- Applications
- Settings

Field Learning now lives under Settings -> Learning. Jobs remains available as admin/exception tooling. `Needs Me` still exists for compatibility and hard blockers, but it is no longer a primary navigation surface.

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

## Source Management

Manage direct company sources from `/sources`. The add-company form writes to the `Company Source List` config and accepts a company name, priority, categories, and optional Greenhouse, Lever, and Ashby slugs. When slugs are blank, generated ATS slug variants are used.

The add job-board form supports JobFront-powered boards. Paste the board URL, for example `https://jobs.frontdoordefense.com/`; the app detects the board name and organization id when possible and stores an enabled `jobfront` source.

Netflix Careers is seeded as an enabled `eightfold` source using `https://explore.jobs.netflix.net/careers` and domain `netflix.com`. Eightfold sources read public career-page job data and do not require provider credentials.

The source roadmap separates implemented connector coverage from enabled runtime sources. Planned sources are not run automatically, and manual sources require human/account workflow until an explicit connector exists.

Optional Brave Search configuration enables the Search Query Backlog source:

```bash
BRAVE_SEARCH_API_KEY=...
SEARCH_QUERY_MAX_RESULTS=160
```

Without `BRAVE_SEARCH_API_KEY`, the search-query adapter returns no jobs and `/sources` reports provider-missing status.

The search-query source carries roadmap coverage for high-friction sources through targeted source/site queries rather than dedicated scrapers. Direct adapters cover Greenhouse, Lever, and Ashby. Brave-backed query coverage includes Workable, SmartRecruiters, iCIMS, Jobvite, BambooHR, Teamtailor, Jobylon, Join, Jobtrain, Bullhorn, Oracle Taleo, SAP SuccessFactors, ZipRecruiter, Dice, Wellfound, Monster, CareerBuilder, SimplyHired, Adzuna, USAJOBS, remote boards, startup boards, VC portfolio boards, Hacker News, and tech boards.

LinkedIn is not scraped directly. Treat LinkedIn as a discovery signal and use the search-query backlog to find original employer, ATS, or career-page postings behind LinkedIn-visible roles when those postings are publicly discoverable.

Existing `Search Query Backlog` configs are merged with new default query templates when seed or `/sources` runs, preserving custom user-added queries while adding newly supported provider coverage.

The search-query adapter suppresses likely list/search result pages before scoring. If a listing page can be expanded into individual job URLs, those jobs continue through normal scoring. If expansion is blocked or no individual jobs are parseable, the listing URL is recorded in `JobSearchRun.progress` with `listingPagesSuppressed` stats and is not saved as an active job.

## Chrome Extension

The Chrome extension uses `POST /api/jobs/capture` for saving job pages and `POST /api/jobs/:id/apply-now` for the saved-job Apply Now flow. Both endpoints honor `BROWSER_EXTENSION_TOKEN` when configured. Apply Now uses the active Chrome tab URL as the final application URL before preparing materials and launching the local assistant.

## Market Intelligence Research

The market intelligence brief runs from the Command Center, `POST /api/market-intelligence/run`, and automatically after successful or partial manual/cron job searches. It fetches trusted source pages, discovers relevant articles, extracts readable content, and stores only metadata, claims, summaries, short excerpts, synthesis, chart data, and search-adaptation audit data in the latest completed `MARKET_INTELLIGENCE` `AgentRun.outputJson`. Automatic search-triggered runs use standard depth and record the source search run in `inputJson.jobSearchRunId`.

Optional configuration:

```bash
MARKET_INTELLIGENCE_EXTRA_SOURCES="https://example.com/research"
MARKET_INTELLIGENCE_MAX_ARTICLES=8
```

`MARKET_INTELLIGENCE_EXTRA_SOURCES` is newline-separated. Keep it limited to trusted research, hiring-lab, labor-market, or role-trend sources. The app does not store full article snapshots.

The Command Center market analysis section is the canonical UI for the brief. Its tabs show the overview, Recharts-powered analytical graphs, cited article/news cards, recommended actions, search-learning audit output, and cron/search health. Trend charts are built from recent completed `MARKET_INTELLIGENCE` runs, so no schema migration is required. The cron endpoint can be configured correctly but still not have run; the reliable signal is a recorded `JobSearchRun` whose `triggeredBy` value is `cron`.

Market Intelligence uses guarded auto-adaptation. It may add unique preferred keywords and preferred companies to existing enabled search profiles, capped at five keyword additions and ten company additions per report. It never removes user settings or automatically changes required keywords, thresholds, exclusions, source state, profile enabled state, or profile deletion. Higher-risk market recommendations become `JOB_SEARCH` improvement proposals for review in Settings.

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
- ADK is opt-in with `ADK_ENABLED=true` and `ADK_MODEL`. Keep `@google/adk` loading behind the server-side adapter/control plane and do not move durable assistant or recruiting-agency workflows to ADK until checkpoint, resume, repair, and browser lifecycle behavior are proven equivalent.
- Treat `ApplicationAutomationRun.workflowStateJson` as the UI projection of assistant workflow state, and `AgentRun.workflowStateJson` as the projection for graph-backed agents such as the recruiting agency. LangGraph checkpointing is the durable graph state layer.
- Treat assistant browser lifecycle events as the source of truth for terminal assistant state: submit confirmation and submit-click-then-close become applied, while close-before-submit becomes `NEEDS_USER` with `assistant_closed`.
- Use the Apply Sprint Assistant run panel before raw logs when debugging local browser runs. It summarizes current phase, recent events, blocker/close reason, next action, PID/log path, and field/upload counts from the existing assistant log endpoint.
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
