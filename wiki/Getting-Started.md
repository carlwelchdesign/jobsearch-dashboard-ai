# Getting Started

## Local App

Install dependencies:

```bash
npm install
```

Start the database:

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

Open:

```txt
http://localhost:3000
```

## Full Docker Stack

Run the full local stack:

```bash
docker compose --profile full up --build
```

This starts:

- Next.js app on `http://localhost:3000`
- Postgres with pgvector
- Redis
- worker process
- embeddings worker

On a new Docker database, seed once:

```bash
docker compose --profile full exec app npm run prisma:seed
```

## Core Environment Variables

The app works without OpenAI by using deterministic fallbacks, but AI-backed parsing, scoring, and writing require:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Recommended local notification/email variables:

```bash
RESEND_API_KEY=...
POSTMARK_SERVER_TOKEN=...
NOTIFICATION_FROM_EMAIL="Job Search OS <jobs@example.com>"
PUSHOVER_USER_KEY=...
PUSHOVER_APP_TOKEN=...
```

Optional Slack Agent Ops variables:

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_OPS_CHANNEL_ID=C...
SLACK_APPROVALS_CHANNEL_ID=C...
SLACK_ALLOWED_USER_IDS=U...
SLACK_COACH_USER_IDS=U...
```

Slack Agent Ops uses Socket Mode. After installing or reinstalling the app from `config/slack-app-manifest.example.yml`, run `npm run slack:dev`. The Home tab shows the Job Search OS command center, and `/jso help` lists status, approvals, briefings, opportunity rooms, coach summary, and confirmation-gated internal run commands.

Run the Slack worker beside the app when you want Slack updates, `/jso status`, daily briefings, threaded opportunity rooms, and approval buttons:

```bash
npm run slack:dev
```

Optional IMAP sync:

```bash
JOB_EMAIL_IMAP_HOST=imap.example.com
JOB_EMAIL_IMAP_USER=you@example.com
JOB_EMAIL_IMAP_PASSWORD=app-password
EMAIL_SYNC_SECRET=local-secret
```

Optional Gmail OAuth:

```bash
GMAIL_OAUTH_CLIENT_ID=...
GMAIL_OAUTH_CLIENT_SECRET=...
GMAIL_OAUTH_REDIRECT_URI=http://localhost:3000/api/email/oauth/gmail/callback
```

Optional Outlook OAuth:

```bash
OUTLOOK_OAUTH_CLIENT_ID=...
OUTLOOK_OAUTH_CLIENT_SECRET=...
OUTLOOK_OAUTH_REDIRECT_URI=http://localhost:3000/api/email/oauth/outlook/callback
```

## Validation

Run type checking:

```bash
npx tsc --noEmit
```

Run lint:

```bash
npm run lint
```

Run tests:

```bash
npm test
```

Smoke test main UI pages:

```bash
npm run smoke:pages
```

## Main User Flow

1. Configure settings, search profiles, source lists, provider keys, and automation policy.
2. Ingest or review candidate evidence.
3. Run a job search from the Command Center or cron.
4. Review scored jobs in Jobs.
5. Approve jobs worth pursuing.
6. Generate or review application packets.
7. Launch Apply Sprint only for approved applications.
8. Complete any ordinary unknown fields once while the assistant observes and learns.
9. Track outcomes and let agents recommend improvements.
