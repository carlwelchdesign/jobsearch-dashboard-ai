# Job Search OS

Personal AI-powered job search dashboard for reviewing jobs, maintaining search profiles, parsing resumes, and generating truthful ATS-friendly application materials.

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

That starts Postgres with pgvector, Redis, the Next.js app on `http://localhost:3000`, and an embeddings worker. To run only the containerized app without the worker:

```bash
docker compose --profile app up --build app
```

To run only the embeddings worker:

```bash
docker compose --profile worker up --build worker
```

## Optional Providers

The app works without external service keys by using deterministic local fallbacks. Add these when you want provider-backed behavior:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
RESEND_API_KEY=...
# or
POSTMARK_SERVER_TOKEN=...
NOTIFICATION_FROM_EMAIL="Job Search OS <jobs@example.com>"
PUSHOVER_USER_KEY=...
PUSHOVER_APP_TOKEN=...
```

With `OPENAI_API_KEY`, resume parsing, job scoring, and resume tailoring use OpenAI structured outputs. Without it, those flows still run through deterministic parsers/scorers so the dashboard remains usable.

Set your GitHub profile URL in `/settings` and click `Sync GitHub context` to pull public repository context into the candidate profile. Public repos are used as project context in tailored resumes and cover letters when relevant. Add `GITHUB_TOKEN` only if you need higher GitHub API rate limits.

The manual search run uses enabled external source adapters. Direct ATS sources are prioritized: Greenhouse, Lever, and Ashby. RemoteOK is disabled by default because it creates paid/login application friction, and We Work Remotely is disabled by default because it is an intermediary board rather than a final ATS form. ATS adapters use configured company slugs so the app can search target companies directly, for example:

```json
{ "companySlugs": ["linear", "vercel"] }
```

The seeded `Company Source List` is a curated target list, not a claim that every company is hiring today. Search runs probe likely company careers/ATS feeds from that list, filter for role families such as React, TypeScript, Next.js, design systems, security/identity, AI tooling, developer platforms, defense tech, geospatial, and enterprise dashboards, then score the resulting roles against enabled profiles.

Scheduled job search runs are configured in `vercel.json` and call `/api/cron/job-search` daily at `14:00 UTC`. Scheduled runs only use enabled profiles where scheduling is enabled. Set `CRON_SECRET` in the deployment environment to require `Authorization: Bearer <CRON_SECRET>` on cron requests.

## Local Playwright Application Assistant

The app does not submit applications automatically. For jobs marked `ready_to_apply`, you can run a local browser assistant that fills safe known fields, uploads the generated resume and cover letter when matching inputs are visible, then stops before submit.

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
- highlight likely submit buttons and wait for your manual review

The assistant will not:

- click submit
- bypass CAPTCHA or human verification
- use stealth browser settings
- rotate proxies
- answer sensitive demographic questions automatically

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
