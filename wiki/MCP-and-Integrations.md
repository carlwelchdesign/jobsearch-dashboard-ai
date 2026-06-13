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

The Chrome extension captures jobs found outside the app and sends them into Job Search OS for review. After a save, it can also launch **Apply Now** for the last saved job from the current active tab URL, which lets the user save a job-description page and then navigate to the real application form before preparing materials and starting the local assistant.

LinkedIn job URLs captured through Chrome are handled as leads, not scraped pages. A capture with company, title, and selected job text continues through normal scoring and approval. A bare `linkedin.com/jobs/view/...` URL is saved as a review-only lead with guidance to paste selected text or use the original employer/ATS link. The app also generates safe open-web original-posting queries from the lead metadata and merges them into Search Query Backlog.

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

If a Chrome-captured job has zero matching profiles, the app treats the save as a search-strategy signal, creates an enabled captured-intent profile, and scores the captured job against that profile immediately. The default profile is `AI-Native Enterprise Product Frontend`, which targets AI-native frontend/product engineering, agentic workflows, analytics-heavy enterprise UI, design systems, and workflow automation work similar to Job Search OS.

Apply Now sends the current tab URL to the local app, updates the saved job's application URL, prepares or reuses the generated resume and cover letter, creates the `ready_to_apply` application, and launches the local assistant. The extension also keeps `Fill from Job Search OS` for already-ready application pages where the current URL can be matched directly.

## GitHub Context

Settings can sync public GitHub repository context into the candidate profile.

Settings can connect LinkedIn in two separate ways when `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` are configured. The identity connection imports basic profile metadata (`openid profile email`) and stores durable profile fields only. The publishing connection uses `LINKEDIN_SHARE_REDIRECT_URI`, requests `openid profile email w_member_social`, stores a separate `LinkedInShareConnection`, and allows approved `/linkedin-content` drafts to publish through Share on LinkedIn. These connections do not provide LinkedIn job-search, saved-job, Apply with LinkedIn, Apply Connect, Job Posting API, scraping, or automated LinkedIn browsing access.

The LinkedIn Content studio is a memory-aware publishing assistant. It uses aggregate app analytics, agent run history, learning-loop context, and redacted Playwright screenshots to create editable posts. Drafts must pass privacy and provenance checks before approval can publish them. Public posts use aggregate analytics only and include a subtle agent-team disclosure.

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
