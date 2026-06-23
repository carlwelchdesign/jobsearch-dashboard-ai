# Agentic Job Search Assistant

Personal Agentic AI-powered job search dashboard for reviewing jobs, maintaining search profiles, parsing resumes, and generating truthful ATS-friendly application materials.

<img width="1407" height="1278" alt="image" src="https://github.com/user-attachments/assets/8f9f935a-3409-4e11-b75d-eb292ef999ea" />

## Operating Posture

Job Search OS is currently treated as a **protected single-user production app**. The roadmap in [`plans/FIRST_CLASS_AGENTIC_JOB_SEARCH_OS_AUDIT_ROADMAP_PLAN.md`](./plans/FIRST_CLASS_AGENTIC_JOB_SEARCH_OS_AUDIT_ROADMAP_PLAN.md) is the canonical audit package for the first-class agentic operating system push: product wedge, current-state review, agent operating model, risk register, prioritized refactor roadmap, and implementation backlog.

The default safety model is conservative:

- LinkedIn is a lead and public-content channel, not a scrape or auto-apply source.
- Application submission, employer contact, email sending, external calendar writes, and unreviewed LinkedIn publishing remain manual or explicitly approval-gated.
- Jolene and the skill system classify actions as `read_only`, `proposal`, `safe_internal`, `guarded_mutation`, or `external_blocked`.
- Deployed cron and sync endpoints must be protected with bearer secrets. Set `CRON_SECRET`, and use `EMAIL_SYNC_SECRET` or `LINKEDIN_ANALYTICS_SYNC_SECRET` when those sync surfaces need separate credentials.
- `/api/system/health` reports database readiness, stale work, required secret status, provider configuration, and worker readiness.

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

Run browser acceptance tests for the operating cockpit and lifecycle pages:

```bash
npm run test:e2e
# or against an already-running app
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
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
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_OPS_CHANNEL_ID=C...
SLACK_OPS_JOLENE_ID=C...
SLACK_APPROVALS_CHANNEL_ID=C...
BRAVE_SEARCH_API_KEY=...
SEARCH_QUERY_MAX_RESULTS=80
```

With `OPENAI_API_KEY`, resume parsing, job scoring, and resume tailoring use OpenAI structured outputs. Without it, those flows still run through deterministic parsers/scorers so the dashboard remains usable. `OPENAI_MODEL` remains the app-wide default model; `/settings/system#settings-ai` also includes a runtime-editable LinkedIn content model, defaulting to `gpt-5.5`, and a LinkedIn diagram image model, defaulting to `gpt-image-2`, so public LinkedIn drafts and optional visual polish can use higher-quality models without changing the rest of the app.

Slack Agent Ops is optional and runs as a local Socket Mode worker:

```bash
npm run slack:dev
```

Slack posts redacted Jolene, Operating Loop, and Recruiting Search Team updates to the configured ops channel, sends approval cards to the approvals channel, and exposes a Slack Home tab command center. Slack V3 also turns the ops channel into a threaded operations room: `/jso morning`, `/jso evening`, and `/jso focus` post compact briefings, while `/jso opportunity <job id or application id>` creates or reuses one mapped Slack thread for a high-value job/application. If `SLACK_OPS_JOLENE_ID` is set, the bot is invited to that channel, and the installed Slack app includes the `channels:history`/`groups:history` scopes from `config/slack-app-manifest.example.yml`, every human message in that dedicated channel is treated as a Jolene prompt and answered in a thread. The Home tab shows today status, pending approval groups, recent agent runs, recent Slack decisions, and safe starters for Jolene Chief of Staff, Jolene Operating Loop, Recruiting Search Team, and Email Ops. `/jso` supports `status`, `approvals`, `runs`, `morning`, `evening`, `focus`, `opportunity <id>`, `coach summary`, `run jolene`, `run loop`, `run search-team`, and `help`.

If `/jso` works but normal `#jolene` messages do not trigger replies, reinstall the Slack app after adding the manifest history scopes. A bot invite and channel ID are not enough for Slack to deliver ordinary channel messages to Socket Mode.

Slack actions only call existing internal approval/apply/rollback/run services; Prisma, `AgentRun`, `AgentRunEvent`, `NotificationLog`, `JoleneConversation`, `JoleneMessage`, and `SlackThreadLink` remain the source of truth. Slash-command and Home-tab safe starters still use confirmation modals. The dedicated Jolene channel can execute safe internal requests such as job search, duplicate checks, Email Ops, Daily Command Center refresh, Market Intelligence refresh, Chief of Staff, Operating Loop, and Recruiting Search Team runs directly from natural language. Guarded, destructive, or external actions stay blocked or app-confirmed: Slack does not submit applications, send email, publish LinkedIn posts, contact employers, or mutate external calendars. Use `SLACK_ALLOWED_USER_IDS` to restrict who can chat with Jolene or click approval buttons, and optional `SLACK_COACH_USER_IDS` for trusted reviewers whose thread replies are captured as advisory app-side feedback.

Custom recruiter opportunities can be handled from `/resumes/custom-opportunity`. Paste the recruiter brief, extract editable company/title/location/remote details, then generate a resume-only tailored material. The workflow saves a `Recruiter Opportunity` job record and a generated resume, but it does not create an application tracker, cover letter, or application packet unless you open the saved job and use the normal package path. MCP/integration-style briefs automatically emphasize verified Job Search OS stack evidence in the resume Summary and Skills while keeping unsupported requested systems out of claimed skills. Generated outputs can be edited and saved on the custom opportunity page, appear in `/resumes/generated`, and use the existing text/PDF export endpoints.

The resume profile is a Job Evidence Library organized by role timeline instead of separate context and bullet lists. Each job owns its verified/proposed bullets, application/product context, confirmed tech, version suggestions, source records, and duplicate cleanup actions. Pasted role descriptions can backfill a specific job, resume-upload bullets are linked to matching work history when approved, and duplicate work rows are grouped for explicit review before merge. Generated resumes render each Professional Experience entry as `Company - Title | Dates`, `Skills: ...`, then truthful outcome bullets. Exact technology versions appear only after they are confirmed or approved in `/resumes/profile`; unapproved inferred version language is flagged by material QA. Uploading and approving a new resume now acts as re-onboarding: the latest approved upload becomes the active resume source, candidate intelligence records review evidence, and the Search Profile Manager returns reviewable profile suggestions without creating or deleting profiles automatically.

Cover letters now run through a stricter materials team before they can enter Apply Sprint. `APPLICATION_EVIDENCE_CURATOR` chooses job-specific proof points from approved evidence, profile bullets, projects, GitHub context, work history, and cover-letter-usable RAG results. `HIRING_MANAGER_REVIEWER` then scores the draft for hiring-manager relevance, specificity, company/role fit, generic fallback phrasing, and unsupported claims. Deterministic fallback cover letters are saved only as review artifacts; they cannot move an application to `ready_to_apply`.

The primary workflow is agency-first and now runs as a gated search improvement loop. Running search fetches, dedupes, scores, and saves matches, then automatically hands application-ready matches to the recruiting agency when no agency run is already active. The agency approves appropriate jobs, creates application trackers, generates resume and cover-letter packets, and moves them to `ready_to_apply`; broad or uncertain roles stay in the Jobs exception queue for manual review. After agency handoff, the loop pauses profile-health recalculation if jobs still need approve/reject decisions or prepared applications still need Apply Sprint work. When those gates are clear, the Search Profile Optimizer writes fresh profile-health snapshots and Market Intelligence refreshes the dashboard charts from those current signals. Bulk packet preparation is restricted to already-approved jobs so it cannot bypass agency approval. `JobPosting.applicationUrl` means a direct employer or ATS application target; job-board, listing, auth, paywall, or intermediary URLs stay in `rawData` until they are resolved to a launchable URL. Application state changes now run through a canonical transition service that updates the tracker, linked match, packet state, submitted-job suppression, reconciliation, outcome calibration, and structured `ApplicationEvent` audit history with entity versions. Application state is reconciled by canonical job identity, so when one duplicate tracker is submitted/applied, stale approved or ready duplicates are archived and sibling job matches are synced. The Dashboard also audits application state integrity across trackers, matches, email confirmations, submitted assistant runs, and resurfaced jobs; use `POST /api/applications/integrity/repair` to run deterministic repairs with transition counts and event ids. Final application submission remains manual.

`/dashboard` is now the **Today** cockpit for the daily job-search loop: find jobs, decide on review exceptions, apply to prepared roles, and follow up on blockers or replies. The first viewport prioritizes a single daily goal strip plus four work lanes: Find jobs, Decide, Apply today, and Follow up. System support such as Jolene, lifecycle readiness, profile health, state integrity, market intelligence, and diagnostic metrics remains available below the daily work or through the System navigation group. The shared readiness service still backs those support surfaces: `buildLifecycleReadiness({ userId })` computes live setup, search, review, packet, apply, follow-up, interview, outcome, trust, and health signals; `ReadinessOverride` stores only user intent such as snooze, dismiss, or manual completion. Trust and health blockers remain system-controlled, so an override cannot make unsupported claims or stale running work appear safe. `GET /api/readiness` returns the current cockpit state, and protected `PATCH /api/readiness/[key]` applies non-critical overrides.

Application detail pages also support draft-only interview thank-you messages. Use the Thank-you drafts card to enter the interview stage, interviewer details, date, and conversation notes; the app saves a `ThankYouDraft` with a full email draft and a shorter LinkedIn variant grounded in the application, role, and approved evidence. These drafts are copyable review artifacts only: the app does not send messages, create contacts, record outcomes, or change application status automatically.

Apply Sprint starts with the next ready application instead of the diagnostic funnel. The primary path shows the selected application, direct application link, packet readiness, assistant launch, cover-letter copy, manual applied confirmation, and reject/remove action. Candidates, agency results, hidden/suppressed rows, queue progress, reset controls, and run logs stay available behind details panels so the user can diagnose issues without losing the daily apply flow. Jobs with board, listing, auth, paywall, or intermediary URLs show as `unsupported_application_url` in diagnostics until a direct employer or ATS target is added or repaired. Applications with fallback or weak cover letters show as `material_quality_needs_review` and remain approved/review-only until regenerated or manually repaired.

Jolene is the persistent in-app operating assistant and now serves as **Jolene, Chief of Staff**. In addition to route context, Jolene has deterministic local retrieval tools for app data, so requests like "where is the cover letter for Linear" search generated cover letters, application packets, applications, and jobs before falling back to chat. She also has a governed capability registry that maps natural language to app domains, API surfaces, page surfaces, and safety policies across Command Center, Apply Sprint, applications, jobs/search, profiles/evidence, agents, Email Ops, Market Intelligence, and generated materials. Read-only questions can compose context across those capabilities; safe internal workflows route through existing services; guarded mutations and external actions remain behind confirmation or manual review. The read-only state query layer handles operational questions such as "how many jobs are in Apply Sprint?", "what is blocking Apply Sprint?", "what failed recently?", "what is Email Ops status?", and "how is profile health looking?". For causal search questions such as "why did fetched jobs jump?" or "why did yield change?", Jolene now reads recent `JobSearchRun` history and `buildSearchRunAnalytics()` diagnostics to compare the latest run with the previous baseline, separate raw fetch volume from useful yield, and point to source/profile/query-expansion evidence when available. These answers are synthesized from local Prisma state before coaching or generic chat paths run, and an answer guard reroutes obvious app-state questions that would otherwise receive an off-topic coaching answer. Matching answers include direct links to generated material exports, application records, job records, search diagnostics, and the generated materials page without dumping full cover-letter bodies unless explicitly requested. Jolene also has a career-aware interview coaching path: pasted recruiter success-profile prompts and questions such as "how does this apply to me?" load compact profile, evidence, project, application outcome, and app-building context, then produce grounded interview talking points instead of accidentally running side-effect actions. Jolene now has a proactive Chief of Staff brief on `/dashboard`: she reviews recent `AgentRun` and `AgentRunEvent` history, open blockers, pipeline state, Email Operations, market signals, LinkedIn content/analytics, and the career standup, then shows quiet priority cards with rationale, evidence, open links, ask-Jolene actions, and approval-gated delegated work.

Jolene Chief of Staff uses the normal agent observability model. A `JOLENE_CHIEF_OF_STAFF` run stores the executive brief in `AgentRun.outputJson`; child agents launched after approval store `parentRunId` back to the Jolene run; and delegated decisions are logged as `AgentRunEvent` rows. `GET /api/jolene/chief-of-staff` returns the latest brief, `POST /api/jolene/chief-of-staff/run` creates a new brief, and `POST /api/jolene/chief-of-staff/approve` executes selected internal delegated proposals. Current delegated work can refresh search, run the Recruiting Search Team, Daily Command Center, Market Intelligence, duplicate/stale detection, LinkedIn content drafts, or Jolene Email Operations. Jolene proposes this work by default and asks approval before launching it.

Jolene also has an internal **Operating Loop** that acts as the planner/scheduler layer under the same Chief of Staff persona. A `JOLENE_OPERATING_LOOP` run reads system signals, refreshes the Chief of Staff brief, records proposed actions, skipped actions, approval-needed work, and child-run status in `AgentRun.outputJson`, and surfaces that status on `/dashboard`. It is conservative by default: scheduled and manual loop runs create plans and approval cards, but child teams do not launch until the user approves an internal action. `GET /api/jolene/operating-loop` returns the latest loop plan, `POST /api/jolene/operating-loop/run` runs the planner, `POST /api/jolene/operating-loop/approve` approves selected proposed internal work, and `/api/cron/jolene-operating-loop` is protected by `CRON_SECRET` for scheduled refreshes.

Slack Agent Ops mirrors this same safety boundary outside the app. When `npm run slack:dev` is running with Slack Socket Mode credentials, completed Jolene Chief of Staff, Jolene Operating Loop, and Recruiting Search Team runs post redacted summaries to Slack. Approval buttons call the same internal services used by the app UI, then log Slack delivery/action records and agent events. Opportunity rooms store their app-owned channel/thread mapping in `SlackThreadLink`, so future updates and trusted coach replies can be attached to the same thread. The dedicated Jolene channel stores prompts and replies in the normal Jolene conversation tables with Slack metadata, then posts threaded replies back to Slack. It can answer the same read-only app-state questions as the in-app drawer, so new questions generally do not need custom Slack commands. Slack does not submit applications, send email, publish LinkedIn posts, or own durable workflow state.

The System Architecture agent gives the app a first-class way to explain how the pieces connect. A `SYSTEM_ARCHITECTURE` run deterministically scans App Router pages, API routes, Prisma models and enums, agent types, the code-first skill registry, ADK/LangGraph boundaries, README/wiki docs, and `/plans`; it stores the system map, risks, workflows, and recommended architecture decisions in `AgentRun.outputJson`. `/architecture` shows the latest map and can refresh it through `POST /api/architecture`. The agent is read-only: it reports weak connections and documentation gaps, but it does not mutate applications, email, calendar, or external systems.

Jolene confirmation cards execute only app-local internal repairs after explicit user confirmation. The current allowlist includes application integrity repair, duplicate/stale detection, Jolene Email Operations, Daily Command Center refresh, Market Intelligence refresh, and graph-backed agent run repair/retry/cancel when a run id is present. Confirmed actions post to `POST /api/jolene/confirm`, update the source Jolene message, append an execution result message, and may navigate/refresh the related app surface. Jolene does not execute external application submission, email/outreach sending, employer-system interactions, external calendar writes, or broad approve/reject/archive mutations; those remain manual or page-routed.

Jolene's earlier Career CEO mode is folded into the Chief of Staff role. The persistent `CareerMission` still stores the 30-day high-income sprint mandate, compensation floor and ideal target, role tracks, dealbreakers, fallback paths, capacity notes, and tone preferences. Ask Jolene for a career brief, money moves, or standup and she now creates a Chief of Staff run first, then folds the income sprint, sprint score, income momentum, attention debt, and money-move signals into the same operating brief. The default policy remains aggressive but truthful: widen toward credible high-income opportunities, preserve evidence grounding, and keep external actions manual or explicitly confirmed.

Jolene mission and standup endpoints:

```bash
curl http://localhost:3000/api/jolene/mission
curl -X PATCH http://localhost:3000/api/jolene/mission \
  -H "content-type: application/json" \
  -d '{"targetCompensationMin":200000,"targetCompensationIdeal":260000,"horizonDays":30}'
curl -X POST http://localhost:3000/api/jolene/career-brief
curl http://localhost:3000/api/jolene/career-standup
curl -X POST http://localhost:3000/api/jolene/career-standup
```

Jolene standups close the loop across days. `POST /api/jolene/career-standup` still creates a `CareerSprintSnapshot` with the current brief, stable money-move statuses, sprint score, income momentum, attention debt, and completed move keys. `GET /api/jolene/career-standup` returns the latest snapshot. Ask Jolene for a standup, sprint score, income momentum, or money moves to generate a Chief of Staff brief plus the latest standup snapshot.

This repo also includes local skills under `.agents/skills`. Use `development-agent` whenever you ask to implement a plan; it covers the required release workflow: save the plan under `/plans`, create a feature branch, update README/wiki/docs, run verification, commit, push, open a PR, restart dev, and verify local routes. Use `product-ui-engineer` for dashboard and chart redesigns, and `system-architecture-agent` for agent, Prisma, workflow, route/API, or architecture-map changes.

With `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY`, the app emits redacted metadata traces for agent runs, OpenAI helper calls, the application assistant workflow, and graph-backed recruiting agency runs. Tracing is optional and fail-open: if LangSmith is unavailable, the app continues without tracing. The default trace payload masks resume text, cover letters, raw application answers, prompts, secrets, emails, phone numbers, and full field values while preserving useful debugging metadata such as workflow step, field label, field type, command type, result, status, model, and counts.

ADK is available as an opt-in TypeScript agent control plane with `ADK_ENABLED=true`. In this phase it supervises selected low-risk agents such as Daily Command Center and Market Intelligence by registering their allowed read-only tools, recording ADK runtime metadata on `AgentRun.observabilityJson`, and emitting ADK control-plane events into the normal agent activity feed. Jolene is registered as a guarded ADK app operator and records planned, confirmed, skipped, failed, and executed tool activity in chat `actionJson`. ADK does not replace LangGraph for the application assistant or recruiting agency; those workflows still own durable state, resume, repair, and browser/process coordination.

Generated resumes, cover letters, application packets, application answers, and LinkedIn drafts now sync durable `MaterialClaim` provenance rows. Claims are additive to the existing generation notes and LinkedIn review JSON. Unsupported claims and blocked `materialQuality` reviews block application-packet approval, Apply Sprint launch, extension-ready APIs, and LinkedIn approve/publish paths, while PDF and plain-text exports remain available for manual review. Use `npx tsx scripts/repair-application-materials.ts` for a dry-run audit of existing weak cover letters, and add `--apply` to mark blocked material and move affected ready applications back to approved.

The app also keeps a local LangSmith-style quality loop. Assistant failures, browser-close repairs, manual submit corrections, recruiting agency candidate failures, noisy search runs, rejected high-score matches, generated-material claim failures, outcome calibration signals, and explicit mistake reports become redacted `AgentQualityExample` records. `/api/observability/evaluations/run` scores supported targets and creates `AgentImprovementProposal` records. Accepting a low-risk mapped proposal activates conservative `SkillAdjustment` rules that future agent runs consume in bounded ways: job-fit scoring becomes more cautious after rejected high-score matches, duplicate/stale detection tightens resurfacing checks, search profile review flags low-yield profiles, application QA adds cover-letter and field-classification review warnings, and agency approval requires cleaner candidates after candidate-quality failures. Settings also shows outcome calibration across real applications, callbacks, rejections, duplicate groups, resurfaced suppressed jobs, and assistant failures, with drill-down rows for the jobs, profiles, sources, duplicate groups, and automation runs behind each signal. Outcome calibration now adds review-only actions such as reviewing noisy sources, tightening profiles, resolving duplicate groups, repairing resurfaced suppressions, and inspecting assistant failures; these actions link to the relevant manual surface, show whether they are advisory/open/accepted/dismissed in the proposal lifecycle, and can be promoted into governed improvement proposals with `POST /api/observability/outcomes/propose-actions` without applying changes automatically. Outcome signals refresh automatically after job rejection/archive changes, application outcomes, email-derived outcomes, and assistant terminal states; the manual recompute endpoint remains a repair/backfill action. Manual recompute and throttled automatic refreshes also write aggregate `OutcomeCalibrationSnapshot` rows so Settings and `GET /api/observability/outcomes/trends` can show whether callback rate, duplicate noise, resurfacing, high-score rejections, assistant failures, and workflow scores are improving or regressing. Regressing trends can be manually promoted into review-only proposals with `POST /api/observability/outcomes/trends/alerts`, and `GET /api/observability/outcomes/trends/triage` ranks open regression proposals by priority with owner area, reason, and review route. Settings also shows learning impact by comparing active rules with later agent runs and quality evaluations. Active learned rules can be disabled manually or through manual-triggered auto rollback when repeated negative impact crosses conservative thresholds; both paths mark the adjustment `REJECTED`, remove it from future skill runs, and capture a redacted rollback quality example so repeated bad learned rules can become review-only improvement proposals. Settings also includes rollback history with the disabled source, reason, impact snapshot, rollback example count, and follow-up proposal status. High-risk, unmapped, prompt, search-source, scoring-policy, and workflow changes remain review-only and never rewrite behavior automatically. Deterministic evaluators currently cover the application assistant, recruiting agency, job search, job matching, and generated materials; the schema also supports GitHub review, outreach, outcome learning, and command center recommendations.

The Agent Review Board now turns that quality loop into a Phase 5 gate board. `buildAgentQualityGates({ userId })` rolls up examples, evaluations, proposed improvements, recent runs, child runs, and blocked-action events by `AgentQualityTarget`; `GET /api/agents/quality-gates` returns the same summary for integrations. The `/agents` page shows which target areas can scale, which are stale, which lack eval coverage, and which are blocked before more agent surface area is expanded. Supported targets can run their deterministic evals from the board. This remains inspect/review oriented: it does not add auto-submit, unapproved email, calendar writes, or unreviewed LinkedIn publishing.

The Recruiting Search Team is Jolene's search-profile optimization team for Qualified yield. `RECRUITING_SEARCH_DIRECTOR` coordinates `SEARCH_YIELD_ANALYST`, `SEARCH_PROFILE_EDITOR`, `SOURCE_QUALITY_ANALYST`, `MATCH_CALIBRATION_REVIEWER`, and `OUTCOME_RECRUITER` child runs. The team reads search-run analytics, profile health, source/profile yield, score buckets, top blockers, and outcome signals, then records a `SearchOptimizationRun` plus `SearchProfileChange` rows. Low-risk local profile edits can be applied automatically in active mode, including bounded excluded keywords/titles, preferred keywords/companies, max-result caps, small threshold changes, and strongly evidenced low-yield pauses. Risky structural changes remain review-only. Every applied change stores before/after and rollback payloads.

Set your GitHub profile URL in `/settings` and click `Sync GitHub context` to pull public repository context into the candidate profile. Public repos are used as project context in tailored resumes and cover letters when relevant. Add `GITHUB_TOKEN` only if you need higher GitHub API rate limits.

## Jolene Email Operations

Inbound job-response email can be synced from Gmail OAuth, Outlook OAuth, or a local IMAP mailbox. The raw sync still ingests messages, but the primary workflow is now Jolene Email Operations: a parent `JOLENE_EMAIL_OPERATIONS` run coordinates specialist child agents for inbox scouting, application matching, outcome classification, scheduling extraction, action drafting, privacy review, and reporting back to Jolene Chief of Staff.

For IMAP, configure:

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

Email Ops scans both broad recent job-response mail and application-specific watchlist queries. It stores durable `EmailOpsFinding` rows with classification, confidence, match, evidence, suggested mutation, and provenance. Clear high-confidence rejections and application confirmations can auto-apply internal application outcomes. Ambiguous matches, offers, recruiter replies, interview/scheduling updates, reply drafts, employer contact, and calendar writes create approval-needed Jolene items instead of guessing.

Scheduling-related findings create `CalendarEventProposal` rows as in-app drafts. Drafts can include title, source email, extracted meeting link, attendees, timezone, and confidence, but v1 does not write to Google or Outlook Calendar. Use `/dashboard/email-ops` to run Email Ops, review findings, approve or dismiss blocked updates, and inspect calendar drafts. APIs:

```bash
curl http://localhost:3000/api/jolene/email-ops
curl -X POST http://localhost:3000/api/jolene/email-ops/run
curl -X POST http://localhost:3000/api/jolene/email-ops/findings/FINDING_ID/approve
curl -X POST http://localhost:3000/api/jolene/email-ops/findings/FINDING_ID/dismiss
```

Application state integrity endpoints:

```bash
curl http://localhost:3000/api/applications/integrity
curl -X POST http://localhost:3000/api/applications/integrity/repair
```

The read endpoint reports drift without mutating data. The repair endpoint runs canonical reconciliation, marks high-confidence email or assistant submitted signals as applied, syncs linked match statuses, records submitted suppressions, and leaves versioned `ApplicationEvent` audit entries with source, actor, before/after snapshots, transition counts, and event ids.

Application URL cleanup has a separate dry-run/apply repair script for board or intermediary URLs that were already promoted before the direct-only policy:

```bash
npx tsx scripts/repair-application-urls.ts
npx tsx scripts/repair-application-urls.ts --apply
```

The repair attempts known provider extraction first, including Built In, Working Nomads, Himalayas, and Recruitee redirect validation. Resolved jobs get a direct `applicationUrl`, detected `atsProvider`, and `rawData.resolvedApplicationUrl`; unresolved jobs preserve the original URL in `rawData.originalApplicationUrl`, clear `applicationUrl`, and move affected `ready_to_apply` applications back to `approved` through the normal transition audit path.

An hourly email sync cron is configured in `vercel.json` and calls `/api/cron/email-sync` at the top of every hour. It checks connected Gmail OAuth accounts and any configured IMAP mailbox. Set `EMAIL_SYNC_SECRET` or `CRON_SECRET` to require `Authorization: Bearer <secret>` on cron requests.

The manual search run uses enabled external source adapters. Direct ATS sources are prioritized: Greenhouse, Lever, and Ashby. RemoteOK is disabled by default because it creates paid/login application friction, and We Work Remotely is disabled by default because it is an intermediary board rather than a final ATS form. ATS adapters use configured company slugs so the app can search target companies directly, for example:

```json
{ "companySlugs": ["linear", "vercel"] }
```

The seeded `Company Source List` is a curated target list, not a claim that every company is hiring today. `/sources` can add companies with a name, priority, categories, and optional Greenhouse/Lever/Ashby slugs; the app generates default search terms and common ATS slug variants when slugs are omitted. Search runs probe likely company careers/ATS feeds from that list, filter for role families such as React, TypeScript, Next.js, design systems, security/identity, AI tooling, developer platforms, defense tech, geospatial, and enterprise dashboards, then score the resulting roles against enabled profiles.

The Source roadmap on `/sources` distinguishes implemented connectors from enabled runtime sources. `Implemented` means an adapter, query coverage, or manual workflow exists; `enabled` means the source is included in search runs; `planned` means future connector work; `manual` means human/account workflow; and `P1` is priority-one regardless of status. Direct adapters cover Greenhouse, Lever, and Ashby; the Brave-backed `Search Query Backlog` broadens discovery across Workable, SmartRecruiters, iCIMS, Jobvite, BambooHR, Teamtailor, Jobylon, Join, Jobtrain, Bullhorn, Oracle Taleo, SAP SuccessFactors, ZipRecruiter, Dice, Wellfound, Monster, CareerBuilder, SimplyHired, Adzuna, USAJOBS, remote boards, VC portfolios, startup boards, HN, and tech boards. LinkedIn is treated as a discovery signal rather than a scrape target: the app searches for the original employer, ATS, or career-page postings behind LinkedIn-visible roles. User-supplied LinkedIn job URLs are stored as LinkedIn leads; if the capture includes company, title, and selected job text it flows through scoring and approval, and if it is just a bare LinkedIn URL it becomes a review-only lead with guidance to paste job text or use the original employer/ATS link. Generated original-posting queries are merged into Search Query Backlog and explicitly exclude `site:linkedin.com`. Without `BRAVE_SEARCH_API_KEY`, those query-covered sources remain visible but provider-missing and return no jobs.

Search-query results are checked for listing/search-page signals before scoring. Pages such as Built In filtered search URLs, Remote Rocketship filtered job lists, or other board search-result URLs are expanded into individual job links when the page exposes parseable job data; if expansion is blocked or inconclusive, the listing is recorded in the search-run progress for review and is not saved as an active job match. Built In search-result pages are never treated as application URLs: the adapter expands them into Built In job-detail pages, then only marks a job Apply Sprint-ready when the detail page exposes a real employer or ATS application link. Built In, Working Nomads, Wellfound, Remotive, Remote Rocketship, RemoteOK, Dice, Indeed, ZipRecruiter, Recruitee-hosted URLs, and similar source URLs may remain in `rawData.sourceApplicationUrl`, but they are not promoted to `JobPosting.applicationUrl` unless resolved to a direct external apply URL. Recruitee links are accepted only when they redirect to a company-owned career domain; `recruitee.com/careers_not_hosted`, `recruitee.com`, and 404/410 responses are treated as unresolved.

Search run analytics are chart-first on Command Center, Runs, Sources run controls, and Apply Sprint. The panel now uses a command-deck layout instead of a flat conversion strip: a run-quality radial gauge, telemetry tiles, next-action callout, source/profile winners, opportunity terrain treemap, search-signal radar, source yield map, profile lanes, quality bands, and search momentum all point to what worked and what needs action. The four persisted counters remain fixed on `JobSearchRun`; richer analytics still come from progress JSON, so no migration is required.

The seed includes a `Broad LinkedIn Parity Review` profile. It uses broader senior software, full-stack, frontend, React, TypeScript, product engineer, design-system, AI product UI, remote, US, and global terms with a lower review threshold and a 250-match per-run cap. Matches from this broad lane below the high-confidence threshold are saved as review-only `needs_review` jobs and shown in the funnel, but they are excluded from automatic recruiting-agency handoff until manually approved or discovered as high-confidence matches.

`/sources` also supports supported niche job boards and public company career pages. JobFront-powered boards such as `https://jobs.frontdoordefense.com/` can be added with the job board form; the connector reads public job cards from the board API and does not log in or bypass paid/member gates. Eightfold-powered company pages such as Netflix Careers at `https://explore.jobs.netflix.net/careers` are supported through a direct `eightfold` source that reads the public jobs endpoint for configured query terms.

Search and active queues use strict duplicate suppression. Applied, rejected, archived, and ready-to-apply roles suppress canonical siblings across source URLs, ATS wrappers, duplicate groups, and equivalent company/title/location variants so the same role is not promoted again through Jobs, the recruiting agency, bulk packet preparation, manual capture scoring, or Apply Sprint. The Jobs page **Check duplicates** action now runs duplicate/stale detection and then repairs resurfaced suppressed jobs by syncing active duplicate matches to the source state: submitted/application history wins, rejected duplicates become rejected, archived duplicates become archived, and ready-to-apply sibling duplicates are archived while the canonical ready item remains available.

Chrome-captured jobs also feed search strategy and the application pipeline. If a job saved from the browser has zero matching profiles, Job Search OS now creates an enabled captured-intent profile for similar roles and scores the captured job against it immediately. The default lane is `AI-Native Enterprise Product Frontend`, aimed at AI-native product/frontend, enterprise workflow, analytics, agentic UX, design-system, and data-rich UI work like this app, while keeping required keywords empty so urgent broader frontend/product opportunities are not blocked. When the captured job has a persisted match, the app automatically marks that match `approved` and creates or updates an `approved` application tracker so it can be picked up by Apply Sprint packet preparation.

Settings supports three LinkedIn connections using `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`. The identity callback at `LINKEDIN_OIDC_REDIRECT_URI` requests `openid profile email`, imports durable profile basics such as name, email, photo, locale, subject, and email verification status, and does not store identity access tokens. The publishing callback at `LINKEDIN_SHARE_REDIRECT_URI` requests `openid profile email w_member_social`, stores a separate `LinkedInShareConnection`, and can publish approved `/linkedin-content` drafts through Share on LinkedIn. The analytics callback at `LINKEDIN_ANALYTICS_REDIRECT_URI` requests `openid profile email r_member_postAnalytics`, stores a separate `LinkedInAnalyticsConnection`, and lets Command Center sync member post metrics when LinkedIn grants that product access. These connections do not unlock LinkedIn job search, saved jobs, Apply with LinkedIn, Apply Connect, Job Posting APIs, scraping, or automated LinkedIn browsing.

The LinkedIn Content studio at `/linkedin-content` now works as a prompt-first agent content team. Instead of choosing a fixed category, write a brief for what you want posted today and optionally nudge the format or visual direction. The team builds a public-safe memory and analytics pack from recent `AgentRun` records, `/plans` files, search-run analytics, Apply Sprint/application aggregate counts, Market Intelligence context, active learning rules, prior drafts and edits, post performance analytics, novelty signals, and screenshot metadata. The content team now follows a documentary-builder standard: assignment editor, evidence reporter, documentary producer, narrative editor, authenticity reviewer, prompt-fidelity reviewer, analytics narrator, visual producer, technical documentation architect, diagram systems designer, visual design reviewer, diagram QA reviewer, optional AI visual polish producer, privacy reviewer, and publisher roles. Drafts must select a prompt-relevant evidence anchor before writing; stale plan snippets cannot become the main angle when the user asks about a specific screen, chart, workflow, or architecture topic. Deterministic fallback uses distinct field-note, lesson, teardown, visual-walkthrough, and product-thesis structures, and can repair an otherwise valid draft by adding the selected evidence anchor before blocking publish for missing evidence. Agents can use aggregate numbers such as jobs fetched, scored, qualified, saved, drop-off reasons, application status counts, source coverage, workflow learning, impressions, reach, engagement, and content-format performance, but public posts cannot include company names, job URLs, salaries, recruiters, emails, application-specific outcomes, viewer identities, or commenter identities. Drafts use the dedicated LinkedIn content model saved in Settings, defaulting to `gpt-5.5`, and expose agent reviews, plan sources, source provenance, grounded claims, editable copy, subtle agent-team disclosure, novelty guidance, prompt-match scoring, selected angle rationale, evidence rationale, and visuals. Architecture prompts are treated as a contract: even deterministic fallback must discuss system layers, agent services, Prisma/Postgres memory, approval gates, and generated architecture diagrams instead of defaulting to funnel analytics. System architecture prompts now use the deterministic `architecture-topology-v1` renderer: a traditional left-side topology canvas with nested boundaries, compact service nodes, connector labels, and a right-side numbered legend. Workflow/process explainers can still use the older `staff-engineer-html-v1` column renderer. Optional OpenAI image generation can add non-authoritative visual polish when enabled, but exact architecture text stays in deterministic diagrams because image models can still struggle with precise text and layout-sensitive compositions. Clicking **Approve and publish** is the final user action: if privacy/provenance checks pass and LinkedIn publishing is connected, the app immediately creates the LinkedIn UGC post and records the returned post id or a retryable publish error.

LinkedIn content quality gates are fixture-backed against stale generated-copy patterns. Public body copy must show the selected evidence anchor, factual claims are checked against aggregate facts, selected evidence, or architecture context, and visual prompts that require an app screenshot need a passing safe screenshot rather than a diagram-only asset. Editing a draft invalidates the prior review and moves it back to `NEEDS_REVIEW`; approve and publish both require a passing privacy review and grounded claims before any LinkedIn network work can run.

Command Center includes a LinkedIn Analytics dashboard for published posts. It shows executive KPI cards for impressions, reach, reactions, comments, reposts, saves, sends, link clicks, CTA clicks, follower gains, profile views, and engagement rate, plus Recharts trend, mix, top-post, and reach-vs-engagement charts. If `r_member_postAnalytics` is approved, **Refresh** syncs metrics through LinkedIn's Member Post Statistics API and `/api/linkedin-analytics/sync` can be called by a daily cron-compatible job. If API access is unavailable, paste CSV rows into the dashboard import box; `POST /api/linkedin-analytics/import` stores the same aggregate snapshot shape with source `CSV`. Stored analytics are aggregate-only and are used by the content memory pack to help future agents learn which pillars, hooks, and screenshots performed best.

The Chrome extension also supports **Apply Now** after a job has been saved. The popup remembers the last saved job, so you can save the job-description page, navigate to the actual ATS/application form, reopen the extension, and launch Apply Now from the current tab URL. The app accepts the active tab URL only when it is a direct employer or ATS application target, then updates the saved job's application URL, prepares or reuses the custom resume and cover letter, creates a `ready_to_apply` application only when material quality passes, and starts the local application assistant with the same manual-submit safety gates as Apply Sprint.

The Command Center includes the centralized weekly Market Analysis brief. The `MARKET_INTELLIGENCE` agent compares recent jobs, profile health, applications, and outcome signals against curated external labor-market sources such as BLS, Indeed Hiring Lab, Lightcast/Stanford AI Index coverage, and selected role-trend reporting. It fetches trusted source/index pages, discovers recent relevant articles, extracts readable text, keeps only summaries/claims/short excerpts, and uses OpenAI structured synthesis when configured. The report is stored as the latest completed `MARKET_INTELLIGENCE` `AgentRun.outputJson` and appears on the dashboard with tabs for overview, analytical charts, cited research, and recommended actions. Manual and scheduled search runs start a standard-depth market brief only after search, duplicate/stale detection, agency handoff, and the Search Profile Optimizer complete; if review or Apply Sprint gates are open, the search run records a pause reason instead of refreshing charts with stale profile-health data. The brief now feeds a guarded search-adaptation loop: low-risk additive signals can append unique preferred keywords and preferred companies to existing enabled search profiles, capped per run to avoid drift, while create/pause/merge/exclusion/threshold/required-keyword changes remain review-only proposals. The dashboard shows role-lane bar charts, skill-signal charts, historical trend lines from prior market runs, action/source proportion charts, match-quality distribution, cited article cards, source links, adaptation audit details, and review-only actions for search profiles, positioning, company targeting, and outreach.

Optional market research tuning:

```bash
MARKET_INTELLIGENCE_EXTRA_SOURCES="https://example.com/research"
MARKET_INTELLIGENCE_MAX_ARTICLES=8
```

Scheduled job search runs are configured in `vercel.json` and call `/api/cron/job-search` daily at `14:00 UTC`. Scheduled runs only use enabled profiles where scheduling is enabled. Set `CRON_SECRET` in the deployment environment to require `Authorization: Bearer <CRON_SECRET>` on cron requests. Command Center shows the latest manual search, latest cron-triggered search, configured cron expression, scheduled-profile count, and latest market brief; cron is only proven to be working when the database contains a `JobSearchRun` with `triggeredBy: "cron"`.

## Local Playwright Application Assistant

The app does not submit applications automatically. For jobs marked `ready_to_apply` with a direct employer or ATS application URL, you can run a local browser assistant that fills safe known fields, uploads the generated resume and cover letter when matching inputs are visible, learns from fields you complete manually, then stops before submit.

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
curl http://localhost:3000/api/agents/quality-gates
curl -X POST http://localhost:3000/api/search-optimization/run \
  -H "content-type: application/json" \
  -d '{"mode":"active"}'
curl http://localhost:3000/api/search-optimization/latest
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
  -d '{"target":"GENERATED_MATERIALS"}'
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
npm run test:e2e
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
