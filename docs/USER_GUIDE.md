# Job Search OS — User Guide for Dummies

A plain-English, step-by-step guide to every feature. No technical experience required.

---

## Table of Contents

- [Part 0 — What Is This?](#part-0--what-is-this)
- [Part 1 — First-Time Setup](#part-1--first-time-setup)
- [External Services Reference — What to Set Up and Why](#external-services-reference--what-to-set-up-and-why)
- [Part 2 — First-Time Setup Checklist (Do These in Order)](#part-2--first-time-setup-checklist-do-these-in-order)
- [Part 3 — The Command Center (Your Daily Home Base)](#part-3--the-command-center-your-daily-home-base)
- [Part 4 — Search Profiles (Telling the System Who You Are)](#part-4--search-profiles-telling-the-system-who-you-are)
- [Part 5 — Job Sources (Where to Look for Jobs)](#part-5--job-sources-where-to-look-for-jobs)
- [Part 6 — Running a Job Search](#part-6--running-a-job-search)
- [Part 7 — The Jobs Queue (Reviewing What the System Found)](#part-7--the-jobs-queue-reviewing-what-the-system-found)
- [Part 8 — Candidate Evidence (Your Personal Fact Database)](#part-8--candidate-evidence-your-personal-fact-database)
- [Part 9 — GitHub Integration (Adding Your Projects as Evidence)](#part-9--github-integration-adding-your-projects-as-evidence)
- [Part 10 — Application Materials (Resumes and Cover Letters)](#part-10--application-materials-resumes-and-cover-letters)
- [Part 11 — The Recruiting Agency (Hands-Off Packet Prep)](#part-11--the-recruiting-agency-hands-off-packet-prep)
- [Part 12 — Apply Sprint (The Browser Assistant)](#part-12--apply-sprint-the-browser-assistant)
- [Part 13 — Needs Me (Your Inbox for Blockers)](#part-13--needs-me-your-inbox-for-blockers)
- [Part 14 — Application Tracker](#part-14--application-tracker)
- [Part 15 — Email and Outcomes](#part-15--email-and-outcomes)
- [Part 16 — Jolene (Your Always-On AI Assistant)](#part-16--jolene-your-always-on-ai-assistant)
- [Part 17 — Settings Reference](#part-17--settings-reference)
- [Part 18 — Advanced Features](#part-18--advanced-features)
- [Part 19 — Your Daily Workflow (Putting It All Together)](#part-19--your-daily-workflow-putting-it-all-together)

---

## Part 0 — What Is This?

**Job Search OS** is a personal, AI-powered job search assistant that runs on your own computer. Think of it as a smart command center for your job hunt.

Here is what it does:

- Automatically finds job postings at companies you care about, every day
- Scores each job against your background and tells you which ones are worth your time
- Writes tailored resumes and cover letters using only facts you have verified — never makes things up
- Fills in application forms for you in your browser (but always stops before clicking Submit, so you stay in control)
- Reads your email to detect rejections, interview invitations, and offers, and updates your tracker automatically
- Answers your career questions through **Jolene, Chief of Staff**, available on the Command Center and every screen

**What this is NOT:**

- It is not a "spray and pray" mass-apply bot. Every application requires your approval before anything is sent.
- It will never invent a job title, skill, degree, certification, or number you have not confirmed. Everything it writes must trace back to your approved evidence.
- It will never click Submit on an application without your say-so.
- LinkedIn is used for lead discovery, public-content drafts, publishing, and analytics. It is not treated as an auto-apply source, and LinkedIn job URLs stay separate from employer or ATS application links.

You are always in charge. The system does the boring, time-consuming parts — you make the calls.

> [PART_COMPLETE:0]
>
> **Now that you know what the app does, let's get it running.** Continue to Part 1 — First-Time Setup.

---

## Part 1 — First-Time Setup

### Local vs. Production: Which is right for you?

There are two ways to run this app. Read the table below before you start.

| | **Local (on your computer)** | **Production (deployed to Vercel)** |
|---|---|---|
| **Best for** | Developers, people who want full control | Anyone who wants the app available from any device |
| **Database** | Docker (PostgreSQL runs on your machine) | Hosted PostgreSQL with pgvector (Railway, Neon, Supabase, etc.) |
| **Configuration** | `.env` file | Vercel environment variables dashboard |
| **Cron jobs** | Triggered manually or not at all | Run automatically via `vercel.json` (daily search, hourly email sync) |
| **Apply Sprint browser assistant** | Works — opens a real browser on your computer | Does NOT work directly from the web URL — see [Apply Sprint in Production](#apply-sprint-in-production) below |
| **MCP server** | Run locally with `npm run mcp:server` | Not available in a Vercel deployment |
| **Chrome extension** | Works | Works (connects to your production URL) |
| **Cost** | Free (your own hardware) | Vercel free tier is enough; database hosting ~$0–10/month |

> **Most people start locally.** Even if you eventually deploy to production, do the local setup first to get everything configured and working, then deploy.

LinkedIn publishing and analytics are optional. To use `/linkedin-content` as a publishing studio, configure a LinkedIn Developer app with the Share on LinkedIn product, set `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and `LINKEDIN_SHARE_REDIRECT_URI`, then connect publishing from Settings or the LinkedIn Content page. Approved drafts publish immediately after privacy and provenance checks pass. To track post performance on Command Center, also add the LinkedIn member post analytics product when available, set `LINKEDIN_ANALYTICS_REDIRECT_URI`, and connect analytics; if LinkedIn has not granted `r_member_postAnalytics`, paste CSV metrics into the dashboard instead.

---

### Option 1: Local Setup (run on your own computer)

#### Prerequisites

- [Node.js](https://nodejs.org) (v18 or later)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- A terminal app (Terminal on Mac, PowerShell or WSL on Windows)
- Optional but strongly recommended: an [OpenAI API key](https://platform.openai.com/api-keys)

#### Step-by-step

1. Open your terminal and navigate to the project folder:

   ```bash
   cd /path/to/jobsearch-dashboard-ai
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the database (requires Docker Desktop to be running):

   ```bash
   npm run db:up
   ```

4. Create the database tables and add seed data:

   ```bash
   npm run prisma:migrate
   npm run prisma:seed
   ```

5. Copy the example environment file and open it:

   ```bash
   cp .env.example .env
   ```

   Open `.env` in any text editor. The most important variables to fill in right now:

   | Variable | What it does | Required? |
   |---|---|---|
   | `SEED_USER_EMAIL` | Your email address — identifies you as the app's single user | Yes |
   | `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` for local | Yes |
   | `OPENAI_API_KEY` | Powers AI scoring, resume writing, and Jolene answers | Strongly recommended |
   | `OPENAI_MODEL` | Which OpenAI model to use for general app features. Default: `gpt-4.1-mini` | No |

   > **Without an OpenAI key:** The app still works. Scoring, duplicate detection, and evidence matching use deterministic (rule-based) fallbacks. Jolene will answer with generic guidance instead of personalized context.

6. Start the app:

   ```bash
   npm run dev
   ```

7. Open your browser and go to `http://localhost:3000`. You should see the Command Center.

> **What just happened?** You installed the app, created a local PostgreSQL database, and launched the web interface. Everything runs on your machine — nothing is sent to an external server except calls to OpenAI (if you configured a key).

#### Alternative: Full Docker stack

If you prefer to run everything in Docker (app + database + worker, no local Node required):

```bash
docker compose --profile full up --build
```

Then seed the database once from a second terminal:

```bash
docker compose --profile full exec app npm run prisma:seed
```

This starts PostgreSQL with pgvector, Redis, the Next.js app on `http://localhost:3000`, and an embeddings worker all in containers.

---

### Option 2: Production Deployment (Vercel)

This deploys the web interface to Vercel so you can access it from any browser on any device. Your database lives on a hosted service. Cron jobs (daily job search, hourly email sync, daily agency run) run automatically with no manual intervention.

#### Step 1 — Provision a hosted PostgreSQL database with pgvector

The app requires pgvector for evidence-based search. Pick one of these providers — all have free or low-cost tiers:

| Provider | pgvector support | Free tier |
|---|---|---|
| **[Railway](https://railway.app)** | Yes (built-in) | $5/month credit |
| **[Neon](https://neon.tech)** | Yes (built-in) | Yes |
| **[Supabase](https://supabase.com)** | Yes (built-in) | Yes |
| Any Postgres host | Requires enabling the `pgvector` extension manually | Varies |

After creating the database, copy the connection string. It looks like:
```
postgresql://user:password@host:5432/dbname?sslmode=require
```

#### Step 2 — Deploy to Vercel

1. Push the repository to GitHub (if you have not already).
2. Go to [vercel.com](https://vercel.com) and click **Add New → Project**.
3. Import your GitHub repository.
4. Vercel will detect it as a Next.js project automatically. Do not change the build settings.
5. Click **Deploy**. The first deploy will fail because environment variables are not set yet — that is expected.

#### Step 3 — Set environment variables in Vercel

Instead of a `.env` file, production uses the Vercel environment variables dashboard.

1. In your Vercel project, go to **Settings → Environment Variables**.
2. Add each variable. The critical ones for production:

   | Variable | Production value |
   |---|---|
   | `DATABASE_URL` | Your hosted database connection string |
   | `SEED_USER_EMAIL` | Your email address |
   | `NEXT_PUBLIC_APP_URL` | Your Vercel deployment URL, e.g. `https://your-app.vercel.app` |
   | `OPENAI_API_KEY` | Your OpenAI key |
   | `CRON_SECRET` | **Make up a long random string** — this protects your cron endpoints from being triggered by anyone |
   | `EMAIL_SYNC_SECRET` | Another long random string — protects the email sync endpoint |
   | `BROWSER_EXTENSION_TOKEN` | A random string — needed if you use the Chrome extension |

   > **`CRON_SECRET` is critical in production.** Without it, anyone who knows your URL can trigger your job search or email sync. Make it something like a 32-character random string.

3. Add any other services you are using (OpenAI, Brave, Pushover, email OAuth, etc.) the same way.
4. After adding variables, go to the **Deployments** tab and click **Redeploy** on the latest deployment.

#### Step 4 — Run migrations and seed data

After a successful deploy, run the database migrations once from your local machine, pointed at your production database:

```bash
DATABASE_URL="your-production-connection-string" npx prisma migrate deploy
DATABASE_URL="your-production-connection-string" npx prisma db seed
```

Or connect to a terminal in the Vercel deployment and run the same commands there.

#### Step 5 — Update OAuth redirect URIs

If you are using Gmail or Outlook OAuth for email sync, you need to update the redirect URIs in both your `.env` (or Vercel dashboard) **and** in your Google Cloud / Azure app registration to point to your production domain:

- Gmail: `https://your-app.vercel.app/api/email/oauth/gmail/callback`
- Outlook: `https://your-app.vercel.app/api/email/oauth/outlook/callback`

Update `GMAIL_OAUTH_REDIRECT_URI` and `OUTLOOK_OAUTH_REDIRECT_URI` accordingly.

#### How cron jobs work in production

Vercel reads `vercel.json` and automatically runs these scheduled jobs:

| Job | Schedule | What it does |
|---|---|---|
| Job search | Daily at 14:00 UTC | Finds new jobs across all enabled sources |
| Email sync | Every hour | Reads your inbox and updates application outcomes |
| Recruiting Agency | Daily at 15:30 UTC | Processes 90+ score matches into ready-to-apply packets |

These run automatically — you do not need to do anything. On the Command Center you can still trigger a manual search at any time.

> **`CRON_SECRET` must be set** for crons to work on Vercel. Vercel sends the secret in the `Authorization` header when calling your cron endpoints. Without it, the cron calls will be rejected.

#### Apply Sprint in production

The **Launch Assistant** button in the web UI is intentionally disabled when the app is accessed from a non-local URL. This is a security measure: the browser assistant runs a local Python/Playwright process on your computer and can only be launched from `localhost`.

**Your options when running the app in production:**

1. **Run the assistant from your local machine against the production database** (recommended):
   - Clone the repo locally (if you have not already)
   - Run `npm run assistant:install` once
   - Set your production `DATABASE_URL` in the local `.env`
   - Use Apply Sprint from `http://localhost:3000` (your local copy of the app connected to the production database)
   - Or run directly: `npm run assistant:apply -- <application-id>`

2. **Use the Chrome extension's "Fill from Job Search OS"**:
   - Install the Chrome extension (see [Part 18](#part-18--advanced-features))
   - Navigate to the job application form in Chrome
   - Click the extension icon → **Fill from Job Search OS**
   - The extension fills safe known fields from your packet without needing a local browser runner

3. **Set `ENABLE_LOCAL_ASSISTANT=true`** in your Vercel environment variables:
   - This re-enables the Launch Assistant button in the production web UI
   - Only do this if you are the sole user and you trust your deployment environment
   - It requires a local Python/Playwright process to be running on a machine that can reach the production server

> **The browser assistant will always require a machine with Python and Playwright installed.** It cannot run as a serverless function on Vercel because it needs to open a real browser window on your computer.

> [PART_COMPLETE:1]
>
> **With the app installed and connected, let's review which third-party accounts are worth setting up.** Continue to the External Services Reference.

---

## External Services Reference — What to Set Up and Why

The app works out of the box once you have a database and Node.js (local) or a Vercel deployment with a hosted database (production). But several optional services dramatically change what it can do. This section explains every service, whether it is required or optional, and exactly what you gain or lose by skipping it — so you can make an informed decision before the setup checklist.

> **How to set environment variables:** Local = add to your `.env` file and restart the app. Production = add to **Vercel → Settings → Environment Variables** and redeploy. Every service in this section uses one of these two methods.

> **Quick summary for the impatient:** At minimum, set up OpenAI, one email inbox connection (IMAP or Gmail OAuth), and Brave Search. Everything else is a nice-to-have or a power-user feature.

---

### Required (the app cannot run without these)

#### PostgreSQL + pgvector

| | |
|---|---|
| **Required?** | Yes — the app will not start without it |
| **Local setup** | Docker: `npm run db:up` starts it automatically |
| **Production setup** | Use a hosted PostgreSQL service with pgvector enabled: [Railway](https://railway.app), [Neon](https://neon.tech), or [Supabase](https://supabase.com) all include pgvector. Set `DATABASE_URL` to the connection string they provide. |
| **Cost** | Local: Free. Hosted: free tier available on all three providers above. |

PostgreSQL is the database that stores every job, application, resume, piece of evidence, conversation, and agent run. pgvector is a PostgreSQL extension that enables semantic search over your candidate evidence — it is what lets Jolene and the resume generator find relevant facts from your background when writing.

- **Local:** Docker runs both PostgreSQL and pgvector for you automatically when you run `npm run db:up`. No extra setup needed.
- **Production:** Docker is not used. You provision a hosted PostgreSQL database with pgvector enabled, copy the connection string, and set it as `DATABASE_URL` in your Vercel environment variables. All three providers listed above support pgvector out of the box.

**If you skip it:** The app will not start at all.

---

### Highly Recommended (major feature loss without these)

#### OpenAI API

| | |
|---|---|
| **Required?** | No — but most AI features degrade significantly |
| **Where to get it** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Cost** | Pay-per-use. Typical job search usage: ~$2–10/month with `gpt-4.1-mini` |
| **Env variable** | `OPENAI_API_KEY` |
| **Recommended model** | `OPENAI_MODEL=gpt-4.1-mini` (fast, cheap, good enough for most tasks) |

OpenAI powers almost every intelligent feature in the app:

- **Job scoring**: Without it, scoring uses a rule-based formula (keyword matching, title classification). It still works but misses nuance — it can't understand that "Staff Engineer — Growth" is probably not a great fit even if the keywords match.
- **Resume and cover letter generation**: Without it, materials fall back to a template engine. The output will be generic and much less tailored to the specific job.
- **Jolene**: Without it, Jolene answers with generic, pre-written guidance instead of reading your actual evidence and applications. She effectively becomes a FAQ bot.
- **Evidence embeddings**: Without it, the semantic search that powers evidence-grounded writing does not work. Materials will not reference your specific projects and achievements.
- **Interview prep, company research, application QA, market intelligence**: All fall back to simple deterministic logic or produce much less useful output.

**If you skip it:** The app functions as a job aggregator and basic tracker. You can still find jobs, approve them, and manage your pipeline. You lose most of the "AI" in AI-powered job search.

**Verdict: Set this up first. It is the single highest-impact service.**

---

#### Inbound Email Sync (IMAP, Gmail OAuth, or Outlook OAuth)

| | |
|---|---|
| **Required?** | No — but outcome tracking becomes entirely manual |
| **Options** | IMAP (any provider), Gmail OAuth, Outlook OAuth |
| **Cost** | Free — you are accessing your own mailbox |
| **Env variables** | `JOB_EMAIL_IMAP_*` or `GMAIL_OAUTH_*` or `OUTLOOK_OAUTH_*` |

This connects the app to the email account you use for job applications. Once connected, the app scans incoming mail and:

- Automatically marks applications as **Rejected**, **Interview Requested**, **Offer**, etc.
- Creates interview prep tasks when a scheduling email arrives
- Creates Needs Me items when the system is not sure what an email means and needs your input
- Keeps your application tracker accurate without you manually updating every status

**If you skip it:** You must manually open each application and update its status yourself every time something happens. You will also miss the interview prep trigger, the thank-you draft prompts, and the outcome learning signals (which are how the system improves its recommendations over time).

**IMAP vs. Gmail/Outlook OAuth:**
- **IMAP** is simpler to set up (just an app password, no OAuth app registration). Works with Gmail, Outlook, Yahoo, and most other providers.
- **Gmail/Outlook OAuth** is cleaner for ongoing use and does not require storing your password. Requires a one-time app registration in Google Cloud or Azure.

**Verdict: Set this up early. Without it the tracker is just a spreadsheet you update manually.**

---

#### Brave Search API

| | |
|---|---|
| **Required?** | No — but job coverage drops significantly |
| **Where to get it** | [api.search.brave.com](https://api.search.brave.com) |
| **Cost** | Free tier: 2,000 queries/month. Paid tiers available. |
| **Env variable** | `BRAVE_SEARCH_API_KEY` |

Brave Search powers the **Search Query Backlog** source, which is a set of targeted web searches that covers hundreds of job platforms the app cannot scrape directly:

- Workday, SmartRecruiters, iCIMS, Jobvite, Bullhorn, Oracle Taleo, SAP SuccessFactors, BambooHR, Workable, Teamtailor, Jobylon, Join, Jobtrain
- Wellfound (AngelList), YC jobs, Built In, Levels.fyi, TrueUp, Dice, ZipRecruiter, Monster, CareerBuilder, SimplyHired, Adzuna
- Hacker News "Who's Hiring", VC portfolio boards
- Remote-specific boards: Remote.co, Remotive, NoDesk, Himalayas, Working Nomads
- USAJOBS (federal roles)

Without Brave Search, you are limited to companies you have explicitly added to your watchlist that use Greenhouse, Lever, or Ashby — which is a good start but misses a large portion of the job market.

**If you skip it:** Your job search only covers companies you have manually added to your watchlist that happen to use one of the three directly-integrated ATS platforms. You miss Workday, SmartRecruiters, iCIMS, Jobvite, Bullhorn, Taleo, SuccessFactors, Wellfound, general boards, remote boards, and anything found via open-web search.

**Verdict: Set this up. The free tier is more than enough for a job search.**

---

### Useful (meaningful quality-of-life improvement)

#### Pushover (push notifications to your phone)

| | |
|---|---|
| **Required?** | No |
| **Where to get it** | [pushover.net](https://pushover.net) — one-time $5 app purchase |
| **Cost** | $5 one-time, then free |
| **Env variables** | `PUSHOVER_USER_KEY`, `PUSHOVER_APP_TOKEN` |

Sends push notifications to your phone when new strong matches are found, when the Recruiting Agency finishes a run, or when a Needs Me item requires your attention. You can also configure these from inside the app: click **Settings** in the left sidebar → scroll to the **Notifications** card.

**If you skip it:** You only find out about new jobs and blockers when you manually open the app. If you check the app daily anyway, this is low priority.

**Verdict: Worth the $5 if you want real-time alerts. Skip it if you check the app on a routine.**

---

#### Resend or Postmark (outbound email notifications)

| | |
|---|---|
| **Required?** | No |
| **Where to get them** | [resend.com](https://resend.com) or [postmarkapp.com](https://postmarkapp.com) |
| **Cost** | Both have generous free tiers (Resend: 3,000 emails/month free) |
| **Env variables** | `RESEND_API_KEY` or `POSTMARK_SERVER_TOKEN`, plus `NOTIFICATION_FROM_EMAIL` |

Sends email digests when new jobs are found. You configure which events trigger an email in Settings → Notifications (every run, daily summary, or strong matches only).

**If you skip it:** No email digests. Pushover handles real-time alerts; this is for a more formatted summary. If you are using Pushover, this is lower priority.

**Verdict: Set up one of these if you want email summaries. Resend is simpler to get started.**

---

#### Python + Playwright (browser assistant — always runs locally)

| | |
|---|---|
| **Required?** | Only if you want Apply Sprint to auto-fill forms |
| **How to install** | `npm run assistant:install` (installs Python venv + Playwright) |
| **Cost** | Free |
| **Prerequisites** | Python 3 must be installed on your machine; always runs locally regardless of where the app is deployed |

This installs the local browser automation that powers Apply Sprint. It opens a real Chrome browser window on your computer, navigates to the application form, and fills in fields from your packet.

**This always runs on your local machine — even if your app is deployed to Vercel.** The browser assistant cannot run as a cloud function because it needs to open a real browser window. If you use the production deployment, you install Python + Playwright locally and run the assistant from your machine against your production database (see [Apply Sprint in Production](#apply-sprint-in-production) in Part 1 for step-by-step instructions).

**If you skip it:** Apply Sprint will show your ready applications but the **Launch Assistant** button will not work. You can still use the Chrome extension's "Fill from Job Search OS" as a lighter alternative, or fill forms entirely by hand.

**Verdict: Install this if you want browser automation. It is free and installs in under 2 minutes.**

---

### Optional Power Features

#### GitHub Personal Access Token

| | |
|---|---|
| **Required?** | No — GitHub sync works without it |
| **Where to get it** | [github.com/settings/tokens](https://github.com/settings/tokens) (read-only public repos is enough) |
| **Cost** | Free |
| **Env variable** | `GITHUB_TOKEN` |

Without this token, GitHub API calls are unauthenticated and rate-limited to 60 requests per hour. Syncing 80 repositories fetches each repo's README separately — that is up to 160+ API calls per sync. Without a token you will likely hit the rate limit mid-sync if you have more than about 25 repositories.

**If you skip it:** GitHub sync works fine if you have fewer than ~25 repos. With more repos, some READMEs may fail to fetch. Add the token to be safe.

**Verdict: Takes 30 seconds to create. Add it if you have more than a handful of repos.**

---

#### Google ADK / Gemini (`ADK_ENABLED=true`)

| | |
|---|---|
| **Required?** | No |
| **Where to get it** | [ai.google.dev](https://ai.google.dev) — requires a Gemini API key |
| **Cost** | Free tier available; generous quota for a job search |
| **Env variables** | `ADK_ENABLED=true`, `ADK_MODEL=gemini-2.5-flash`, and a Gemini API key |

ADK (Google's Agent Development Kit) enables an additional AI "control plane" layer on top of OpenAI. When enabled, it powers:

- A richer **Daily Command Center** plan with deeper prioritization logic
- Enhanced **Market Intelligence** synthesis across multiple research sources
- Jolene's full **app operator mode** — where she can plan and confirm multi-step actions across the app

**If you skip it:** The Daily Command Center, Market Intelligence, and Jolene operator mode all fall back to OpenAI or deterministic logic. For most users this is perfectly fine. ADK adds a second AI layer, not a first one.

**Verdict: Skip this until you feel like you have hit the ceiling on what OpenAI alone can do. It is an enhancement, not a foundation.**

---

#### LangSmith (agent observability and tracing)

| | |
|---|---|
| **Required?** | No — this is a developer debugging tool |
| **Where to get it** | [smith.langchain.com](https://smith.langchain.com) |
| **Cost** | Free tier available |
| **Env variables** | `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT` |

LangSmith records redacted traces of every agent run — what input went in, what happened at each step, and what came out. It is useful for understanding why a specific resume was generated a certain way, or why the Recruiting Agency skipped a particular job.

All traces are redacted by default — your resume content, cover letters, application answers, and personal information are stripped before they leave the app.

**If you skip it:** You lose visibility into what the agents are doing under the hood. The app's own quality loop still works without it (it uses a local evaluation system). This is primarily useful if you are debugging unexpected agent behavior or want to tune performance.

**Verdict: Skip it during normal use. Add it if you are troubleshooting why an agent produced bad output.**

---

#### Chrome Extension Token

| | |
|---|---|
| **Required?** | Only if you want to use the Chrome extension |
| **Env variable** | `BROWSER_EXTENSION_TOKEN` (make up any secret string) |
| **Local:** | Add to `.env` file |
| **Production:** | Add to Vercel environment variables |

This is a shared secret between the Chrome extension and your app. It authenticates the extension so it can capture jobs and read application data from your app — whether that app is running locally at `localhost:3000` or live at your Vercel URL.

The Chrome extension works with both local and production deployments. You configure which URL it points to when you install it.

**If you skip it:** The Chrome extension will not be able to communicate with your app. All other features are unaffected.

**Verdict: Set this up when you install the Chrome extension (see Part 18). Skip it otherwise.**

---

#### MCP Server (`npm run mcp:server`)

| | |
|---|---|
| **Required?** | No |
| **Always runs locally** | Yes — the MCP server is a local process, not a cloud service |
| **Env variable** | `JOB_SEARCH_OS_APP_URL` — set to `http://localhost:3000` (local) or `https://your-app.vercel.app` (production) |

The MCP (Model Context Protocol) server exposes your job search data and operations as tools that any MCP-compatible AI client (Claude Desktop, custom agents, etc.) can call. For example, you could ask Claude to "find me all jobs over 85 score I haven't reviewed yet" and it would query your database.

The MCP server always runs as a local process on your machine. When your app is deployed to production, you set `JOB_SEARCH_OS_APP_URL` to your production URL so the local MCP server calls the right API.

**If you skip it:** No external AI tools can access your job search data. Everything is still fully usable from the web app directly.

**Verdict: Only set this up if you actively use an external AI tool that supports MCP, such as Claude Desktop.**

---

### Services Summary Table

| Service | Required? | Local setup | Production setup | Impact if skipped |
|---|---|---|---|---|
| **PostgreSQL + pgvector** | Yes | `npm run db:up` (Docker) | Hosted DB: Railway, Neon, or Supabase | App won't start |
| **OpenAI API** | Strongly recommended | Add `OPENAI_API_KEY` to `.env` | Add to Vercel env vars | AI features degrade to rule-based fallbacks; Jolene becomes generic |
| **Email sync** | Strongly recommended | Configure IMAP or OAuth in `.env` | Configure in Vercel env vars; cron runs automatically | Outcome tracking is 100% manual |
| **Brave Search API** | Recommended | Add `BRAVE_SEARCH_API_KEY` to `.env` | Add to Vercel env vars | Lose broad ATS, job-board, startup, remote-board, and LinkedIn-original-source discovery |
| **LinkedIn OIDC** | Optional | Add `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` to `.env` | Add to Vercel env vars and set the production callback URL | No LinkedIn identity/photo/locale enrichment; job search is unaffected |
| **LinkedIn Publishing** | Optional | Add Share on LinkedIn product and `LINKEDIN_SHARE_REDIRECT_URI` | Add production callback URL to LinkedIn app and Vercel env vars | `/linkedin-content` remains editable/copyable but cannot publish directly |
| **LinkedIn Analytics** | Optional | Add member post analytics product and `LINKEDIN_ANALYTICS_REDIRECT_URI` | Add production callback URL to LinkedIn app and Vercel env vars | Command Center can still track post metrics through CSV paste import |
| **Python + Playwright** | Recommended | `npm run assistant:install` on your machine | Same — always runs locally even with production app | Apply Sprint won't auto-fill forms |
| **Pushover** | Optional | Add keys to `.env` or Settings UI | Add to Vercel env vars or Settings UI | No phone push alerts |
| **Resend or Postmark** | Optional | Add API key to `.env` | Add to Vercel env vars | No email digests |
| **GitHub token** | Optional | Add `GITHUB_TOKEN` to `.env` | Add to Vercel env vars | Rate limits with 25+ repos |
| **Google ADK / Gemini** | Optional | Add `ADK_ENABLED=true` + key to `.env` | Add to Vercel env vars | Daily plan and Jolene operator use simpler logic |
| **LangSmith** | Optional | Add keys to `.env` | Add to Vercel env vars | No agent traces |
| **Chrome extension token** | Optional | Add `BROWSER_EXTENSION_TOKEN` to `.env` | Add to Vercel env vars | Chrome extension won't connect |
| **MCP server** | Optional | `npm run mcp:server` (always local) | Not on Vercel; point local server at production URL | External AI tools can't access your data |

> **Now that you know which services to enable, follow the checklist to get everything configured in the right order.** Continue to Part 2 — First-Time Setup Checklist.

---

## Part 2 — First-Time Setup Checklist (Do These in Order)

Do these seven steps before your first job search. Each one builds on the last.

### Step 1 — Upload your resume

1. Click **Settings** in the left sidebar.
2. Scroll down to the **Admin and supporting tools** card and click **Materials workspace** (`/resumes`).
3. On the Materials workspace page, find the **Upload Resume** card and click **Open** (`/resumes/upload`).
4. Select your resume PDF or Word file and upload it.
5. The system will parse it into structured bullets and sections.

### Step 2 — Review parsed resume bullets

1. From the Materials workspace (`/resumes`), click **Open** on the **Review Parsed Profile** card (`/resumes/review`).
   - Or: click **Settings** in the left sidebar → **Admin and supporting tools** → **Materials workspace** → **Review Parsed Profile → Open**.
2. Read through each parsed bullet. The system will show you what it extracted from your resume.
3. Edit any bullet that was misread. Delete duplicates or outdated entries.
4. **Approve bullets you want the system to use.** Unapproved bullets are visible but not used in generated materials.

> **Why this matters:** Every resume and cover letter the system generates pulls from these approved bullets. Taking 15 minutes here saves you from correcting bad materials later.

### Step 3 — Fill in your candidate profile

1. Click **Settings** in the left sidebar (`/settings`).
2. Scroll down to the **Application profile links** card and fill in your LinkedIn URL.
3. Optional: if `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` are configured, click **Connect LinkedIn** to import identity basics. This imports profile metadata only; it does not grant LinkedIn job-search or auto-apply access.
4. Scroll down to the **GitHub work context** card and fill in your GitHub profile URL (covered in detail in [Part 9](#part-9--github-integration-adding-your-projects-as-evidence)).
5. Click **Save settings**.

### Optional — Generate and publish LinkedIn content

Open `/linkedin-content` from Settings -> Admin -> LinkedIn content. The LinkedIn Content agent now starts from your brief instead of a fixed dropdown. Tell the documentarian agents what you want posted today, optionally add a post format or visual direction, and they will use recent app work, `/plans` files, aggregate analytics, prior drafts, approved edits, safe screenshots, and technical diagrams to create a reviewable post. LinkedIn content uses its own editable model setting under **Settings -> System -> AI provider**; it defaults to `gpt-5.5` so public posts can use a higher-quality writing model than the app-wide default. The same Settings card also includes a LinkedIn diagram image model, defaulting to `gpt-image-2`, for optional non-authoritative visual polish.

The team is designed to avoid repetitive category output. It compares the new brief against recent hooks, titles, screenshots, and overused phrases, then has a narrative strategist, documentarian, editorial challenger, visual producer, technical documentation architect, diagram systems designer, visual design reviewer, diagram QA reviewer, analytics narrator, editor, and privacy reviewer select a grounded angle. Plan files are treated as build-log memory, so implementation plans and product decisions can become source material when they are public-safe.

Architecture prompts get a stricter path. If you ask for system architecture or architectural diagrams, the draft must stay on architecture, include system-layer language, and generate staff-engineer technical diagram visuals for review. System architecture requests now use a traditional topology renderer with a left-side architecture canvas, nested boundaries, compact service nodes, connector labels, and a right-side numbered legend. Workflow and process explainers can still use the older column-style renderer when that layout fits the prompt better. Deterministic rendering owns exact diagram text, wrapping, typography, spacing, and provenance; QA blocks overflowing node labels, cramped legend cards, weak topology structure, excessive text, and missing provenance. Optional OpenAI image generation can add a social polish variant when enabled, but it is not selected as the source of truth for text-heavy technical diagrams because image models can still struggle with precise text placement and layout-sensitive compositions. The prompt-fidelity review appears on the draft card with a match score and warnings if the draft drifted into unrelated generic funnel commentary. If OpenAI is not configured, deterministic fallback still has to satisfy the prompt instead of reusing the old generic content template.

Content review is strict about visible evidence. A draft can be marked `NEEDS_REVIEW` if the body only says evidence exists without naming the selected source anchor, if it repeats stale generated-copy patterns, if it uses unrelated plan angles, or if a visual prompt cannot attach a passing safe app screenshot. The review also checks factual body claims against aggregate facts, selected evidence anchors, and architecture context so unsupported metrics or product claims do not publish under a clean source-facts list.

The app can publish approved drafts when the Share on LinkedIn connection is active. You can edit the draft, review the agent-team notes, inspect provenance and privacy warnings, then click **Approve and publish**. Editing title, hook, body, hashtags, or disclosure text invalidates the prior review and moves the draft back to `NEEDS_REVIEW`; regenerate or re-review before publishing. Approval is the final user action. If privacy/provenance checks pass and the publishing token includes `w_member_social`, the app posts to LinkedIn and stores the returned post id. If LinkedIn fails, the draft stays saved with a retryable error.

The Command Center also includes LinkedIn post analytics. If LinkedIn grants `r_member_postAnalytics`, connect analytics and click **Refresh** to sync published-post metrics. If that permission is not available yet, paste CSV rows with headers such as `postUrn,date,impressions,membersReached,reactions,comments,reshares,postSaves,postSends,linkClicks,followersGainedFromContent,profileViewsFromContent`. The dashboard stores aggregate snapshots only, shows KPI cards and charts, and feeds aggregate performance back into future content-agent memory. It never stores viewer identities, commenter identities, recruiter names, job URLs, salaries, or private application-specific outcomes.

### Step 4 — Create at least one Search Profile

A **Search Profile** defines a "version of you" targeting a specific type of role. You need at least one before a job search will run.

1. Click **Settings** in the left sidebar → scroll to the **Admin and supporting tools** card → click **Search profiles** (`/profiles`).
2. Click **New Profile**.
3. Fill in the required fields (see [Part 4](#part-4--search-profiles-telling-the-system-who-you-are) for a full breakdown).
4. Set the profile to **Active**.
5. Click **Save**.

### Step 5 — Enable job sources

1. Click **Settings** in the left sidebar → scroll to the **Admin and supporting tools** card → click **Company sources** (`/sources`).
2. You will see a list of job sources: Greenhouse, Lever, Ashby, company sites, and others.
3. Toggle on the sources you want to use. Start with a handful — you can add more later.
4. For company sources, make sure at least a few companies are on your watchlist.

### Step 6 — Configure notifications

1. Click **Settings** in the left sidebar → scroll down to the **Notifications** card.
2. Fill in at least one notification channel:
   - **Email notifications:** Set `RESEND_API_KEY` or `POSTMARK_SERVER_TOKEN` and `NOTIFICATION_FROM_EMAIL` — in your `.env` file (local) or Vercel environment variables (production), then restart or redeploy.
   - **Push notifications (Pushover):** Set `PUSHOVER_USER_KEY` and `PUSHOVER_APP_TOKEN` — same method.
3. Click **Send test notification** to confirm it works.

### Step 7 — Connect your email inbox

This lets the system read your job-response emails and update your application tracker automatically.

1. Click **Settings** in the left sidebar → scroll down to the **Inbound email sync** card.
2. Choose your connection method:
   - **IMAP** (works with most email providers): See [Part 15](#part-15--email-and-outcomes) for setup.
   - **Gmail OAuth**: Click **Connect Gmail** and follow the browser prompts.
   - **Outlook OAuth**: Click **Connect Outlook** and follow the browser prompts.

> [PART_COMPLETE:2]
>
> **You are now ready for your first job search.** Continue to Part 3.

---

## Part 3 — The Command Center (Your Daily Home Base)

![The Command Center — live search status, recruiting agency activity, and pipeline counts at a glance](/guide-screenshots/dashboard.png)

**What this does:** Gives you a live operating view of everything happening in your job search — at a glance.

Click **Command Center** in the left sidebar (`/dashboard`). This is the page you should open every morning.

### What you will see

| Section | What it shows |
|---|---|
| **Search Run** | The status and stats from the last (or currently running) job search |
| **Agency Run** | The status of the Recruiting Agency — the AI that reviews strong matches |
| **Needs Me** | A preview of open blockers waiting for your input |
| **Pipeline Summary** | Counts of jobs and applications at each stage |
| **Daily Plan** | A short prioritized action list from the AI |
| **Integrity Audit** | Warnings about data drift or inconsistencies in your tracker |

### Lifecycle readiness

The Command Center also includes a readiness checklist for the full search lifecycle:

Setup → Search → Review → Packet → Apply → Follow-up → Interview → Outcome

Use this as a morning operating checklist. It pulls important readiness signals out of hidden settings and admin pages, including whether your profile, evidence, generated materials, applications, follow-ups, interviews, and outcomes have enough signal for the agents to make useful recommendations.

### How to trigger a job search from here

1. Find the **Search** section on the Command Center.
2. Click **Run search improvement loop**.
3. A live progress panel will appear showing: sources being fetched → jobs deduped → jobs scored → jobs saved.
4. When it completes, the panel shows how many jobs were found, how many were new, how many matched your profiles, and whether the loop paused for review or Apply Sprint.

> **What just happened?** The system contacted every enabled job source, pulled new listings, removed duplicates, scored each one against your search profiles, saved the results to your Jobs queue, and prepared eligible high-confidence matches for Apply Sprint. If jobs still need approve/reject review or prepared applications still need Apply Sprint, the profile-health and Market Analysis refresh pauses until you handle those gates.

### How to read the Daily Plan

The **Daily Plan** is generated by an AI agent that looks at your current jobs, applications, blockers, and profile health, and gives you a short action list. Examples:

- "3 high-fit jobs need your review"
- "Resolve 1 open field blocker in Needs Me"
- "Follow up on application to Acme Corp — 8 days with no response"

You do not have to follow the plan, but it is a useful starting point each morning.

### The Agency panel

The Agency panel shows whether the **Recruiting Agency** (the AI that automatically prepares packets for your strongest matches) is running, idle, or has finished. See [Part 11](#part-11--the-recruiting-agency-hands-off-packet-prep) for a full explanation.

> [PART_COMPLETE:3]
>
> **You know your way around the dashboard. Now let's tell the system what kind of work you're looking for.** Continue to Part 4 — Search Profiles.

---

## Part 4 — Search Profiles (Telling the System Who You Are)

![Search Profiles — manage targeting strategies, run health analysis, and get AI-suggested profiles](/guide-screenshots/profiles.png)

**What this does:** Defines the type of role you are looking for so the system knows what to score you against.

A **Search Profile** is a saved set of criteria that represents one "lane" of your job search. You can have multiple profiles for different types of roles (for example, one for Senior Frontend Engineer roles and another for Full-Stack Product Engineer roles).

### How to create a Search Profile

1. Click **Settings** in the left sidebar → scroll to the **Admin and supporting tools** card → click **Search profiles** (`/profiles`).
2. Click **New Profile**.
3. Fill in the fields:

| Field | What it means | Example |
|---|---|---|
| **Profile Name** | A label for this lane | "Senior Frontend — Remote" |
| **Target Titles** | The exact job titles you want | "Senior Frontend Engineer, Staff Frontend Engineer" |
| **Included Keywords** | Skills or terms the job should mention | "React, TypeScript, Next.js" |
| **Excluded Keywords** | Terms that disqualify a job | "embedded, C++, DevRel" |
| **Minimum Salary** | The lowest compensation you would accept | 140000 |
| **Remote Preference** | Remote only, hybrid, or on-site | Remote |
| **Relocation** | Whether you are open to relocating | No |
| **Minimum Match Score** | Jobs below this score are not saved (0–100) | 60 |
| **Status** | Active, paused, or archived | Active |

4. Click **Save**.

> **Tip:** Start with a minimum match score of 60. You can raise it after you see what kinds of jobs come in. A score of 90+ means the system is very confident it is a strong match.

### Multiple profiles

You can run multiple active profiles at the same time. The system will score every job it finds against every active profile and save the best match for each job.

### AI Profile Optimizer

On the Search profiles page, there is a **Suggest** or **Optimize** button that uses your candidate evidence to propose improvements to your profile keywords, title targeting, and scoring thresholds. This is useful after you have added evidence or after a few search runs.

The Command Center search improvement loop can also run the optimizer automatically, but only after review and Apply Sprint gates are clear. That keeps the **Profile Health** chart from treating unresolved jobs or unworked application packets as completed learning signal.

### Market Intelligence

The full **Market Analysis** brief now lives on the Command Center. Click **Run market brief** to get a weekly summary of:

- Demand trends for your target roles
- Which skills are being mentioned most in job listings you have seen
- Company and source quality signals from your own pipeline
- Analytical graphs for trends, comparisons, proportions, and match-quality distribution
- Cited article/news cards with source links and implications
- Review-only suggestions for tuning your profiles

> **Watch out for:** This brief never removes or broadly changes your profiles automatically. Low-risk additive keyword/company signals may be applied with caps; higher-risk changes stay review-only.

> [PART_COMPLETE:4]
>
> **Search profiles are set. Now let's point the system at the right places to find jobs.** Continue to Part 5 — Job Sources.

---

## Part 5 — Job Sources (Where to Look for Jobs)

![Job Sources — curated companies and boards the system searches during each discovery run](/guide-screenshots/sources.png)

**What this does:** Tells the system which job boards and company career pages to check during each search.

### How to manage sources

1. Click **Settings** in the left sidebar → scroll to the **Admin and supporting tools** card → click **Company sources** (`/sources`).
2. You will see sources organized by type:
   - **Company sources**: Companies you have added to your watchlist (Greenhouse, Lever, Ashby)
   - **Job boards**: RemoteOK, WeWorkRemotely, and others
   - **Search Query Backlog**: Brave-powered open-web searches covering hundreds of platforms including Workday, SmartRecruiters, iCIMS, Jobvite, Bullhorn, Taleo, SuccessFactors, Wellfound, ZipRecruiter, Dice, USAJOBS, YC, and many more
   - **Niche boards**: JobFront-powered boards, Eightfold career pages

### Adding a company to your watchlist

1. Go to **Sources** → **Add Company**.
2. Fill in the company name and priority.
3. Optionally: fill in the company's ATS slug (for example, `stripe` for `boards.greenhouse.io/stripe`). If you leave this blank, the system will try common variants automatically.
4. Select relevant categories (e.g. React, TypeScript, SaaS). These are used to generate search terms.
5. Click **Save**.

> **What just happened?** The system will now check that company's job listings every time a search runs. If the company uses Greenhouse, Lever, or Ashby, it can pull their full job list directly.

### The Search Query Backlog source

When you enable **Search Query Backlog** (requires a `BRAVE_SEARCH_API_KEY`), the system runs targeted Brave web searches covering platforms that do not have direct ATS integrations — including Workday, SmartRecruiters, iCIMS, Jobvite, Bullhorn, Oracle Taleo, SAP SuccessFactors, BambooHR, Teamtailor, Jobylon, Join, Jobtrain, Wellfound, ZipRecruiter, Dice, Monster, CareerBuilder, SimplyHired, Adzuna, Built In, Levels.fyi, Hacker News, USAJOBS, and many others.

LinkedIn itself is not scraped directly because it requires an authenticated account workflow and has high automation risk. If you see a role on LinkedIn, the search backlog is designed to find the original employer, ATS, or careers-page version of that role when it is publicly discoverable.

When the Chrome extension or manual capture receives a `linkedin.com/jobs/view/...` URL, the app treats it as a LinkedIn lead. If you captured the company, title, and selected job text, it is saved, scored, and approved through the normal pipeline. If you captured only the LinkedIn URL, the app saves a review-only lead instead of pretending it scraped the job; paste the selected job text or use the original employer/ATS link to make it scoreable. Company/title/location leads also generate safe original-posting queries that are merged into Search Query Backlog and exclude `site:linkedin.com`.

To enable it:
1. Get a [Brave Search API key](https://api.search.brave.com/).
2. Set `BRAVE_SEARCH_API_KEY=your-key-here` — in your `.env` file (local) or Vercel environment variables (production).
3. Restart (local) or redeploy (production).
4. In Sources, enable the **Search Query Backlog** source.

### Niche boards

- **JobFront boards**: Add the board URL from Sources (e.g. `https://jobs.frontdoordefense.com/`). The system parses the board's job cards directly.
- **Eightfold boards**: For companies like Netflix Careers, add the Eightfold domain URL. Netflix is pre-configured.

### Source roadmap labels

On the Sources page you may see labels like `Implemented`, `Planned`, `Manual`, and `P1`. These are:
- **Implemented**: The connector works and will pull jobs automatically
- **Enabled**: The source is turned on in your database and included in searches
- **Planned**: Not yet connected — requires future work
- **Manual**: Requires you to do something by hand (like log in with an account)
- **P1**: High-priority coverage target

> [PART_COMPLETE:5]
>
> **Your sources are configured. Now let's run your first search.** Continue to Part 6 — Running a Job Search.

---

## Part 6 — Running a Job Search

**What this does:** Goes out to all your enabled sources, pulls new job listings, scores them, removes duplicates, and saves the ones that match your profiles.

### Two ways to run a search

**Manual (from the app):**

1. Click **Command Center** in the left sidebar (`/dashboard`).
2. Click **Run Search** in the Search section.
3. Watch the live progress panel.

**Scheduled (automatic):**

The system can run a search automatically every day. Click **Settings** in the left sidebar → scroll to the **Search schedule** card to configure the schedule (see also [Part 17 — Settings](#part-17--settings-reference)).

### Reading the search analytics charts

While a search runs, Command Center, Runs, Sources, and Apply Sprint show graph-based search analytics instead of only text counters:

| Chart / metric | What it means |
|---|---|
| **Fetched** | Raw results returned by enabled sources. This can be very high because sources and profiles overlap. |
| **Detail candidates** | Results left after listing/search pages are removed or expanded into job-detail URLs. |
| **Scored** | Normalized jobs evaluated against active search profiles. |
| **Qualified** | Jobs that met an active profile's score threshold. |
| **New jobs** | Brand-new job records created after dedupe. Existing jobs are updated, not counted here. |
| **New matches** | New job/profile matches created for the review/application pipeline. Existing matches are not counted again. |
| **Agency eligible** | Matches with an application URL that are not review-only and can be prepared for Apply Sprint. |
| **Drop-off chart** | Shows why jobs did not move forward: below threshold, existing duplicate, existing match, suppressed listing, missing application URL, profile cap, provider warning, or review-only broad match. |

If you see thousands fetched but only a small number saved, the chart should show the bottleneck. Common causes are duplicate jobs from multiple sources, strict profile thresholds, existing matches already in the database, listing pages that cannot be expanded safely, missing application URLs, and profile `maxResultsPerRun` caps.

### What happens automatically after a search

1. **Scoring**: Each new job is scored against your active search profiles
2. **LLM evaluation** (if OpenAI is configured): A deeper AI evaluation adds fit, opportunity, and confidence scores with rationale
3. **Duplicate check**: Stale or duplicate listings are flagged
4. **Agency handoff**: Eligible non-review-only matches with application URLs are handed to the **Recruiting Agency** for packet preparation (see [Part 11](#part-11--the-recruiting-agency-hands-off-packet-prep))
5. **Profile health gate**: If jobs still need review or prepared applications still need Apply Sprint, the loop pauses and tells you what to handle next
6. **Profile optimizer**: When gates are clear, the optimizer refreshes search-profile health snapshots
7. **Market Intelligence**: The market brief refreshes after the optimizer so the dashboard charts use current profile-health data
8. **Notifications**: If configured, you get an alert with the search summary

The seeded `Broad LinkedIn Parity Review` profile is intentionally wider than the focused frontend/product profiles. It catches senior software, full-stack, frontend, React, TypeScript, product engineer, design-system, AI product UI, remote, US, and global opportunities that you might otherwise see manually on LinkedIn, with a 250-match per-run cap. Lower-confidence matches from this broad lane are saved for review but excluded from automatic Apply Sprint preparation until you approve them.

### Manually adding a job

Found a job yourself on a company's website? Add it manually:

1. Click **Jobs** in the left sidebar (`/jobs`).
2. Click the **Add manual job** button at the top of the page (`/jobs/manual`).
3. Paste the job URL and/or the full job description text.
4. Click **Save**. The system will normalize, score, and dedupe it just like any other job.

> **Or use the Chrome extension**: See [Part 18 — Advanced Features](#part-18--advanced-features) for the Chrome extension workflow.

### Run history

To see a log of all past searches: click **Settings** in the left sidebar → scroll to the **Admin and supporting tools** card → click **Search runs** (`/runs`). Each run shows when it started, how long it took, how many jobs were found, and any errors.

> [PART_COMPLETE:6]
>
> **You've run a search. Now let's see what it found and decide what to do with it.** Continue to Part 7 — The Jobs Queue.

---

## Part 7 — The Jobs Queue (Reviewing What the System Found)

![The Jobs Queue — review borderline matches, approve strong fits, and manage your decision queue](/guide-screenshots/jobs.png)

**What this does:** Shows you the scored list of jobs the system found, lets you approve the ones worth applying to, and reject the ones that are not a fit.

Click **Jobs** in the left sidebar (`/jobs`).

### Reading the Jobs table

Each row represents one job. The columns are:

| Column | What it means |
|---|---|
| **Score chip** | A colored badge: green = 85+, yellow = 72+, gray = below 72 |
| **Title** | Job title and company name |
| **Location** | Remote / city / hybrid |
| **Source** | Where the job came from (Greenhouse, Lever, etc.) |
| **Status** | The job's current state (see below) |
| **Actions** | Approve, Reject, Save for Later |

### Score thresholds explained

- **85 or above (green):** Strong match — the system is highly confident this role fits you well. These are worth reading carefully.
- **72–84 (yellow):** Decent match — worth a quick look. May have some gaps.
- **Below 72 (gray):** Lower confidence or weaker fit. Scan quickly or skip.

The score is made up of three components:

- **Fit Score**: How well your background matches what the job requires (title, skills, seniority, experience)
- **Opportunity Score**: Whether the role is worth the time (salary, remote preference, job freshness, company quality)
- **Confidence Score**: How sure the system is about its evaluation (based on how complete the job description is and how much evidence you have)

### How to review and approve a job

1. Click the job title to open the **Job Detail** page.
2. Read the scoring breakdown: strengths, risks, missing keywords, and evidence references.
3. Read the job description.
4. If you want to apply:
   - Click **Approve**. This moves the job into the packet preparation pipeline.
5. If you do not want to apply:
   - Click **Reject**. A dialog will ask for a reason. Pick the most accurate one.

> **Why the rejection reason matters:** Every rejection is a learning signal. The system uses it to improve scoring for future searches. If you reject a job because the salary is too low, the system will weight compensation higher for similar roles.

### Rejection reason options

- Salary too low
- Not remote
- Wrong seniority level
- Skills mismatch
- Company not a fit
- Already applied elsewhere
- Not interested in the domain
- Job looks stale
- Other (with a text note)

### The Check Duplicates button

On the Jobs page, click **Check Duplicates** to run the duplicate and stale job detector. This will:

1. Group jobs that represent the same opening at the same company
2. Flag listings that appear to be old or re-posted
3. Archive duplicate entries that are already covered by a better record
4. Surface any applied/rejected jobs that somehow re-appeared in the active queue

Run this any time the queue looks noisy or you suspect duplicates.

### Bulk actions

- **Evaluate All**: Runs AI scoring on any jobs that have not yet been scored. Processes up to 25 at a time.
- **Bulk Prepare Packets**: Generates application packets for all approved jobs above a minimum score threshold. You can set the minimum (70–90) and batch size before running.

### Filters

Use the filter bar at the top of the Jobs page to narrow by:
- Status (needs review, approved, rejected, etc.)
- Score range
- Source
- Remote preference
- Date found

> [PART_COMPLETE:7]
>
> **You've reviewed and approved jobs. Now let's build the evidence base the AI will use to write your materials.** Continue to Part 8 — Candidate Evidence.

---

## Part 8 — Candidate Evidence (Your Personal Fact Database)

![Evidence Library — add, verify, and embed career facts that become the AI's only source of truth](/guide-screenshots/evidence.png)

**What this does:** Stores verified facts about your career that the AI uses as its only source of truth when writing resumes, cover letters, and application answers.

Click **Settings** in the left sidebar → scroll to the **Admin and supporting tools** card → click **Evidence library** (`/evidence`).

### What evidence is

Evidence is a structured record of something true about you: a project you built, a skill you have used, an outcome you achieved, a technology you know well. Every claim in every resume and cover letter must trace back to an approved evidence record.

**The system will never invent facts. If evidence does not exist for a claim, the claim does not go in the materials.**

### Evidence confidence levels

| Level | What it means |
|---|---|
| **Verified** | You have confirmed this is accurate and it can be used in final materials |
| **Inferred** | The system extracted this from your resume or GitHub — needs your review |
| **Needs Review** | Flagged as uncertain — shown to you but never silently used in materials |

### How to add evidence

**From your resume:**
Resume bullets you approved in Step 2 of the setup checklist automatically become evidence records.

**By pasting a career note:**
1. On the Evidence library page, click **Add Note**.
2. Paste or type a description of something you have done: a project, a technology, an achievement, a role.
3. The system will structure it and tag it with skills and domains.
4. Review the result and set the confidence to **Verified**.

**From GitHub:**
See [Part 9](#part-9--github-integration-adding-your-projects-as-evidence).

**Backfilling from history:**
If you have been using the app for a while and want to generate evidence from your past applications and materials, click **Backfill Evidence** on the Evidence library page. This creates evidence records from already-approved bullets, generated resumes, and other historical data.

### The Embedding Backfill button

> **Watch out for this one.** For evidence-based search (RAG) to work, each evidence record must have a vector embedding. If you add a lot of evidence at once or see that Jolene cannot find relevant context, click **Backfill Embeddings** on the Evidence library page (click **Settings** → **Admin and supporting tools** → **Evidence library** to get there).

This only needs to be done once after bulk imports. New evidence items get embeddings automatically going forward.

### Reviewing and editing evidence

1. Click any evidence record to open it.
2. You can edit the text, add tags, change the confidence level, or delete it.
3. Set anything you are sure about to **Verified** so the system can use it freely.

> [PART_COMPLETE:8]
>
> **Your evidence library is ready. If you have GitHub projects, now is a great time to sync them.** Continue to Part 9 — GitHub Integration.

---

## Part 9 — GitHub Integration (Adding Your Projects as Evidence)

**What this does:** Reads your public GitHub repositories and converts your README files, project descriptions, topics, and wikis into candidate evidence that gets used in resumes and cover letters.

### Why this matters

If you have built meaningful projects on GitHub, the system can:
- Use those projects as evidence of specific skills (React, TypeScript, GraphQL, etc.)
- Reference your repos when matching you against job requirements
- Include project links in generated application materials
- Run a dedicated **Portfolio Review agent** that analyzes your repos and surfaces skill signals

### Step 1 — Add your GitHub URL to your profile

1. Click **Settings** in the left sidebar (`/settings`).
2. Scroll down to the **GitHub work context** card.
3. In the **GitHub profile URL** field, enter your GitHub profile URL (e.g. `https://github.com/your-username`).
4. Click **Save settings**.

### Step 2 — Sync your repositories

1. Still on the Settings page, scroll to the **GitHub work context** card.
2. Click the **Sync GitHub context** button.
3. The system will call the GitHub API and pull up to 80 of your non-archived repositories, including:
   - Repository name, description, language, and topics
   - Star and fork counts
   - README text (up to ~24,000 characters)
   - Wiki pages (Home, Getting Started, Architecture, Overview) if they exist

> **Optional:** Set `GITHUB_TOKEN=your-personal-access-token` to avoid GitHub API rate limits — in your `.env` file (local) or Vercel environment variables (production). Get a token from [github.com/settings/tokens](https://github.com/settings/tokens) — read-only public repo access is enough.

### Step 3 — Run the Portfolio Review agent

1. After syncing, click the **Review portfolio** button (right next to the **Sync GitHub context** button in the **GitHub work context** card on Settings).
2. The **GitHub Portfolio Review** agent analyzes your synced repositories and produces a structured summary of your skills, project types, and technology patterns.
3. This summary is stored as evidence and informs your job scoring and materials generation.

### Step 4 — Backfill embeddings (if needed)

After syncing GitHub repos, go to the Evidence library (click **Settings** in the left sidebar → **Admin and supporting tools** → **Evidence library**) and click **Backfill Embeddings** to make sure new repo evidence is searchable.

### How repos show up in your materials

When the system generates a resume or cover letter for a job, it will:
1. Look at the job's required and preferred skills
2. Search your evidence (including GitHub repos) for relevant matches
3. Include references to matching projects in the generated content
4. Show evidence citations in the QA report so you can verify the source

> [PART_COMPLETE:9]
>
> **GitHub projects are now in your evidence pool. Let's generate your first tailored resume and cover letter.** Continue to Part 10 — Application Materials.

---

## Part 10 — Application Materials (Resumes and Cover Letters)

![Materials Workspace — manage base resumes, generated variants, and upload parsed versions for evidence](/guide-screenshots/resumes.png)

**What this does:** Generates a tailored resume and cover letter for a specific job, grounded entirely in your verified evidence.

### What an Application Packet is

An **Application Packet** is a bundle prepared for one specific job. It can contain:

- Tailored resume
- Cover letter
- Answers to application form questions
- Recruiter outreach message
- Hiring manager outreach message
- Company brief (research on the company)
- Project links
- Evidence references (which evidence items were used)
- QA warnings

### How to generate a packet

1. Approve a job (see [Part 7](#part-7--the-jobs-queue-reviewing-what-the-system-found)).
2. From the **Job Detail** page, click **Prepare Application**.
3. The system will generate a packet using your approved evidence.
4. When it finishes, you will be taken to the packet review page.

> **Alternatively:** If you have many approved jobs, use the **Bulk Prepare** button on the Jobs page to generate packets for all of them at once.

### Reading the QA report

After a packet is generated, the system runs a QA check and flags any issues:

| Flag type | What it means |
|---|---|
| **Unsupported claim** | A statement in the materials that cannot be traced to your evidence |
| **Generic writing** | A sentence that sounds like a template and does not reflect you specifically |
| **Fake metric** | A number or statistic that was not found in your evidence |
| **Style issue** | Something that reads awkwardly or is too long |
| **Missing evidence** | A skill the job requires that you do not have evidence for |

For each flag, you can:
- Edit the generated text to fix the issue
- Add missing evidence and regenerate
- Dismiss the flag if you disagree (with a note)

### Packet statuses

| Status | What it means |
|---|---|
| **Draft** | Generated but not yet reviewed |
| **Needs Review** | Has QA flags that need your attention |
| **Approved** | You have reviewed it and it is ready to use |
| **Submitted** | Used in an application that was submitted |
| **Archived** | No longer active |

### Approving a packet

1. Read through the resume, cover letter, and any application answers.
2. Make edits as needed (the editor is in the packet detail page).
3. Click **Approve Packet**. The job moves to **Ready to Apply** status.

### Resume profiles and variants

You can maintain multiple resume variants for different types of roles (e.g. one emphasizing frontend work, another emphasizing full-stack product experience):

1. Click **Settings** in the left sidebar → **Admin and supporting tools** → **Materials workspace** (`/resumes`) → click **Open** on the **Resume Variants** card (`/resumes/variants`).
2. Create or edit a resume profile variant with a different headline, summary, or skills emphasis.
3. When generating a packet, the system picks the most appropriate variant for the job type.

### Custom opportunity (recruiter brief → tailored resume)

If a recruiter sends you a brief about a role that is not yet in the system:

1. Click **Settings** in the left sidebar → **Admin and supporting tools** → **Materials workspace** (`/resumes`) → click **Open** on the **Custom Opportunity** card (`/resumes/custom-opportunity`).
2. Paste the recruiter brief.
3. Click **Generate Custom Resume**. The system will infer the role details and generate a tailored resume.

This creates a resume only — it does not create a job tracker entry unless you later apply through the normal flow.

### Downloading materials

From any generated resume or cover letter:
- Click **Download PDF** for a formatted PDF
- Click **Plain Text** for an ATS-friendly plain text version

> [PART_COMPLETE:10]
>
> **Your materials are ready. Let the Recruiting Agency process your matches automatically so you don't have to handle every job by hand.** Continue to Part 11 — The Recruiting Agency.

---

## Part 11 — The Recruiting Agency (Hands-Off Packet Prep)

![The Apply Sprint hub — run the recruiting agency, prepare packets, and launch the browser assistant from one surface](/guide-screenshots/applications.png)

**What this does:** Automatically reviews your strongest job matches, approves the best ones, and prepares complete application packets — so you do not have to process every job manually.

### What the Recruiting Agency is

The **Recruiting Agency** is an AI workflow (powered by LangGraph) that runs automatically after each job search. Think of it as having a recruiter on your team who:

1. Reviews all jobs that scored 90 or higher
2. Approves the ones that genuinely make sense for your background
3. Prepares a full application packet for each approved job
4. Marks them as **Ready to Apply** so you can launch Apply Sprint

Jobs that scored between 60–89 stay in your **Jobs queue** for manual review (the "exception queue"). The Agency only processes the highest-confidence matches.

### How it runs

**Automatically:** After each job search, the system checks whether any 90+ matches exist that have not been processed. If so, it starts the Agency automatically.

**Manually:** From the **Command Center** (click **Command Center** in the left sidebar) or the **Apply Sprint** page (click **Apply Sprint** in the left sidebar), click **Run Recruiting Agency**. You can set:
- **Minimum score**: Only process matches above this threshold (default: 90)
- **Batch limit**: How many jobs to process in this run

### Reading the Agency panel

The Agency panel shows a live view with these metrics:

| Metric | What it means |
|---|---|
| **Found** | Number of strong matches the Agency is reviewing |
| **Approved** | Matches the Agency approved as worth applying to |
| **Packets prepared** | Number of complete application packets generated |
| **Failed** | Matches that ran into an error during preparation |

Below the metrics is a live **event log** showing what the Agency is doing at each step.

### Agency run statuses

| Status | What it means |
|---|---|
| **Running** | The Agency is actively working |
| **Completed** | All matches were processed |
| **Partial** | Some succeeded, some failed |
| **Failed** | Encountered an error that stopped the run |
| **Stale** | A run that started but never finished (can be repaired) |

### Repair, Retry, and Cancel

- **Repair**: If a run went stale or got stuck, click **Repair** to clean up its state and allow it to run again.
- **Retry**: Re-runs failed matches from the last run.
- **Cancel**: Stops a running Agency run immediately.

### What to do after the Agency finishes

1. Check the Jobs queue — look for jobs now showing **Ready to Apply** status.
2. Review any packets the Agency prepared (they may have QA flags for your attention).
3. Go to **Apply Sprint** to start submitting.

> [PART_COMPLETE:11]
>
> **The Agency has prepared your packets. Now let's submit them with the browser assistant.** Continue to Part 12 — Apply Sprint.

---

## Part 12 — Apply Sprint (The Browser Assistant)

![Apply Sprint — the browser assistant console shows which application is loaded and its current step](/guide-screenshots/apply-sprint.png)

**What this does:** Opens a real browser, goes to the job application page, fills in your information automatically, and then stops — waiting for you to click Submit yourself.

> **Important safety rule:** The assistant will NEVER click Submit for you. It always stops before the final step. You review everything and decide.

### Before you start

The browser assistant requires Python and Playwright. Install them once:

```bash
npm run assistant:install
```

This installs the Python dependencies and Playwright browsers.

> **Running the app in production (Vercel)?** The **Launch Assistant** button is disabled when you access the app from a non-localhost URL as a security measure. See [Apply Sprint in Production](#apply-sprint-in-production) in Part 1 for your options — the short version is: run the assistant from a local copy of the repo pointed at your production database, or use the Chrome extension's "Fill from Job Search OS" instead.

### Starting Apply Sprint

1. Click **Apply Sprint** in the left sidebar (`/applications/assistant`).
2. You will see a list of **Ready to Apply** applications — these are jobs with approved packets.
3. Click **Launch Assistant** next to the application you want to start.
4. A browser window will open automatically.

### What happens in the browser

The assistant will:

1. Navigate to the application URL
2. Fill in safe, known fields: name, email, phone, location, LinkedIn URL, portfolio URL, GitHub URL
3. Upload your tailored resume and cover letter (when upload buttons are visible)
4. Fill in application questions using answers from your packet
5. Report its progress back to the Apply Sprint panel in the app

When it hits a field it does not know how to answer safely, it **pauses** and creates a **Needs Me** item for you. You answer the question in the app, then the assistant resumes.

When the assistant is done filling, it stops at the **Ready to Submit** stage. The browser stays open, you review everything on screen, make any changes you want, and then click Submit yourself.

### The Apply Sprint panel (what to watch)

The panel in the app shows:
- Which field is being filled right now
- Progress through the form
- Any blockers (fields the assistant could not fill)
- Logs of what was filled and what was skipped

### Field memory — how the assistant learns

When the assistant fills a field or when you fill a field manually while the assistant is watching, it can save that answer for next time.

- **Auto-use fields**: Safe, non-sensitive fields like name, email, phone, LinkedIn URL. Saved and reused automatically.
- **Ask-first fields**: Custom questions and anything that might vary by job. The assistant will ask you before reusing.
- **Never saved**: Passwords, CAPTCHA, SSN, credit card, resume uploads, cover letter uploads.

To review and edit what the assistant has learned:

1. Click **Field Learning** in the left sidebar (`/applications/field-learning`).
2. You will see all saved field memories.
3. Edit, delete, or change the policy (auto-use vs. ask-first) for any entry.

### The Question Helper

When an application has an unusual question the assistant has not seen before:

1. The assistant creates a **Needs Me** item for that question.
2. Open Needs Me and click on the item.
3. The **Question Helper** button generates 3–5 grounded answer options based on your evidence.
4. Pick the one that fits best, or write your own.
5. Optionally save the answer to answer memory so it can be reused next time.

### What to do if the assistant gets stuck on Ashby

Ashby (a common ATS) sometimes detects automated browsers and shows an anti-spam block. When this happens:

1. The assistant stops and creates a Needs Me item labeled **ATS spam block — use normal Chrome**.
2. Open the application in your regular Chrome browser manually.
3. Install the Chrome extension (see [Part 18](#part-18--advanced-features)).
4. Click **Fill from Job Search OS** in the extension. It will fill safe fields using your packet, without triggering Ashby's spam detection.
5. You complete and submit the form manually.

### Resetting an application for testing

If you want to re-run the assistant on an application (for example, to test a new form or retry after a fix):

1. Click **Apply Sprint** in the left sidebar → select the application.
2. Click **Reset** (the test reset button).
3. This clears the automation run history and open blockers for that application, so the assistant can start fresh.
4. The job, application, and field memory are not affected.

> [PART_COMPLETE:12]
>
> **The browser assistant has filled your applications. If anything needed your input along the way, it's waiting here.** Continue to Part 13 — Needs Me.

---

## Part 13 — Needs Me (Your Inbox for Blockers)

![Needs Me — your inbox for decisions the AI flagged and cannot safely resolve without your input](/guide-screenshots/needs-me.png)

**What this does:** Collects everything the AI could not safely decide on its own, and asks you to resolve it before work can continue.

Click **Needs Me** in the left sidebar (`/needs-me`).

### What creates a Needs Me item

| Source | Example |
|---|---|
| **Apply Sprint assistant** | "What is your answer to: Describe your experience with Kubernetes?" |
| **Apply Sprint assistant** | "Ashby spam block detected — please fill this form manually" |
| **Email sync** | "Received an email from Stripe — is this a rejection or an interview invite?" |
| **Duplicate detection** | "Found two applications for the same job — which one should we keep?" |
| **Recruiting Agency** | "Missing evidence for a required skill — can you confirm your experience with X?" |

### How to resolve a blocker

1. Click the item to open it.
2. Read the question or situation.
3. Provide your answer or take the recommended action.
4. Click **Resolve**.

> **What just happened?** Resolving a Needs Me item sends the answer back to whatever agent or workflow was waiting. If the Apply Sprint assistant was paused, it will resume automatically from where it stopped.

### Staying on top of Needs Me

The **Command Center** shows a preview of open Needs Me items every time you visit. If there are blockers, they will appear in the Daily Plan too. Check Needs Me at least once a day during an active search.

> [PART_COMPLETE:13]
>
> **Blockers are cleared. Let's check where all your applications stand.** Continue to Part 14 — Application Tracker.

---

## Part 14 — Application Tracker

**What this does:** Tracks every application you have — from the moment a job is approved all the way through offer or rejection.

Click **Applications** in the left sidebar (`/applications`).

### Application status pipeline

Applications move through these stages:

| Status | What it means |
|---|---|
| **Discovered** | Job found but not yet approved |
| **Agency Review** | The Recruiting Agency is evaluating it |
| **Ready to Apply** | Packet approved, assistant ready to launch |
| **Applied** | You have submitted the application |
| **Recruiter Screen** | A recruiter has reached out |
| **Tech Screen** | A technical screen or coding assessment |
| **Onsite / Panel** | An in-person or multi-round interview |
| **Final** | Final round interview |
| **Offer** | An offer has been extended |
| **Rejected** | The company passed |
| **Ghosted** | No response after a reasonable time |
| **Closed** | Withdrawn or no longer active |

### Application detail page

Click any application to open its detail page. You will find:

- **Packet**: The resume, cover letter, and answers prepared for this job
- **Outcomes**: Email-synced and manually logged events
- **Interview Prep**: AI-generated talking points and prep tasks (appears after an interview is scheduled)
- **Thank-You Drafts**: Draft messages you can generate after interviews (see below)
- **Assistant controls**: Launch, resume, or reset the Apply Sprint assistant for this application
- **Company Research**: A brief on the company pulled from saved context
- **Compensation Notes**: Salary data and negotiation signals

### Marking an application as applied

If you submitted an application manually (without the assistant):

1. Open the application detail page.
2. Click **Mark as Applied**.
3. Enter the date and any notes.

### Thank-you draft generator

After an interview or recruiter call:

1. Open the application detail page.
2. Scroll to **Thank-You Drafts** and click **Generate Draft**.
3. Fill in:
   - Interview stage (recruiter screen, hiring manager, technical, panel, final, informational, or custom)
   - Interviewer name and title
   - Interviewer LinkedIn URL (optional)
   - Interview date
   - Tone (professional, warm, etc.)
   - Notes about what you discussed
4. Click **Generate**. The system creates:
   - A full email draft
   - A shorter LinkedIn message variant
5. Copy and send the draft manually. The system does not send email.

### The Integrity Repair tool

Over time, data can drift — for example, a job might still show as "ready to apply" even though you already submitted the application through email. 

To fix inconsistencies:

1. From the Command Center, find the **Integrity Audit** section.
2. If issues are found, click **Run Repair**.
3. The tool reconciles your tracker against email outcomes, assistant run history, and duplicate records.

> [PART_COMPLETE:14]
>
> **The tracker is keeping score. Let's connect your email so outcomes update automatically.** Continue to Part 15 — Email and Outcomes.

---

## Part 15 — Email and Outcomes

**What this does:** Jolene's Email Operations team reads recent job-related emails, updates clear internal outcomes, drafts calendar actions, and reports anything uncertain back to Jolene, Chief of Staff.

### How to connect your email

Choose the method that works for your provider. All three options are configured from **Settings**: click **Settings** in the left sidebar → scroll to the **Inbound email sync** card.

#### Option A — IMAP (works with most email providers)

1. Find your email provider's IMAP settings (usually in your email account's security or settings page).
2. Add these variables to your `.env` file (local) or Vercel environment variables dashboard (production):

   ```
   JOB_EMAIL_IMAP_HOST=imap.gmail.com
   JOB_EMAIL_IMAP_USER=you@gmail.com
   JOB_EMAIL_IMAP_PASSWORD=your-app-password
   EMAIL_SYNC_SECRET=make-up-a-secret-phrase
   ```

   > For Gmail: use an **App Password** (not your regular password). Generate one at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).

3. Restart the app (local) or redeploy (production).
4. Click **Settings** in the left sidebar → scroll to the **Inbound email sync** card to verify the connection.

#### Option B — Gmail OAuth (recommended for Gmail users)

1. Set up a Google Cloud OAuth app (you only do this once). The redirect URI should match your app URL:
   - **Local:** `http://localhost:3000/api/email/oauth/gmail/callback`
   - **Production:** `https://your-app.vercel.app/api/email/oauth/gmail/callback`
2. Add to your `.env` file (local) or Vercel environment variables (production):

   ```
   GMAIL_OAUTH_CLIENT_ID=your-client-id
   GMAIL_OAUTH_CLIENT_SECRET=your-client-secret
   GMAIL_OAUTH_REDIRECT_URI=https://your-app.vercel.app/api/email/oauth/gmail/callback
   ```

3. Restart the app (local) or redeploy (production).
4. Click **Settings** in the left sidebar → scroll to the **Inbound email sync** card → click **Connect Gmail**.
5. Sign in and grant read permission.

> **Production note:** In Google Cloud, add both the localhost and production redirect URIs to your OAuth app's "Authorized redirect URIs" list. That way the same OAuth app works for both environments.

#### Option C — Outlook OAuth

1. Register an app in the [Azure portal](https://portal.azure.com). Add redirect URIs for both environments:
   - **Local:** `http://localhost:3000/api/email/oauth/outlook/callback`
   - **Production:** `https://your-app.vercel.app/api/email/oauth/outlook/callback`
2. Add to your `.env` file (local) or Vercel environment variables (production):

   ```
   OUTLOOK_OAUTH_CLIENT_ID=your-client-id
   OUTLOOK_OAUTH_CLIENT_SECRET=your-client-secret
   OUTLOOK_OAUTH_REDIRECT_URI=https://your-app.vercel.app/api/email/oauth/outlook/callback
   ```

3. Restart the app (local) or redeploy (production).
4. Click **Settings** in the left sidebar → scroll to the **Inbound email sync** card → click **Connect Outlook**.

### How Jolene Email Operations works

Once connected, email scanning runs automatically every hour and can also be triggered from **Command Center** → **Email Ops** (`/dashboard/email-ops`). It will:

1. Fetch recent messages from your configured mailbox.
2. Search broadly for job-response mail and also use application-specific watchlist queries.
3. Match messages to applications/jobs using threads, sender domains, company names, role titles, ATS context, and prior email history.
4. Have specialist agents classify and review each relevant message:

| Classification | What triggers it |
|---|---|
| **Rejection** | "We've decided to move forward with other candidates", "not selected", etc. |
| **Interview Request** | "Schedule a call", "Would you be available for an interview?", etc. |
| **Coding Assessment** | HackerRank, Codility, take-home links |
| **Offer** | "We'd like to extend an offer" |
| **Recruiter Response** | General recruiter follow-up |
| **Automated Confirmation** | "Thank you for applying" auto-reply |
| **Needs Review** | The system was not sure — creates a Needs Me item |

5. Store a durable Email Ops finding with the source email, confidence, evidence, recommended action, and provenance.
6. Auto-apply only high-confidence internal updates such as clear rejections and application confirmations.
7. Create Jolene approval items for offers, ambiguous matches, recruiter replies, interview/scheduling changes, response drafts, employer contact, and anything below the confidence threshold.

The specialist team is:

- **Email Inbox Scout**: scans Gmail/IMAP/Outlook-capable inbox sources.
- **Application Matcher**: links messages to applications and jobs.
- **Outcome Classifier**: detects rejections, confirmations, interviews, assessments, offers, follow-ups, and ambiguous messages.
- **Scheduling Coordinator**: extracts scheduling links, proposed times, deadlines, and prep needs.
- **Action Drafter**: prepares reply/availability draft intent, but never sends.
- **Privacy Reviewer**: blocks unsafe or unsupported updates.
- **Email Ops Reporter**: reports the summary back to Jolene.

### Calendar drafts

When Email Ops finds an interview invite, assessment deadline, or scheduling request, it creates an in-app calendar draft. Drafts can include the role, company, source email, meeting link, timezone, attendees, and confidence score.

V1 does **not** write directly to Google Calendar or Outlook Calendar. Calendar drafts stay in the app until you approve what should happen next.

### Manual Email Ops run

You can trigger the full Email Ops workflow manually:

1. Click **Command Center** in the left sidebar.
2. Click the **Email Ops** subnav.
3. Click **Run Email Ops**.
4. Review findings, approvals, and calendar drafts.

The older **Sync Now** control in Settings still ingests messages, but Email Ops is the richer workflow that reports back to Jolene.

### Outcome analytics

Click **Settings** in the left sidebar → **Admin and supporting tools** → **Outcome analytics** (`/outcomes`) to see aggregate data about your search:

- Applied-to-callback rate
- Which sources are producing the most interviews
- Which search profiles are generating the best outcomes
- Rejection rate by company type or industry

### Interview prep tasks

When an interview is detected (either by email sync or by manually updating an application status), the system creates interview prep tasks:

1. Open the application detail page.
2. Find the **Interview Prep** section.
3. You will see:
   - Likely interview themes based on the job description
   - Evidence-backed talking points mapped to those themes
   - Risks and gaps to prepare for
   - Specific projects to reference

Click any task to expand it with more detail.

> [PART_COMPLETE:15]
>
> **Email is connected and outcomes are tracking. Meet Jolene — your AI assistant that's available on every screen.** Continue to Part 16 — Jolene.

---

## Part 16 — Jolene (Your Always-On AI Assistant)

**What this does:** Jolene acts as your Chief of Staff. She reviews agent activity, blockers, pipeline state, Email Operations, market signals, LinkedIn signals, and your career mission, then tells you what deserves attention next.

**Where to see Jolene first:** Open **Command Center** (`/dashboard`). The **Jolene, Chief of Staff** card shows her latest operating brief with priorities, rationale, evidence, links, approval buttons, and ask-Jolene actions.

The card also shows Jolene's **Operating Loop** status. The operating loop is not a separate assistant; it is the planner/scheduler layer under Jolene that checks system signals, refreshes the Chief of Staff brief, proposes internal child-agent work, and shows what was skipped for safety.

**How to open chat:** Click the floating **Ask Jolene** button in the bottom corner of any page. It opens a slide-out drawer.

### What Jolene can do

Jolene is aware of where you are in the app and what data is relevant. She can:

- Produce a Chief of Staff brief from recent agent runs, blockers, pipeline state, Email Operations, market signals, LinkedIn content/analytics, and your career mission
- Run an Operating Loop pass that monitors system freshness, proposes the next internal agents to run, and records skipped/blocked work
- Show proactive priority cards on the Command Center with rationale, evidence, and links to the relevant page
- Propose delegated work for other agents, then wait for your approval before launching it
- Explain why a specific job scored the way it did
- Show you the cover letter or packet for any application
- Find an application by company name
- Run Email Operations and summarize what changed in your inbox
- Answer interview and positioning questions using your actual career evidence
- Suggest what to do next on the current page
- Explain what a setting or feature does
- Diagnose state issues (e.g. "Why is this job still showing as ready when I applied last week?")
- Trigger safe internal actions (with your confirmation)

### Asking a question

Just type your question naturally in the chat input. Examples:

- "Why did this job only score 68?"
- "Find the cover letter for my Stripe application"
- "What should I say if they ask about my experience with GraphQL?"
- "What are my top 3 actions today?"
- "Run a duplicate check"

### What Jolene looks up before answering

Before responding, Jolene searches your local data:

- Generated cover letters and resumes
- Application packets and job records
- Approved candidate evidence (for career questions)
- Recent outcomes and interview notes

This means her answers are grounded in your actual data, not generic advice.

### Jolene Actions (with your confirmation)

Jolene can propose and execute certain safe actions inside the app. In chat, those appear as **confirmation cards** under her message. On the Command Center, they appear as **Approve** buttons on her Chief of Staff priority cards. You must approve before delegated work runs.

The Operating Loop follows the same rule. Clicking **Run Operating Loop** on `/dashboard` lets Jolene inspect the current system state and create a plan. The loop may refresh Jolene's brief and create approval cards automatically, but specialist teams stay pending until you approve the proposed internal action.

**Actions she can run after confirmation:**
- Application integrity repair
- Duplicate/stale job detection
- Jolene Email Operations
- Daily Command Center refresh
- Market Intelligence refresh
- LinkedIn content draft generation
- Jolene Chief of Staff brief generation
- Repair, retry, or cancel an agent run (when she has the run ID)

**Actions that always remain manual (Jolene explains but does not execute):**
- Submitting applications
- Sending email or outreach messages
- Publishing LinkedIn posts
- Writing directly to external calendars
- Approving or rejecting jobs or applications in bulk
- Changing profile settings

### Jolene Operating Loop

The operating loop is the answer to "Do we have an orchestrator?" Jolene is the visible orchestrator persona, and the operating loop is the internal pass that does the monitoring and planning.

Each loop run:
- Reads current system signals such as open requests, failed or stale agents, Email Ops freshness, search freshness, market freshness, pipeline counts, ready-to-apply work, LinkedIn draft/analytics status, and career standup signals
- Creates a `JOLENE_OPERATING_LOOP` agent run
- Refreshes a `JOLENE_CHIEF_OF_STAFF` brief as a child run
- Stores recommended actions, skipped actions, approval-needed work, and child-run status
- Shows the latest status on the Command Center

The default autonomy policy is **propose first**. Scheduled loop runs are useful because they keep Jolene current, but they still create plans and approval cards instead of taking risky action.

### Jolene Chief of Staff and career standups

The older Career CEO mode is now part of Jolene's Chief of Staff role. She still tracks the high-urgency income sprint, but it no longer behaves like a separate assistant.

**To set up your Career Mission:**

1. Ask Jolene: "Set up my career mission"
2. She will ask for:
   - Your target minimum and ideal salary
   - Sprint length (e.g. 30 days)
   - Urgency mode (aggressive vs. measured)
   - Your top 3 acceptable role types
   - Any dealbreakers

**To get a Jolene career brief:**
Ask Jolene: "Give me a career brief" or "What are my money moves today?"

She will create a Chief of Staff brief and return:
- Your top income-relevant actions ranked by urgency
- Current pipeline leverage (how many strong shots you have in progress)
- Compensation risks (salary gaps, below-target offers)
- Recommended sprint actions

**Daily standups:**
Ask Jolene: "Run my career standup". She creates a Chief of Staff run, compares today's state to your last snapshot, and tells you whether your income momentum is improving, flat, or regressing.

### Chief of Staff APIs

Most users do not need these, but they are useful for debugging:

```bash
curl http://localhost:3000/api/jolene/chief-of-staff
curl -X POST http://localhost:3000/api/jolene/chief-of-staff/run
curl -X POST http://localhost:3000/api/jolene/chief-of-staff/approve \
  -H "content-type: application/json" \
  -d '{"runId":"RUN_ID","proposalIds":["proposal_run_market_intelligence"]}'
curl http://localhost:3000/api/jolene/operating-loop
curl -X POST http://localhost:3000/api/jolene/operating-loop/run
curl -X POST http://localhost:3000/api/jolene/operating-loop/approve \
  -H "content-type: application/json" \
  -d '{"runId":"RUN_ID","proposalIds":["loop_work_email_ops"]}'
curl http://localhost:3000/api/cron/jolene-operating-loop \
  -H "authorization: Bearer $CRON_SECRET"
```

Approval only launches app-internal delegated work. Jolene still cannot publish LinkedIn posts, submit applications, send recruiter/employer messages, or make destructive bulk changes without the existing explicit user gates.

### Voice mode

Jolene supports voice input and output in supported browsers:

1. Click the **microphone icon** in Jolene's drawer to dictate your question.
2. Click the **speaker icon** to have Jolene's response read aloud.
3. For hands-free mode: say **"hey Jolene"** followed by your question, then say **"over"** when you are done. She will respond verbally.

### Conversation history

Each page in the app has its own conversation thread with Jolene. A conversation on a job detail page stays attached to that job. A settings conversation stays in settings context. This keeps things organized across different parts of your workflow.

> [PART_COMPLETE:16]
>
> **Jolene is ready to help on every screen. Let's review the settings that control everything.** Continue to Part 17 — Settings Reference.

---

## Part 17 — Settings Reference

![Settings — configure agent quality, outcome calibration, email sync, profiles, and notification preferences](/guide-screenshots/settings.png)

**What this does:** Controls every configurable option in the app.

Click **Settings** in the left sidebar (`/settings`).

> **Local vs. Production:** Settings you configure in the app's UI (notifications, cron schedule, automation policy, email connections, profile links) are stored in the database and work the same in both environments. Settings controlled by environment variables (API keys, secrets, OAuth credentials) are set in your `.env` file locally, or in **Vercel → Settings → Environment Variables** in production.

### Provider Keys

| Setting | What it controls |
|---|---|
| **OpenAI API Key** | AI scoring, resume generation, Jolene, market intelligence |
| **OpenAI Model** | Which GPT model to use for general app features. Default: `gpt-4.1-mini` |
| **LinkedIn content model** | Which GPT model to use for `/linkedin-content` drafts. Default: `gpt-5.5` |
| **LangSmith Tracing** | Optional observability for agent runs. Set `LANGSMITH_TRACING=true` and add an API key to enable |
| **ADK Enabled** | Enables Google Gemini as the "control plane" for the Daily Command Center, Market Intelligence, and Jolene's operator mode |

### Job Search Schedule

1. Find **Cron Schedule** in Settings.
2. Choose how often to run automatic searches (daily is recommended).
3. The default scheduled time is 14:00 UTC (7:00 AM Pacific, 10:00 AM Eastern).

You can also run searches manually at any time from the Command Center.

> **Local vs. Production:** Locally, the cron schedule in Settings tells the app *when* to run, but the job only fires if something calls the endpoint at that time (the Settings page has a "Run scheduled search now" button for testing). **In production on Vercel**, `vercel.json` configures three cron jobs that Vercel calls automatically: job search at 14:00 UTC, email sync every hour, and the recruiting agency at 15:30 UTC. No additional setup is needed. You must have `CRON_SECRET` set in your Vercel environment variables or the cron calls will be rejected.

### Automation Policy

Controls how much the system does automatically without asking you:

| Setting | What it controls |
|---|---|
| **Auto-prepare packets** | Whether the system automatically generates packets for approved jobs |
| **Minimum score for auto-prep** | Only auto-prepare packets for jobs above this score |
| **Per-company overrides** | Set a custom policy for a specific company (always manual, always allow, or inherit global setting) |

> **Safety note:** Even with automation enabled, the system never submits applications automatically. Auto-prep just generates the materials — you still approve and submit.

### Email Configuration

- IMAP credentials
- Gmail and Outlook OAuth connections
- Email sync frequency
- Number of emails to fetch per sync

### Notifications

- Email notification address
- Pushover push notification credentials
- Which events trigger notifications (new strong matches, Agency completions, Needs Me items, etc.)

### Sources

- Manage the list of companies and job boards to check
- Enable/disable individual sources
- Configure the Search Query Backlog (requires Brave API key)

### GitHub Sync

- Your GitHub profile URL
- Sync button and sync history
- Portfolio review agent trigger

### Admin and Supporting Tools (from Settings page)

Scroll to the **Admin and supporting tools** card on the Settings page. You will see a row of buttons:

| Button label | Where it goes | What you do there |
|---|---|---|
| **Search profiles** | `/profiles` | Search profile management |
| **Evidence library** | `/evidence` | Candidate evidence library |
| **Company sources** | `/sources` | Job source and company watchlist management |
| **Agent board** | `/agents` | Agent run history and monitoring |
| **Materials workspace** | `/resumes` | Hub for resume sub-pages |
| **Generated materials** | `/resumes/generated` | All generated resumes and cover letters |
| **Networking** | `/networking` | Networking strategy panel |
| **Outcome analytics** | `/outcomes` | Outcome data |
| **Search runs** | `/runs` | Job search run history |

> [PART_COMPLETE:17]
>
> **Settings are dialed in. Ready to go deeper? There are a few powerful optional tools worth knowing about.** Continue to Part 18 — Advanced Features.

---

## Part 18 — Advanced Features

These features are optional but add significant power to your workflow once you are comfortable with the basics.

### Chrome Extension

The Chrome extension lets you capture jobs you find while browsing and submit applications directly from within the employer's own website.

#### Installing the extension

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer Mode** (toggle in the top right).
3. Click **Load unpacked**.
4. Select the `chrome-extension/` folder inside this project.
5. Set `BROWSER_EXTENSION_TOKEN=make-up-a-secret` — in your `.env` file (local) or Vercel environment variables (production) — and restart or redeploy.

#### Capturing a job from any website

1. Browse to a job posting on any website (company site, job board, etc.).
2. Click the Job Search OS extension icon in your Chrome toolbar.
3. Click **Capture Job**.
4. The job is sent to your app, scored, and added to your Jobs queue.

> **Bonus feature:** If the captured job matches zero of your current profiles, the system automatically creates a new profile tailored to that job type and scores it immediately. This means the system learns from jobs you find interesting. Saved Chrome jobs with a persisted match are also marked approved and get an application tracker automatically, so they can be prepared through Apply Sprint.

#### Launching Apply Sprint from the extension

After saving a job and approving a packet:

1. Navigate to the application URL (the actual form page).
2. Click the extension icon.
3. Click **Apply Now**. The assistant will launch and begin filling the form.

#### "Fill from Job Search OS" (for Ashby and manual forms)

When the automated assistant gets blocked (especially on Ashby):

1. Open the application in your normal Chrome browser.
2. Navigate to the form page.
3. Click the extension icon.
4. Click **Fill from Job Search OS**. The extension will fill safe known fields using your packet without triggering spam detection, highlight any fields that need manual attention, and leave the Submit button for you to click.

### MCP Server (for external AI tools)

The **MCP (Model Context Protocol) server** exposes the app's data and operations as tools that any MCP-compatible AI agent (like Claude Desktop, GPT-4, etc.) can use.

**When to use it:** If you use an external AI coding assistant or agent that supports MCP, you can connect it to your Job Search OS to let it query your jobs, applications, evidence, and run searches on your behalf.

**Starting the MCP server:**

```bash
npm run mcp:server
```

> **Always runs locally.** The MCP server is a local stdio process that cannot be deployed to Vercel. Set `JOB_SEARCH_OS_APP_URL` to wherever your app is running — `http://localhost:3000` for a local app, or `https://your-app.vercel.app` for a production deployment. Either way, the MCP server itself runs on your machine.

### Outcome Calibration and the Quality Loop

The system continuously analyzes its own performance and proposes improvements:

1. Click **Settings** in the left sidebar → scroll to the **Outcome calibration** card.
2. You will see signals like:
   - Applied-to-callback rate trends
   - High-score matches that were rejected
   - Duplicate groups that keep reappearing
   - Assistant failures
3. Each signal has a **Propose Action** button that converts it into a review-only improvement proposal.

**Learning Impact** (scroll further down on the Settings page, to the **Learning impact** card) shows you:
- Which learned rules are currently active
- Whether each rule is helping or hurting your outcomes
- Rules that have been auto-rolled back because they were making things worse

**Accepting a proposal:**
1. Click **Settings** in the left sidebar → scroll to the **Outcome calibration** card.
2. Find an open proposal.
3. Read the proposed change.
4. Click **Accept** (for low-risk changes, this creates a bounded skill rule) or **Dismiss** (if you disagree).

**Important:** High-risk changes (like modifying how an agent behaves) always stay as review-only. They are never applied automatically.

### The Agents Board

Click **Settings** in the left sidebar → **Admin and supporting tools** → **Agent board** (`/agents`) to see a history of every agent run — job searches, recruiting agency runs, assistant workflows, and more.

For each run you can:
- See the input, output, and status
- View the event log
- Click **Repair** if a run got stuck
- Click **Retry** to re-run a failed run
- Click **Cancel** to stop a running run

This is useful for debugging if something seems to have gone wrong in the background.

### Market Intelligence Brief

Get a weekly overview of your job market based on your own pipeline data combined with external labor-market research:

1. Click **Command Center** in the left sidebar (`/dashboard`).
2. Scroll to the **Market Analysis** section.
3. Click **Run market brief**.

The brief includes:
- An overview summary with confidence, data freshness, top lane, and top skills
- Analytical charts for role-lane demand, skill demand, profile health, market trends, action mix, source coverage, and match quality distribution
- Cited article/news cards with source links, claims, relevance, confidence, excerpts, and practical implications
- Review-only suggestions for profile adjustments, positioning, company targeting, and outreach
- Search-learning audit details when the brief safely applies additive keyword or company signals

This never removes or broadly changes your profiles automatically. Low-risk additive keyword/company signals may be applied with caps; higher-risk changes stay review-only.

> [PART_COMPLETE:18]
>
> **You've covered every feature. Let's put it all together into a daily routine.** Continue to Part 19 — Your Daily Workflow.

---

## Part 19 — Your Daily Workflow (Putting It All Together)

Here is how a typical day looks once the system is fully set up.

### Morning (10–15 minutes)

1. Click **Command Center** in the left sidebar.
   - Read the **Daily Plan** — what does the AI think you should focus on today?
   - Check the **Search Run** section — did the overnight cron find new jobs?
   - Check the **Agency Run** section — did the Agency prepare any new packets?

2. Click **Needs Me** in the left sidebar.
   - Resolve any open blockers. This is the highest-priority action — blockers stop work from moving forward.
   - Usually takes 2–5 minutes.

3. Click **Jobs** in the left sidebar.
   - Sort by score (highest first).
   - Click each 85+ match to read the scoring breakdown.
   - Approve the ones you want to pursue.
   - Reject the rest with a reason. This takes 1 second per job and teaches the system.

### Midday (5–10 minutes, when you have capacity)

4. Click **Apply Sprint** in the left sidebar.
   - Find applications showing **Ready to Apply**.
   - Click **Launch Assistant** for one at a time.
   - Watch the assistant fill the form, answer any Needs Me prompts as they appear.
   - Review the completed form in the browser and click Submit.

5. **Check Jolene** for anything she has noticed.
   - Click the floating **Ask Jolene** button in the bottom corner of any page.
   - Ask: "What's my status today?" or "Are there any applications I should follow up on?"

### Evening (optional, 2–5 minutes)

6. **Check for email updates**.
   - **Production (Vercel):** Email sync runs automatically every hour — new outcomes already appear in Applications when you open it.
   - **Local:** Click **Settings** in the left sidebar → scroll to **Inbound email sync** → click **Sync Now** to trigger a manual sync.
   - New outcomes (rejections, interview invites) will appear in Applications automatically after a sync.

7. **Log any interviews or conversations**.
   - Click **Applications** in the left sidebar → open the relevant application.
   - Update the status if needed.
   - Generate a thank-you draft if you had a call today.

### Weekly (10–15 minutes)

8. **Run Market Intelligence**: click **Command Center** → scroll to **Market Analysis** → click **Run market brief**.
9. **Check Outcome Calibration**: click **Settings** in the left sidebar → scroll to the **Outcome calibration** card to see if any proposals are waiting for your review.
10. **Review and tune Search Profiles**: click **Settings** → **Admin and supporting tools** → **Search profiles** → open any profile that has been producing too many low-quality matches.

---

## Quick Reference

### Local vs. Production feature availability

| Feature | Local | Production (Vercel) |
|---|---|---|
| Web interface (all pages) | Yes | Yes |
| Job search — manual trigger | Yes | Yes |
| Job search — automatic (cron) | Manual only | Automatic via `vercel.json` |
| Email sync — automatic (hourly) | Manual only | Automatic via `vercel.json` |
| Recruiting Agency — automatic | Manual only | Automatic via `vercel.json` |
| Apply Sprint **Launch Assistant** button | Yes | Disabled (use CLI or Chrome extension instead) |
| Chrome extension | Yes | Yes (point to your production URL) |
| MCP server | Yes | Local only (can point to production API) |
| Pushover / email notifications | Yes | Yes |

### Left sidebar (always visible)

| Sidebar item | URL | What you do there |
|---|---|---|
| **Command Center** | `/dashboard` | Daily overview, trigger searches, check pipeline |
| **Needs Me** | `/needs-me` | Resolve blockers and agent questions |
| **Jobs** | `/jobs` | Review and approve/reject scored matches |
| **Apply Sprint** | `/applications/assistant` | Launch the browser assistant |
| **Field Learning** | `/applications/field-learning` | Review and edit autofill field memory |
| **Applications** | `/applications` | Track your full pipeline |
| **Settings** | `/settings` | Configure everything |

### Settings → Admin and supporting tools (buttons on the Settings page)

| Button | URL | What you do there |
|---|---|---|
| **Search profiles** | `/profiles` | Search profile management |
| **Evidence library** | `/evidence` | Manage your verified career facts |
| **Company sources** | `/sources` | Job sources and company watchlist |
| **Agent board** | `/agents` | Monitor agent run history |
| **Materials workspace** | `/resumes` | Hub for resume sub-pages |
| **Generated materials** | `/resumes/generated` | All generated resumes and cover letters |
| **Networking** | `/networking` | Networking strategy panel |
| **Outcome analytics** | `/outcomes` | Outcome data and trends |
| **Search runs** | `/runs` | Job search run history |

### Materials workspace → card "Open" buttons (`/resumes`)

| Card | URL | What you do there |
|---|---|---|
| **Upload Resume** → Open | `/resumes/upload` | Upload a resume file |
| **Review Parsed Profile** → Open | `/resumes/review` | Approve parsed resume bullets |
| **Candidate Profile** → Open | `/resumes/profile` | Skills, work history, verified bullets |
| **Generated Resumes** → Open | `/resumes/generated` | Review generated materials |
| **Custom Opportunity** → Open | `/resumes/custom-opportunity` | Recruiter brief → tailored resume |
| **Resume Variants** → Open | `/resumes/variants` | Manage positioning variants |

---

## Troubleshooting

### "The Jobs queue is empty after a search"

- Check that at least one Search Profile is set to **Active** and has a `minimumMatchScore` of 60 or lower. (Click **Settings** → **Admin and supporting tools** → **Search profiles**.)
- Check that at least one Source is **Enabled**. (Click **Settings** → **Admin and supporting tools** → **Company sources**.)
- Click **Settings** → **Admin and supporting tools** → **Search runs** and look at the last run's logs for errors.
- **Production only:** If the scheduled cron is not running, check that `CRON_SECRET` is set in your Vercel environment variables and that the cron is enabled in the **Search schedule** card in Settings.

### "Jolene gives generic answers that don't know my situation"

- Make sure you have evidence in the library with **Verified** confidence. (Click **Settings** → **Admin and supporting tools** → **Evidence library**.)
- On the Evidence library page, click **Backfill Embeddings**.
- Make sure `OPENAI_API_KEY` is set — in your `.env` file (local) or Vercel environment variables (production).

### "The assistant gets stuck and never fills any fields"

- Run `npm run assistant:install` again to make sure Playwright is properly installed.
- Check that `NEXT_PUBLIC_APP_URL` is set to the correct URL — `http://localhost:3000` in your `.env` file locally, or your Vercel domain in Vercel environment variables for production.
- Click **Settings** → **Admin and supporting tools** → **Agent board** and look for the failed assistant run's event log.
- **Production only:** If you see "The Playwright assistant can only be launched from a local app URL", this is expected — the button is intentionally disabled in the production UI. See [Apply Sprint in Production](#apply-sprint-in-production) in Part 1 for how to run the assistant against your production database.

### "Email sync is not picking up messages"

- Check that `EMAIL_SYNC_SECRET` is set and matches what you configured — in your `.env` file (local) or Vercel environment variables (production).
- Click **Settings** in the left sidebar → scroll to the **Inbound email sync** card to verify your connection status.
- For Gmail App Passwords: make sure 2-Step Verification is enabled on your Google account.
- For Gmail OAuth: make sure your email is added as a test user in your Google Cloud app (until the app is verified).

### "Duplicate jobs keep reappearing"

- Click **Jobs** in the left sidebar → click **Check Duplicates** button at the top of the page.
- Click **Settings** → **Admin and supporting tools** → **Agent board** and look for any recent integrity repair runs.
- Click **Command Center** in the left sidebar → click **Run Repair** in the Integrity section if issues are shown.

---

*Built with care. You are always the decision-maker — this system just does the legwork.*
