# Agentic Job Search Assistant

Personal Agentic AI-powered job search dashboard for reviewing jobs, maintaining search profiles, parsing resumes, and generating truthful ATS-friendly application materials.

## Local Setup

Install dependencies:

```bash
npm install
```

Start the local database, run migrations and seed data, then launch the app:

```bash
npm run dev:local
```

The app uses `DATABASE_URL` from `.env`. The checked-in example points at the Docker Postgres port `5433`; if your existing data is in another local Postgres, keep `.env` pointed there.

Open `http://localhost:3000`.

Or run each step manually:

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
ADK_ENABLED=false
ADK_MODEL=gemini-2.5-flash
RESEND_API_KEY=...
# or
POSTMARK_SERVER_TOKEN=...
NOTIFICATION_FROM_EMAIL="Job Search OS <jobs@example.com>"
PUSHOVER_USER_KEY=...
PUSHOVER_APP_TOKEN=...
BRAVE_SEARCH_API_KEY=...
SEARCH_QUERY_MAX_RESULTS=80
```

With `OPENAI_API_KEY`, resume parsing, job scoring, and resume tailoring use OpenAI structured outputs. Without it, those flows still run through deterministic parsers/scorers so the dashboard remains usable.

Custom recruiter opportunities can be handled from `/resumes/custom-opportunity`. Paste the recruiter brief, extract editable company/title/location/remote details, then generate a resume-only tailored material. The workflow saves a `Recruiter Opportunity` job record and a generated resume, but it does not create an application tracker, cover letter, or application packet unless you open the saved job and use the normal package path. MCP/integration-style briefs automatically emphasize verified Job Search OS stack evidence in the resume Summary and Skills while keeping unsupported requested systems out of claimed skills. Generated outputs can be edited and saved on the custom opportunity page, appear in `/resumes/generated`, and use the existing text/PDF export endpoints.

The primary workflow is agency-first. Running search fetches, dedupes, scores, and saves matches, then automatically hands new 90+ application-ready matches to the recruiting agency when no agency run is already active. The agency approves appropriate jobs, creates application trackers, generates resume and cover-letter packets, and moves them to `ready_to_apply`; borderline roles stay in the Jobs exception queue for manual review. Bulk packet preparation is restricted to already-approved jobs so it cannot bypass agency approval. Application state is reconciled by canonical job identity, so when one duplicate tracker is submitted/applied, stale approved or ready duplicates are archived and sibling job matches are synced. The Dashboard also audits application state integrity across trackers, matches, email confirmations, submitted assistant runs, and resurfaced jobs; use `POST /api/applications/integrity/repair` to run deterministic repairs with audit events. Final application submission remains manual.

Application detail pages also support draft-only interview thank-you messages. Use the Thank-you drafts card to enter the interview stage, interviewer details, date, and conversation notes; the app saves a `ThankYouDraft` with a full email draft and a shorter LinkedIn variant grounded in the application, role, and approved evidence. These drafts are copyable review artifacts only: the app does not send messages, create contacts, record outcomes, or change application status automatically.

Apply Sprint includes an Agency command center designed around this agency-first flow. The primary panel runs the recruiting agency and shows live graph activity, while the operations panel keeps packet preparation, packet sync, sprint-console access, and launch-next-ready actions in a consistent control grid.

Jolene is the persistent in-app operating assistant. In addition to route context, Jolene has deterministic local retrieval tools for app data, so requests like "where is the cover letter for Linear" search generated cover letters, application packets, applications, and jobs before falling back to chat. Matching answers include direct links to generated material exports, application records, job records, and the generated materials page without dumping full cover-letter bodies unless explicitly requested. Jolene also has a career-aware interview coaching path: pasted recruiter success-profile prompts and questions such as "how does this apply to me?" load compact profile, evidence, project, application outcome, and app-building context, then produce grounded interview talking points instead of accidentally running side-effect actions such as email sync. Jolene now also has an ADK app-operator layer for broader app operations: she can run safe internal workflows such as search, dedupe, email sync, Daily Command Center, and Market Intelligence, diagnose cross-page state drift, and return inline confirmation cards for guarded actions.

Jolene confirmation cards execute only app-local internal repairs after explicit user confirmation. The current allowlist includes application integrity repair, duplicate/stale detection, job-response email sync, Daily Command Center refresh, Market Intelligence refresh, and graph-backed agent run repair/retry/cancel when a run id is present. Confirmed actions post to `POST /api/jolene/confirm`, update the source Jolene message, append an execution result message, and may navigate/refresh the related app surface. Jolene does not execute external application submission, email/outreach sending, employer-system interactions, or broad approve/reject/archive mutations; those remain manual or page-routed.

Jolene also has Career CEO mode for urgent, income-focused search execution. The persistent `CareerMission` stores the 30-day high-income sprint mandate, compensation floor and ideal target, role tracks, dealbreakers, fallback paths, capacity notes, and tone preferences. Ask Jolene for a "Career CEO brief" or "money moves" to get the top income-relevant actions from current interviews, ready applications, high-score jobs, follow-ups, blockers, salary gaps, and enabled profiles. The default policy is aggressive but truthful: widen toward credible high-income opportunities, preserve evidence grounding, and keep external actions manual or explicitly confirmed.

Career CEO endpoints:

```bash
curl http://localhost:3000/api/jolene/mission
curl -X PATCH http://localhost:3000/api/jolene/mission \
  -H "content-type: application/json" \
  -d '{"targetCompensationMin":200000,"targetCompensationIdeal":260000,"horizonDays":30}'
curl -X POST http://localhost:3000/api/jolene/career-brief
curl http://localhost:3000/api/jolene/career-standup
curl -X POST http://localhost:3000/api/jolene/career-standup
```

Career CEO standups close the loop across days. `POST /api/jolene/career-standup` creates a `CareerSprintSnapshot` with the current brief, stable money-move statuses, sprint score, income momentum, attention debt, and completed move keys. `GET /api/jolene/career-standup` returns the latest snapshot. Ask Jolene for a "Career CEO standup," "sprint score," or "income momentum" to generate a new snapshot and get the top aging money move, income risks, and urgent next action.

This repo also includes a local `development-agent` skill under `.agents/skills/development-agent`. Use it in future Codex sessions when you want the standard workflow: implement a plan, update README/wiki, run verification, commit, and push.

With `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY`, the app emits redacted metadata traces for agent runs, OpenAI helper calls, the application assistant workflow, and graph-backed recruiting agency runs. Tracing is optional and fail-open: if LangSmith is unavailable, the app continues without tracing. The default trace payload masks resume text, cover letters, raw application answers, prompts, secrets, emails, phone numbers, and full field values while preserving useful debugging metadata such as workflow step, field label, field type, command type, result, status, model, and counts.

ADK is available as an opt-in TypeScript agent control plane with `ADK_ENABLED=true`. In this phase it supervises selected low-risk agents such as Daily Command Center and Market Intelligence by registering their allowed read-only tools, recording ADK runtime metadata on `AgentRun.observabilityJson`, and emitting ADK control-plane events into the normal agent activity feed. Jolene is registered as a guarded ADK app operator and records planned, confirmed, skipped, failed, and executed tool activity in chat `actionJson`. ADK does not replace LangGraph for the application assistant or recruiting agency; those workflows still own durable state, resume, repair, and browser/process coordination.

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

Synced messages are classified as rejection, interview request, assessment, offer, confirmation, or needs review. Matched messages update application outcomes, reconcile duplicate application trackers, create blocker items when action is required, and trigger interview prep for interview/assessment messages.

Application state integrity endpoints:

```bash
curl http://localhost:3000/api/applications/integrity
curl -X POST http://localhost:3000/api/applications/integrity/repair
```

The read endpoint reports drift without mutating data. The repair endpoint runs canonical reconciliation, marks high-confidence email or assistant submitted signals as applied, syncs linked match statuses, records submitted suppressions, and leaves `ApplicationEvent` audit entries.

An hourly email sync cron is configured in `vercel.json` and calls `/api/cron/email-sync` at the top of every hour. It checks connected Gmail OAuth accounts and any configured IMAP mailbox. Set `EMAIL_SYNC_SECRET` or `CRON_SECRET` to require `Authorization: Bearer <secret>` on cron requests.

The manual search run uses enabled external source adapters. Direct ATS sources are prioritized: Greenhouse, Lever, and Ashby. RemoteOK is disabled by default because it creates paid/login application friction, and We Work Remotely is disabled by default because it is an intermediary board rather than a final ATS form. ATS adapters use configured company slugs so the app can search target companies directly, for example:

```json
{ "companySlugs": ["linear", "vercel"] }
```

The seeded `Company Source List` is a curated target list, not a claim that every company is hiring today. `/sources` can add companies with a name, priority, categories, and optional Greenhouse/Lever/Ashby slugs; the app generates default search terms and common ATS slug variants when slugs are omitted. Search runs probe likely company careers/ATS feeds from that list, filter for role families such as React, TypeScript, Next.js, design systems, security/identity, AI tooling, developer platforms, defense tech, geospatial, and enterprise dashboards, then score the resulting roles against enabled profiles.

The Source roadmap on `/sources` distinguishes implemented connectors from enabled runtime sources. `Implemented` means an adapter, query coverage, or manual workflow exists; `enabled` means the source is included in search runs; `planned` means future connector work; `manual` means human/account workflow; and `P1` is priority-one regardless of status. Direct adapters cover Greenhouse, Lever, and Ashby; the Brave-backed `Search Query Backlog` broadens discovery across Workable, SmartRecruiters, iCIMS, Jobvite, BambooHR, Teamtailor, Jobylon, Join, Jobtrain, Bullhorn, Oracle Taleo, SAP SuccessFactors, ZipRecruiter, Dice, Wellfound, Monster, CareerBuilder, SimplyHired, Adzuna, USAJOBS, remote boards, VC portfolios, startup boards, HN, and tech boards. LinkedIn is treated as a discovery signal rather than a scrape target: the app searches for the original employer, ATS, or career-page postings behind LinkedIn-visible roles. Without `BRAVE_SEARCH_API_KEY`, those query-covered sources remain visible but provider-missing and return no jobs.

Search-query results are checked for listing/search-page signals before scoring. Pages such as Remote Rocketship filtered job lists or other board search-result URLs are expanded into individual job links when the page exposes parseable job data; if expansion is blocked or inconclusive, the listing is recorded in the search-run progress for review and is not saved as an active job match.

Search run analytics are chart-first on Command Center, Runs, Sources run controls, and Apply Sprint. The funnel makes the drop-offs explicit: `Fetched` is raw source results, `Detail candidates` excludes listing/search pages, `Scored` is normalized jobs evaluated against profiles, `Qualified` met a profile threshold, `New jobs` are records created after dedupe, `New matches` are new profile matches, and `Agency eligible` are matches that can be prepared automatically. Drop-off charts show below-threshold jobs, existing duplicates, existing profile matches, suppressed/listing pages, missing application URLs, profile caps, provider warnings, and review-only broad matches.

The seed includes a `Broad LinkedIn Parity Review` profile. It uses broader senior software, full-stack, frontend, React, TypeScript, product engineer, design-system, AI product UI, remote, US, and global terms with a lower review threshold and higher per-run cap. Matches from this broad lane below the high-confidence threshold are saved as review-only `needs_review` jobs and shown in the funnel, but they are excluded from automatic recruiting-agency handoff until manually approved or discovered as high-confidence matches.

`/sources` also supports supported niche job boards and public company career pages. JobFront-powered boards such as `https://jobs.frontdoordefense.com/` can be added with the job board form; the connector reads public job cards from the board API and does not log in or bypass paid/member gates. Eightfold-powered company pages such as Netflix Careers at `https://explore.jobs.netflix.net/careers` are supported through a direct `eightfold` source that reads the public jobs endpoint for configured query terms.

Search and active queues use strict duplicate suppression. Applied, rejected, archived, and ready-to-apply roles suppress canonical siblings across source URLs, ATS wrappers, duplicate groups, and equivalent company/title/location variants so the same role is not promoted again through Jobs, the recruiting agency, bulk packet preparation, manual capture scoring, or Apply Sprint. The Jobs page **Check duplicates** action now runs duplicate/stale detection and then repairs resurfaced suppressed jobs by syncing active duplicate matches to the source state: submitted/application history wins, rejected duplicates become rejected, archived duplicates become archived, and ready-to-apply sibling duplicates are archived while the canonical ready item remains available.

Chrome-captured jobs also feed search strategy and the application pipeline. If a job saved from the browser has zero matching profiles, Job Search OS now creates an enabled captured-intent profile for similar roles and scores the captured job against it immediately. The default lane is `AI-Native Enterprise Product Frontend`, aimed at AI-native product/frontend, enterprise workflow, analytics, agentic UX, design-system, and data-rich UI work like this app, while keeping required keywords empty so urgent broader frontend/product opportunities are not blocked. When the captured job has a persisted match, the app automatically marks that match `approved` and creates or updates an `approved` application tracker so it can be picked up by Apply Sprint packet preparation.

The Chrome extension also supports **Apply Now** after a job has been saved. The popup remembers the last saved job, so you can save the job-description page, navigate to the actual ATS/application form, reopen the extension, and launch Apply Now from the current tab URL. The app updates the saved job's application URL, prepares or reuses the custom resume and cover letter, creates a `ready_to_apply` application, and starts the local application assistant with the same manual-submit safety gates as Apply Sprint.

The Command Center includes the centralized weekly Market Analysis brief. The `MARKET_INTELLIGENCE` agent compares recent jobs, profile health, applications, and outcome signals against curated external labor-market sources such as BLS, Indeed Hiring Lab, Lightcast/Stanford AI Index coverage, and selected role-trend reporting. It fetches trusted source/index pages, discovers recent relevant articles, extracts readable text, keeps only summaries/claims/short excerpts, and uses OpenAI structured synthesis when configured. The report is stored as the latest completed `MARKET_INTELLIGENCE` `AgentRun.outputJson` and appears on the dashboard with tabs for overview, analytical charts, cited research, and recommended actions. Manual and scheduled search runs automatically start a standard-depth market brief after search, duplicate/stale detection, and Apply Sprint packet handoff complete. The brief now feeds a guarded search-adaptation loop: low-risk additive signals can append unique preferred keywords and preferred companies to existing enabled search profiles, capped per run to avoid drift, while create/pause/merge/exclusion/threshold/required-keyword changes remain review-only proposals. The dashboard shows role-lane bar charts, skill-signal charts, historical trend lines from prior market runs, action/source proportion charts, match-quality distribution, cited article cards, source links, adaptation audit details, and review-only actions for search profiles, positioning, company targeting, and outreach.

Optional market research tuning:

```bash
MARKET_INTELLIGENCE_EXTRA_SOURCES="https://example.com/research"
MARKET_INTELLIGENCE_MAX_ARTICLES=8
```

Scheduled job search runs are configured in `vercel.json` and call `/api/cron/job-search` daily at `14:00 UTC`. Scheduled runs only use enabled profiles where scheduling is enabled. Set `CRON_SECRET` in the deployment environment to require `Authorization: Bearer <CRON_SECRET>` on cron requests. Command Center shows the latest manual search, latest cron-triggered search, configured cron expression, scheduled-profile count, and latest market brief; cron is only proven to be working when the database contains a `JobSearchRun` with `triggeredBy: "cron"`.

## Local Playwright Application Assistant

The app does not submit applications automatically. For jobs marked `ready_to_apply`, you can run a local browser assistant that fills safe known fields, uploads the generated resume and cover letter when matching inputs are visible, learns from fields you complete manually, then stops before submit.

The assistant is orchestrated by a LangGraph-backed workflow plus a local Playwright browser runner:

- LangGraph validates the application package, launches the browser runner, stores workflow checkpoints, and records workflow state on `ApplicationAutomationRun`.
- The Playwright runner is still the only component that controls the browser. It performs the broad safe autofill pass, reports detected fields, executes workflow commands, observes manual input, detects submit intent, and reports whether the browser closed after submit or before submit.
- Workflow state is persisted in Postgres through LangGraph checkpointing and in `workflowStateJson` for app UI visibility.
- Optional LangSmith observability stores redacted workflow traces and trace metadata on `ApplicationAutomationRun.observabilityJson`.
- Assistant failures and repairs are captured as redacted quality examples, evaluated locally, and surfaced as improvement proposals on Settings. Safe accepted proposals become low-risk QA/guidance adjustments that application QA consumes; browser lifecycle and submit-state workflow changes remain review-only.
- The graph does not click final submit in the current phase. It stops at manual review, enters learning mode for ordinary unknown fields, and uses Needs Me only for hard blockers or sensitive approvals. If you click submit and then close the browser without a visible validation error, the workflow treats that as applied and updates the application state.
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
- show structured Apply Sprint run feedback with current phase, recent events, close/error reasons, next action, field/upload counts, and a collapsible raw log
- observe required or custom fields you complete manually, save safe field memories, and reuse repeated low/medium-risk answers on future matching forms
- create Needs Me requests only for hard blockers and sensitive approvals
- stop on Ashby possible-spam/reCAPTCHA blocks with `ats_spam_block` and route the user to normal Chrome assisted fill instead of retrying Playwright submission

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

For Ashby roles, the safer path is normal Chrome assisted apply. The Chrome extension can load the prepared assistant package for the current application URL, fill safe known fields and obvious cover-letter/custom-answer text in the user's regular Chrome profile, attach generated resume and cover-letter PDFs to matching upload fields when the page accepts them, highlight upload fields that still need manual file selection, and stop before submit. This is not an anti-fraud bypass: it does not solve CAPTCHA, mask automation, rotate networks, or click submit.

During autofill testing, Apply Sprint includes a reset control for the selected application. It clears assistant automation runs and open assistant blockers, stops any tracked local runner process, and lets you relaunch without rejecting the job or deleting learned memories.

## Recruiting Agency Workflow

The recruiting agency now runs as a LangGraph-backed workflow while preserving the existing API contract for `/api/applications/agency/run` and `/api/applications/agency/run/status`. Search completion can also start it automatically with `triggeredBy: "search_auto"`; structured handoff progress is appended to the search run so the Dashboard shows the linked agency `AgentRun`, live activity, approval/preparation totals, skip reasons, and repair/retry controls.

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

Some job boards require Google OAuth, human verification, or paid apply flows. Those sources are disabled by default, blocked from automated query ingestion, or treated as manual-only: the assistant opens the job in your normal browser and reveals the prepared materials folder instead of trying to automate the login. Remotive is currently blocked because its listings are paywall-gated.

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

## License

This project is licensed under `AGPL-3.0-only`. See [LICENSE](./LICENSE).
