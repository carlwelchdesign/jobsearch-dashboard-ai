# Agentic Job Search Assistant

Personal Agentic AI-powered job search dashboard for reviewing jobs, maintaining search profiles, parsing resumes, and generating truthful ATS-friendly application materials.

## Local Setup

Install dependencies:

```bash
npm install
```

Start the Docker PostgreSQL database:

```bash
npm run db:up
```

Run migrations and seed data:

```bash
npm run prisma:migrate
npm run prisma:seed
```

Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

Run the full local Docker stack instead:

```bash
docker compose --profile full up --build
```

That starts Postgres with pgvector, Redis, the Next.js app on `http://localhost:3000`, runs deployed migrations in the app and worker containers, and starts an embeddings worker. On a brand-new Docker database, seed the app once from another terminal:

```bash
docker compose --profile full exec app npm run prisma:seed
```

To run only the containerized app without the worker:

```bash
docker compose --profile app up --build app
```

To run only the embeddings worker:

```bash
docker compose --profile worker up --build worker
```

Smoke test the main UI pages against a running local or Docker app:

```bash
npm run smoke:pages
# or
SMOKE_BASE_URL=http://localhost:3000 npm run smoke:pages
```

## Optional Providers

The app works without external service keys by using deterministic local fallbacks. Add these when you want provider-backed behavior:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
LANGSMITH_TRACING=false
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=job-search-os-local
RESEND_API_KEY=...
# or
POSTMARK_SERVER_TOKEN=...
NOTIFICATION_FROM_EMAIL="Job Search OS <jobs@example.com>"
PUSHOVER_USER_KEY=...
PUSHOVER_APP_TOKEN=...
```

With `OPENAI_API_KEY`, resume parsing, job scoring, and resume tailoring use OpenAI structured outputs. Without it, those flows still run through deterministic parsers/scorers so the dashboard remains usable.

With `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY`, the app emits redacted metadata traces for agent runs, OpenAI helper calls, the application assistant workflow, and graph-backed recruiting agency runs. Tracing is optional and fail-open: if LangSmith is unavailable, the app continues without tracing. The default trace payload masks resume text, cover letters, raw application answers, prompts, secrets, emails, phone numbers, and full field values while preserving useful debugging metadata such as workflow step, field label, field type, command type, result, status, model, and counts.

The app also keeps a local LangSmith-style quality loop. Assistant failures, browser-close repairs, manual submit corrections, recruiting agency candidate failures, noisy search runs, rejected high-score matches, outcome calibration signals, and explicit mistake reports become redacted `AgentQualityExample` records. `/api/observability/evaluations/run` scores supported targets and creates `AgentImprovementProposal` records. Accepting a low-risk mapped proposal activates conservative `SkillAdjustment` rules that future agent runs consume in bounded ways: job-fit scoring becomes more cautious after rejected high-score matches, duplicate/stale detection tightens resurfacing checks, search profile review flags low-yield profiles, application QA adds cover-letter and field-classification review warnings, and agency approval requires cleaner candidates after candidate-quality failures. Settings also shows outcome calibration across real applications, callbacks, rejections, duplicate groups, resurfaced suppressed jobs, and assistant failures, with drill-down rows for the jobs, profiles, sources, duplicate groups, and automation runs behind each signal. Outcome calibration now adds review-only actions such as reviewing noisy sources, tightening profiles, resolving duplicate groups, repairing resurfaced suppressions, and inspecting assistant failures; these actions link to the relevant manual surface, show whether they are advisory/open/accepted/dismissed in the proposal lifecycle, and can be promoted into governed improvement proposals with `POST /api/observability/outcomes/propose-actions` without applying changes automatically. Outcome signals refresh automatically after job rejection/archive changes, application outcomes, email-derived outcomes, and assistant terminal states; the manual recompute endpoint remains a repair/backfill action. Manual recompute and throttled automatic refreshes also write aggregate `OutcomeCalibrationSnapshot` rows so Settings and `GET /api/observability/outcomes/trends` can show whether callback rate, duplicate noise, resurfacing, high-score rejections, assistant failures, and workflow scores are improving or regressing. Regressing trends can be manually promoted into review-only proposals with `POST /api/observability/outcomes/trends/alerts`, and `GET /api/observability/outcomes/trends/triage` ranks open regression proposals by priority with owner area, reason, and review route. Settings also shows learning impact by comparing active rules with later agent runs and quality evaluations. Active learned rules can be disabled manually or through manual-triggered auto rollback when repeated negative impact crosses conservative thresholds; both paths mark the adjustment `REJECTED`, remove it from future skill runs, and capture a redacted rollback quality example so repeated bad learned rules can become review-only improvement proposals. Settings also includes rollback history with the disabled source, reason, impact snapshot, rollback example count, and follow-up proposal status. High-risk, unmapped, prompt, search-source, scoring-policy, and workflow changes remain review-only and never rewrite behavior automatically. Deterministic evaluators currently cover the application assistant, recruiting agency, job search, and job matching; the schema also supports generated materials, GitHub review, outreach, outcome learning, and command center recommendations.

Set your GitHub profile URL in `/settings` and click `Sync GitHub context` to pull public repository context into the candidate profile. Public repos are used as project context in tailored resumes and cover letters when relevant. Add `GITHUB_TOKEN` only if you need higher GitHub API rate limits.

## Job Response Email Sync

Inbound job-response email can be synced from a local IMAP mailbox:

```bash
JOB_EMAIL_IMAP_HOST=imap.example.com
JOB_EMAIL_IMAP_USER=you@example.com
JOB_EMAIL_IMAP_PASSWORD=app-password
EMAIL_SYNC_SECRET=local-secret
```

Then run:

```bash
curl -X POST http://localhost:3000/api/email/imap-sync \
  -H "Authorization: Bearer local-secret" \
  -H "content-type: application/json" \
  -d '{"limit":25,"sinceDays":14}'
```

Synced messages are classified as rejection, interview request, assessment, offer, confirmation, or needs review. Matched messages update application outcomes, create `Needs Me` items when action is required, and trigger interview prep for interview/assessment messages.

An hourly email sync cron is configured in `vercel.json` and calls `/api/cron/email-sync` at the top of every hour. It checks connected Gmail OAuth accounts and any configured IMAP mailbox. Set `EMAIL_SYNC_SECRET` or `CRON_SECRET` to require `Authorization: Bearer <secret>` on cron requests.

The manual search run uses enabled external source adapters. Direct ATS sources are prioritized: Greenhouse, Lever, and Ashby. RemoteOK is disabled by default because it creates paid/login application friction, and We Work Remotely is disabled by default because it is an intermediary board rather than a final ATS form. ATS adapters use configured company slugs so the app can search target companies directly, for example:

```json
{ "companySlugs": ["linear", "vercel"] }
```

The seeded `Company Source List` is a curated target list, not a claim that every company is hiring today. Search runs probe likely company careers/ATS feeds from that list, filter for role families such as React, TypeScript, Next.js, design systems, security/identity, AI tooling, developer platforms, defense tech, geospatial, and enterprise dashboards, then score the resulting roles against enabled profiles.

Scheduled job search runs are configured in `vercel.json` and call `/api/cron/job-search` daily at `14:00 UTC`. Scheduled runs only use enabled profiles where scheduling is enabled. Set `CRON_SECRET` in the deployment environment to require `Authorization: Bearer <CRON_SECRET>` on cron requests.

## Local Playwright Application Assistant

The app does not submit applications automatically. For jobs marked `ready_to_apply`, you can run a local browser assistant that fills safe known fields, uploads the generated resume and cover letter when matching inputs are visible, then stops before submit.

The assistant is orchestrated by a LangGraph-backed workflow plus a local Playwright browser runner:

- LangGraph validates the application package, launches the browser runner, stores workflow checkpoints, and records workflow state on `ApplicationAutomationRun`.
- The Playwright runner is still the only component that controls the browser. It performs the broad safe autofill pass, reports detected fields, executes workflow commands, observes manual input, and watches for submit confirmation.
- Workflow state is persisted in Postgres through LangGraph checkpointing and in `workflowStateJson` for app UI visibility.
- Optional LangSmith observability stores redacted workflow traces and trace metadata on `ApplicationAutomationRun.observabilityJson`.
- Assistant failures and repairs are captured as redacted quality examples, evaluated locally, and surfaced as improvement proposals on Settings. Safe accepted proposals become low-risk QA/guidance adjustments that application QA consumes; browser lifecycle and submit-state workflow changes remain review-only.
- The graph does not click final submit in the current phase. It stops at manual review and can resume after Needs Me answers for unknown fields.
- LangGraph imports are loaded lazily inside server-only workflow construction so ordinary Next.js route bundles do not pull `@langchain/*` into unrelated RSC chunks.

Install local browser automation dependencies:

```bash
npm run assistant:install
```

Prepare an application package in the app, then click `Launch assistant` on `/applications` or the job detail page. The CLI command remains available for debugging:

```bash
npm run assistant:apply -- <application-id>
```

The assistant will:

- open the job application URL in a local Chromium window
- fill safe fields such as name, email, phone, location, LinkedIn, GitHub, and portfolio
- upload the generated resume PDF and cover letter text file when matching upload controls exist
- prepare selected application-question answers as a local text file when you have chosen an answer option in the packet review page
- report meaningful workflow activity, detected fields, pending commands, blockers, and ready-to-submit state back to Apply Sprint
- create Needs Me requests when a required or custom field cannot be safely answered

Quality loop endpoints:

```bash
curl -X POST http://localhost:3000/api/observability/examples/backfill
curl -X POST http://localhost:3000/api/observability/evaluations/run
curl http://localhost:3000/api/observability/evaluations
curl http://localhost:3000/api/observability/outcomes
curl -X POST http://localhost:3000/api/observability/outcomes/recompute
curl -X POST http://localhost:3000/api/observability/outcomes/recompute \
  -H "content-type: application/json" \
  -d '{"source":"settings_manual"}'
curl http://localhost:3000/api/observability/learning-impact
curl -X POST http://localhost:3000/api/observability/learning-impact/auto-rollback \
  -H "content-type: application/json" \
  -d '{"dryRun":true}'
curl -X POST http://localhost:3000/api/skills/adjustments/{adjustmentId}/reject
```

Use an optional `target` body or query value to focus on one evaluator, for example:

```bash
curl -X POST http://localhost:3000/api/observability/examples/backfill \
  -H "content-type: application/json" \
  -d '{"target":"JOB_MATCHING"}'
curl -X POST http://localhost:3000/api/observability/evaluations/run \
  -H "content-type: application/json" \
  -d '{"target":"RECRUITING_AGENCY"}'
curl "http://localhost:3000/api/observability/evaluations?target=JOB_SEARCH"
```
- learn from approved/manual field answers through application field memory with sensitivity and reuse policies
- highlight likely submit buttons and wait for your manual review

The assistant will not:

- click submit
- bypass CAPTCHA or human verification
- use stealth browser settings
- rotate proxies
- answer sensitive demographic questions automatically

During autofill testing, Apply Sprint includes a reset control for the selected application. It clears assistant automation runs and open assistant blockers, stops any tracked local runner process, and lets you relaunch without rejecting the job or deleting learned memories.

## Recruiting Agency Workflow

The recruiting agency now runs as a LangGraph-backed workflow while preserving the existing API contract for `/api/applications/agency/run` and `/api/applications/agency/run/status`.

- The graph moves through policy load, candidate discovery, candidate evaluation, approval, packet preparation, result recording, and run finalization.
- `AgentRun` stores `graphThreadId`, `currentNode`, `workflowVersion`, and `workflowStateJson` so the UI and logs can show meaningful live activity.
- The workflow still uses the existing suppression, duplicate, and application checks before preparing packets.
- Candidate-level failures are captured as recruiting-agency quality examples for review and later evaluation.
- LangGraph and LangChain imports stay lazy and server-only to avoid Next.js RSC bundling failures.

Graph-backed agent runs also have explicit reliability controls on the Agent Review Board:

- `Repair` marks stale running graph runs as failed with a clear `stale_graph_run` node so they can be retried safely.
- `Retry` creates a new child `AgentRun` with `parentRunId` pointing to the failed or stale source run.
- `Cancel` marks a pending/running graph run failed with a `manual_cancel` node and records an event.
- Reliability actions create redacted quality examples so repeated stale, cancelled, or retry-needed runs can be reviewed later.
- Accepted quality proposals activate low-risk skill guidance for known categories such as rejected high-score matches, weak dedupe, low-yield searches, agency candidate quality, cover-letter fields, and field classification. These rules affect only bounded future agent behavior and are reported in outputs or run events; Settings, `/api/observability/outcomes`, `/api/observability/outcomes/trends`, `/api/observability/outcomes/trends/alerts`, `/api/observability/outcomes/trends/triage`, `/api/observability/outcomes/propose-actions`, and `/api/observability/learning-impact` show whether real outcomes and active rules appear healthy, noisy, needing review, improving, regressing, prioritized for review, or still lacking data. If a rule is wrong or questionable, disable it from Settings, use `POST /api/skills/adjustments/{adjustmentId}/reject`, or run manual-triggered auto rollback with `POST /api/observability/learning-impact/auto-rollback`; rejected rules are ignored by future skill runs while remaining in the rollback history, and active proposal-backed rollbacks create `ROLLBACK` quality examples for later review-only proposals. Reliability and workflow proposals are accepted as review intent unless a safe skill-guidance mapping exists.

Application-question workflow:

1. Open `Apply Sprint`.
2. Select the ready application.
3. Paste a written employer prompt into `Application question helper`.
4. Generate grounded answer options.
5. Open the application packet, review the saved options, and click `Use this` on the answer you want.
6. Launch the assistant.

Selected answers are added to `assistant-package.json` and written next to the generated resume and cover letter as:

```txt
<Candidate> - <Company> - <Role> - Application Answers.txt
```

The assistant still leaves custom question fields untouched. Copy selected answers manually during the final browser review.

Some job boards require Google OAuth, human verification, or paid apply flows. Those sources are disabled by default or treated as manual-only: the assistant opens the job in your normal browser and reveals the prepared materials folder instead of trying to automate the login.

## MCP Server

The repo includes a first-class MCP server for agents and Docker-based MCP clients. It exposes the Job Search OS as tools over stdio while sharing the same Prisma/Postgres data as the dashboard.

Local stdio run:

```bash
npm run mcp:server
```

Docker image:

```bash
docker build -f Dockerfile.mcp -t job-search-os-mcp .
docker run -i --rm \
  --env-file .env \
  -e JOB_SEARCH_OS_APP_URL=http://host.docker.internal:3000 \
  job-search-os-mcp
```

Docker Compose profile:

```bash
docker compose --profile mcp up --build mcp
```

Available MCP tools:

- `get_dashboard_summary`
- `run_job_search`
- `get_search_run`
- `list_review_queue`
- `list_jobs`
- `get_job_detail`
- `set_job_match_status`
- `prepare_application_package`
- `bulk_prepare_application_packages`
- `list_applications`
- `update_application_status`
- `sync_github_context`
- `get_candidate_profile`

The MCP server can prepare application packages and update tracking state, but it does not submit applications.

## Database

The app uses Docker Postgres by default:

```txt
postgresql://postgres:postgres@localhost:5433/job_search_os?schema=public
```

Docker maps host port `5433` to container port `5432` so it does not conflict with a local Postgres service already running on `5432`.

Useful commands:

```bash
npm run db:up
npm run db:logs
npm run db:down
npm run db:reset
npm run smoke:pages
```

## Evidence Worker

Evidence embeddings can be generated from the dashboard with `Embed evidence`, or by running the worker:

```bash
npm run worker:embeddings
```

Worker environment knobs:

```txt
EMBEDDINGS_WORKER_INTERVAL_MS=600000
EMBEDDINGS_WORKER_BATCH_SIZE=50
EMBEDDINGS_WORKER_BACKFILL_EVIDENCE=false
```

The worker never generates application materials or submits applications. It only syncs evidence chunks and embeddings for retrieval.
