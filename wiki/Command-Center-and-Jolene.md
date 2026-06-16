# Today Cockpit and Jolene

## Today Cockpit

The Today cockpit at `/dashboard` is the main daily page for the job search system. It is optimized for the candidate's highest-value loop: find jobs, make quick decisions, apply to prepared roles, and follow up.

It shows:

- a single daily goal strip with the next best action
- Find jobs, Decide, Apply today, and Follow up lanes
- ready-to-apply, review, blocker, applied-today, and search-saved counts
- the top review decision when one is blocking packet prep
- the next ready application and manual applied confirmation
- blocker and daily-plan entry points
- system support below the daily workflow

## Live Search Updates

The Find Jobs page reads the latest `JobSearchRun` and displays meaningful progress while a run is active. The primary layer focuses on run status, fetched/filtered/saved counts, ready signal, and profile optimization. Charts, live event streams, agency handoff internals, and optimizer diagnostics live behind **Run details**.

Tracked run data includes:

- status: running, completed, failed, partial
- trigger: manual or cron
- started and finished timestamps
- profile IDs searched
- jobs fetched
- jobs after dedupe
- jobs after filters
- jobs saved
- progress entries
- errors

The goal is for the user to see what the search system is actually doing instead of only seeing a spinner.

## LinkedIn Analytics

The Social operations route includes a LinkedIn Analytics card for published posts. It supports two data paths:

- API sync through the LinkedIn Member Post Statistics API when the analytics connection has `r_member_postAnalytics`.
- CSV paste import when API access is unavailable or pending LinkedIn approval.

The card shows executive KPIs for impressions, reach, reactions, comments, reposts, saves, sends, link clicks, premium CTA clicks, follower gains, profile views, and engagement rate. Recharts panels show metric trends, engagement mix, top posts, and reach-versus-engagement scatter. Filters cover date range, metric, and source (`API`, `CSV`, or all).

Only aggregate post metrics are stored. Viewer identities, commenter identities, private profile data, job URLs, salaries, recruiters, and application-specific outcomes are not collected for this dashboard.

The main search action starts the gated search improvement loop. After discovery, scoring, duplicate detection, and recruiting-agency handoff, Find Jobs shows the Profile Health gate. If unresolved `needs_review` jobs or prepared-but-unworked applications remain, the loop pauses and explains the manual work required. When those gates clear, the Search Profile Manager refreshes health snapshots and Market Intelligence runs from the fresh profile data.

## Apply Sprint

The Apply page starts with the next ready application rather than the full diagnostic funnel. The primary path shows the selected application, actual application link, packet readiness, assistant launch, cover-letter copy, manual applied confirmation, and reject/remove action.

Candidates, agency results, hidden/suppressed rows, queue progress, reset controls, assistant run details, and raw logs remain available behind details panels. This keeps normal daily application work fast while preserving auditability and recovery for complex cases.

## Daily Plan

The daily command center agent can produce a short action list from current jobs, applications, blockers, follow-ups, and profile health.

Examples:

- review high-fit jobs
- generate packets for approved jobs
- resolve open questions
- follow up on stale applications
- improve a noisy search profile

## Jolene

Jolene is the persistent assistant available on every screen from a floating "Ask Jolene" button.

Jolene is context-aware. The app passes the current route and relevant local data to Jolene so she can answer questions like:

- Why is this job being shown?
- What score or signal caused this recommendation?
- What should I do next on this page?
- What blocker is stopping this application?
- Which setting controls this behavior?
- How should future search parameters change?

Jolene also has app-aware local retrieval tools. Before falling back to a general LLM answer, she can search generated cover letters, generated materials, application packets, application trackers, and job records. This supports direct operational requests such as:

- Where is the cover letter for Linear?
- Show me application materials for Terzo.
- Find the application for a specific company or role.
- Open the job record for a company.

When Jolene finds a match, she returns direct links to the relevant local pages and exports, including generated cover-letter text/PDF routes, generated materials, application detail, and job detail. She does not include full cover-letter bodies in default answers; she points to the stored material unless the user explicitly asks for content.

## ADK App Operator

Jolene has an ADK-backed app-operator layer for broader app operations. Exact lookups and career coaching still run through deterministic tools first, but operational requests can now be planned as ADK tool activity.

Jolene can directly run safe internal actions:

- run a fresh job search
- check duplicate and stale jobs
- sync job-response email
- refresh the Daily Command Center
- refresh Market Intelligence
- diagnose cross-page state drift such as applied jobs still appearing in ready-to-apply queues

Jolene must ask for confirmation before guarded actions:

- approving, rejecting, archiving, deleting, or bulk-changing jobs or applications
- repairing state, retrying/cancelling agent runs, or disabling learned rules
- sending email/outreach, submitting applications, or interacting with external employer systems

Confirmed operator actions are shown as inline cards under Jolene messages. The user can confirm or cancel the exact plan Jolene proposed. Confirmed execution is intentionally limited to app-local internal repairs:

- application integrity repair
- duplicate/stale job detection
- job-response email sync
- Daily Command Center refresh
- Market Intelligence refresh
- graph-backed agent run repair, retry, or cancel when the plan includes a run id

External actions are never executed by Jolene. Submitting applications, sending email or outreach, interacting with employer systems, and broad approve/reject/archive changes remain manual or page-routed even if Jolene can explain the plan.

Operator activity is stored on Jolene messages as planned, confirmed, executed, skipped, failed, or cancelled actions so the UI and future agent-review surfaces can show what Jolene did, what she skipped, and what requires confirmation. `POST /api/jolene/confirm` validates the stored message plan, checks the internal-repairs boundary, rejects expired or mismatched plans, updates the source message, and appends an execution result message.

## Career-Aware Coaching

Jolene can answer interview and positioning questions from local career context. When a user pastes recruiter guidance or asks how a success profile applies to their background, Jolene loads compact evidence from:

- candidate profile summaries, roles, skills, domains, and industries
- approved candidate evidence
- work experiences, projects, and experience bullets
- application outcomes and interview-stage signals
- recent app-building themes such as agentic workflows, RAG, LangGraph, automation, and quality loops

This path is non-mutating. Pasted recruiter text containing words like "email", "review", or "interview" should not trigger email sync unless the user explicitly asks Jolene to check or sync email. Career coaching answers map prompts to evidence-backed talking points, likely gaps, and metrics to prepare.

## Career CEO Mode

Jolene can operate from a persistent `CareerMission` that describes the user's current hiring mandate. The default mission is a 30-day high-income sprint with an aggressive-but-truthful policy: maximize interviews, recruiter conversations, compensation leverage, and offers while keeping claims evidence-backed and external actions gated.

The mission stores:

- target minimum and ideal compensation
- currency and sprint horizon
- urgency mode and tradeoff policy
- role tracks, dealbreakers, and acceptable fallback paths
- daily capacity, energy notes, and tone preferences

Ask for a "Career CEO brief" or "money moves" to have Jolene rank the current sprint queue by income relevance and urgency. The brief reads ready applications, interview-stage applications, high-score jobs, follow-ups, blockers, enabled profiles, salary gaps, and mission targets. It returns:

- top income-relevant actions with app links
- compensation and salary-data risks
- current pipeline leverage
- recommended sprint actions
- confidence in the brief

Career CEO standups close the loop across days. A standup creates a `CareerSprintSnapshot` from the current brief, compares it with the previous snapshot, and returns:

- sprint score from current pipeline leverage and attention debt
- income momentum: improving, flat, regressing, or insufficient data
- attention debt from stale money moves and open blockers
- stable money-move statuses: new, active, stale, completed, or superseded
- proactive prompt reason when something needs immediate focus

Mission APIs:

- `GET /api/jolene/mission`
- `PATCH /api/jolene/mission`
- `POST /api/jolene/career-brief`
- `GET /api/jolene/career-standup`
- `POST /api/jolene/career-standup`

## Jolene Persistence

Jolene stores conversations in:

- `JoleneConversation`
- `JoleneMessage`

Conversation history is scoped by user and page context, so a job-detail conversation can remain attached to that job while settings or dashboard conversations stay separate.

## Voice

Jolene supports browser-native voice features where supported:

- microphone dictation through Web Speech recognition
- spoken replies through browser speech synthesis

Voice is optional and controlled from Jolene's drawer.

## Route Contexts

Jolene currently builds specialized context for:

- dashboard
- jobs list
- job detail
- applications
- application detail
- Apply Sprint
- blocker review
- Settings

For unknown routes, she falls back to general workflow help and navigation guidance.
