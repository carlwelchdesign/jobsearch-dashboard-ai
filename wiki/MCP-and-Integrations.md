# MCP and Integrations

## MCP Server

The repo includes a first-class Model Context Protocol server:

```bash
npm run mcp:server
```

The server runs over stdio and shares the same Prisma/Postgres data as the dashboard.

Docker image:

```bash
docker build -f Dockerfile.mcp -t job-search-os-mcp .
docker run -i --rm \
  --env-file .env \
  -e JOB_SEARCH_OS_APP_URL=http://host.docker.internal:3000 \
  job-search-os-mcp
```

Docker Compose:

```bash
docker compose --profile mcp up --build mcp
```

## MCP Tools

Available tools include:

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

The MCP server can prepare packages and update local tracking state. It does not submit applications.

## Chrome Extension

The Chrome extension captures jobs found outside the app and sends them into Job Search OS for review.

It is designed to add applications to the system for agent and user review, not to fill forms.

Package:

```bash
npm run chrome-extension:package
```

The extension can capture:

- role title
- company
- location
- source URL
- page text or job description context

Captured jobs flow through normalization, dedupe, and scoring.

## GitHub Context

Settings can sync public GitHub repository context into the candidate profile.

Uses:

- project evidence
- portfolio matching
- resume profile strategy
- recruiter messages
- job scoring where project relevance matters

Add `GITHUB_TOKEN` only if higher API rate limits are needed.

## Notifications

Supported notification paths include:

- app UI
- email through Resend or Postmark
- Pushover

Notifications are used for blockers, reminders, and agent requests that need user input.

## Local App on Phone

When testing from an iPhone on the same network or hotspot, use the Mac's local network IP plus the app port:

```txt
http://<mac-lan-ip>:3000
```

If the Mac is using the phone as a hotspot, the phone and Mac can still be on the same tethered network, but firewall and hotspot isolation can affect access.
