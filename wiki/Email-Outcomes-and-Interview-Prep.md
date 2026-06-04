# Email, Outcomes, and Interview Prep

## Email Sync

The app can ingest job-response emails and connect them to applications.

Supported paths:

- IMAP sync
- Gmail OAuth foundation
- Outlook OAuth foundation
- manual message ingestion

## IMAP

Configure:

```bash
JOB_EMAIL_IMAP_HOST=imap.example.com
JOB_EMAIL_IMAP_USER=you@example.com
JOB_EMAIL_IMAP_PASSWORD=app-password
EMAIL_SYNC_SECRET=local-secret
```

Run:

```bash
curl -X POST http://localhost:3000/api/email/imap-sync \
  -H "Authorization: Bearer local-secret" \
  -H "content-type: application/json" \
  -d '{"limit":25,"sinceDays":14}'
```

## Hourly Email Cron

The deployment cron calls the shared email sync endpoint every hour:

```txt
/api/cron/email-sync
```

The endpoint checks:

- connected Gmail OAuth accounts
- configured IMAP mailbox credentials

Set `EMAIL_SYNC_SECRET` or `CRON_SECRET` to require:

```txt
Authorization: Bearer <secret>
```

## Gmail and Outlook OAuth

OAuth connections are configured from Settings. Required variables:

```bash
GMAIL_OAUTH_CLIENT_ID=...
GMAIL_OAUTH_CLIENT_SECRET=...
GMAIL_OAUTH_REDIRECT_URI=http://localhost:3000/api/email/oauth/gmail/callback
```

```bash
OUTLOOK_OAUTH_CLIENT_ID=...
OUTLOOK_OAUTH_CLIENT_SECRET=...
OUTLOOK_OAUTH_REDIRECT_URI=http://localhost:3000/api/email/oauth/outlook/callback
```

Google test apps must include the user email as an approved tester until verification is complete.

## Email Classification

Synced messages can be classified as:

- rejection
- recruiter response
- interview request
- coding assessment
- take-home
- scheduling request
- offer
- automated confirmation
- no action
- unrelated
- needs review

Matched messages update application outcomes or create Needs Me items when the agent cannot safely decide.

## Outcomes

Outcomes are tracked through `ApplicationOutcome`.

Examples:

- applied
- rejected
- ghosted
- recruiter screen
- tech screen
- onsite
- final
- offer
- closed

Outcome data powers strategy recommendations.

Outcome calibration also feeds the quality loop. Settings and `GET /api/observability/outcomes` summarize applied-to-callback rate, rejected high-score matches, active duplicate groups, resurfaced rejected/applied jobs, and assistant failures, then show review-only actions and drill-down rows for the records behind those signals. Signals refresh automatically when outcomes are recorded from the UI or email response agent. `POST /api/observability/outcomes/recompute` captures missing redacted quality examples as a repair/backfill action so repeated bad outcome patterns can be evaluated and proposed for review without rewriting agent behavior directly.

## Outcome Learning

The Outcome Learning agent looks for patterns such as:

- which search profiles produce callbacks
- which sources produce noisy or low-quality jobs
- which resume profiles correlate with better outcomes
- which industries or title clusters are working
- whether sample size is too low to trust a signal

## Interview Prep

When an email or application status indicates an interview, the app can run interview prep.

Prep uses:

- job description
- company research
- application packet
- match concerns
- approved candidate evidence

Interview prep output can include:

- likely interview themes
- likely tests or assessments if known locally
- focused talking points
- project evidence to prepare
- risks and gaps to address
- prep tasks

The app does not claim external research facts unless they are available from saved context or explicitly researched and stored.

## Thank-You Follow-Up Drafts

After an interview or recruiter conversation, open the application detail page and use the Thank-you drafts card. The generator creates a concise email and a shorter LinkedIn variant from the saved application, role, interviewer details, interview stage, conversation notes, and approved candidate evidence.

Supported stages are recruiter screen, hiring manager, technical, panel/onsite, final, informational, and custom. Drafts are saved for review and copying only. They do not send messages, create contacts, record interview outcomes, or change the tracker automatically.
