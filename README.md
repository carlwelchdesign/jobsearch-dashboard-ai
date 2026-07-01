# Job Search OS

Personal agentic job-search operating system for reviewing opportunities, maintaining search profiles, generating truthful application materials, and keeping the final application decision under human control.

<img width="1407" height="1278" alt="Job Search OS dashboard screenshot" src="https://github.com/user-attachments/assets/8f9f935a-3409-4e11-b75d-eb292ef999ea" />

## What This Is

Job Search OS is a protected single-user production app. It combines job discovery, evidence-backed resume and cover-letter generation, application tracking, local browser assistance, email outcome monitoring, Slack operations, and agent quality loops into one local-first workflow.

The app is built around a conservative operating model:

- LinkedIn is treated as a lead, analytics, and public-content channel, not a scrape or auto-apply source.
- Application submission, employer contact, email sending, calendar writes, and unreviewed LinkedIn publishing stay manual or explicitly approval-gated.
- Jolene and the skill system classify actions as `read_only`, `proposal`, `safe_internal`, `guarded_mutation`, or `external_blocked`.
- Deployed cron and sync endpoints must be protected with bearer secrets.
- `/api/system/health` reports database readiness, stale work, required secrets, provider configuration, and worker readiness.

The canonical product roadmap and audit package lives in [`plans/FIRST_CLASS_AGENTIC_JOB_SEARCH_OS_AUDIT_ROADMAP_PLAN.md`](./plans/FIRST_CLASS_AGENTIC_JOB_SEARCH_OS_AUDIT_ROADMAP_PLAN.md).

## Quick Start

Install dependencies:

```bash
npm install
```

Start the local database, run migrations and seed data, then launch the app:

```bash
npm run dev:local
```

Open:

```txt
http://localhost:3000
```

`DATABASE_URL` comes from `.env`. The checked-in example points at Docker Postgres on `localhost:5433`; keep `.env` pointed at any existing populated local database you already use.

For manual setup, Docker profiles, and environment variables, see [`wiki/Getting-Started.md`](./wiki/Getting-Started.md).

## Verification

Run the standard local checks:

```bash
npm test
```

```bash
npm run lint
```

```bash
npx tsc --noEmit --pretty false
```

```bash
npm run build
```

Smoke and browser acceptance checks require a running app:

```bash
npm run smoke:pages
```

```bash
npm run test:e2e
```

## Core Capabilities

- **Job discovery and scoring** - searches direct ATS/company sources, broad open-web sources, and review-only lead channels, then dedupes and scores matches against enabled profiles.
- **Apply Workspace** - the canonical review surface for tracked applications, packet readiness, direct application links, blockers, materials, answers, fit, research, history, and job details.
- **Resume and cover-letter generation** - creates ATS-readable, evidence-backed materials with material-quality checks and export endpoints for manual review.
- **Jolene Chief of Staff** - provides in-app operational help, app-state answers, delegated internal proposals, career sprint briefs, and confirmation-gated repair actions.
- **Email Ops** - classifies job-response mail, matches messages to applications, extracts outcomes or interview signals, and routes ambiguous work for approval.
- **LinkedIn content and analytics** - drafts public-safe build-in-public posts, supports approved publishing when connected, and tracks aggregate post analytics.
- **Agent quality and observability** - records agent runs, examples, evaluations, improvement proposals, learning impact, and review gates before expanding automation.
- **MCP and integrations** - exposes local tools through an MCP server and supports Chrome capture, GitHub context, notifications, Slack operations, and provider-backed AI.

## Documentation Map

| Intent | Start here |
| --- | --- |
| I want to run the app | [`wiki/Getting-Started.md`](./wiki/Getting-Started.md) |
| I want to understand the product | [`wiki/Home.md`](./wiki/Home.md) and [`docs/USER_GUIDE.md`](./docs/USER_GUIDE.md) |
| I want to configure integrations | [`wiki/MCP-and-Integrations.md`](./wiki/MCP-and-Integrations.md) and [`wiki/Operations-and-Configuration.md`](./wiki/Operations-and-Configuration.md) |
| I want to understand agents/workflows | [`wiki/Agents-and-Workflows.md`](./wiki/Agents-and-Workflows.md) and [`wiki/Command-Center-and-Jolene.md`](./wiki/Command-Center-and-Jolene.md) |
| I want to operate or debug it | [`wiki/Operations-and-Configuration.md`](./wiki/Operations-and-Configuration.md) |
| I want the full user guide | [`docs/USER_GUIDE.md`](./docs/USER_GUIDE.md) |

## Main Surfaces

- `/dashboard` - Today cockpit for search, review, apply, follow-up, blockers, and operating brief.
- `/jobs` - exception and review queue for discovered jobs.
- `/applications` and `/applications/[id]` - application tracking and Apply Workspace.
- `/resumes` and `/resumes/profile` - resume sources, profiles, variants, uploads, and generated materials.
- `/evidence` - candidate evidence and LinkedIn recommendation import.
- `/sources` - source management, company targets, broad query coverage, and supported boards.
- `/agents` - agent quality gates and reliability controls.
- `/settings` - providers, notifications, automation policy, profile links, learning, and system configuration.
- `/linkedin-content` - prompt-first LinkedIn content studio.
- `/architecture` - generated system architecture report.

## Operating Boundaries

The system can prepare, explain, score, draft, repair, and route work. It does not silently submit applications, bypass CAPTCHA, scrape LinkedIn jobs, publish LinkedIn posts, send email, contact employers, or mutate external calendars.

Local browser automation is assistive only: it fills safe fields, uploads prepared materials when visible, learns from manual edits, and stops before final submit. For details, see [`wiki/Application-Automation.md`](./wiki/Application-Automation.md).

Generated materials must stay grounded in approved evidence. Resume, cover-letter, packet, and material-claim behavior is documented in [`wiki/Evidence-RAG-and-Materials.md`](./wiki/Evidence-RAG-and-Materials.md).

## Stack

- Next.js App Router and React
- TypeScript
- Prisma with PostgreSQL and pgvector
- MUI and Emotion
- Vitest, Playwright, and ESLint
- OpenAI structured outputs with deterministic fallbacks
- LangGraph, LangSmith-compatible observability, ADK opt-in control-plane support
- Slack Bolt, MCP SDK, IMAP/OAuth email sync, Chrome extension support

## License

This project is licensed under `AGPL-3.0-only`. See [LICENSE](./LICENSE).
