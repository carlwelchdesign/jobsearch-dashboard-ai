# Agents and Workflows

The app implements agents as deterministic services with typed inputs and outputs. Agents do not randomly talk to each other. Workflows orchestrate agents in a controlled order and persist `AgentRun` records for observability.

LangGraph is used selectively where durable state-machine behavior is useful. The production graph-backed workflows are now the application assistant and the recruiting agency. The assistant uses graph state for package validation, browser launch, field inspection, field command, user pause, resume, and ready-to-submit. The recruiting agency uses graph state for candidate discovery, approval, packet preparation, result recording, and finalization.

LangGraph is not used as a general replacement for every deterministic service. Most agents remain plain typed services because they are easier to test, reason about, and run synchronously.

ADK is available as an opt-in TypeScript control plane for selected agents. It is enabled with `ADK_ENABLED=true` and starts with Daily Command Center, Market Intelligence, and Jolene's guarded app-operator layer. ADK-managed agent runs still use the app's `AgentRun` and `AgentRunEvent` records, while Jolene stores planned, confirmed, skipped, failed, and executed operator actions in chat `actionJson`. ADK is not used for durable browser workflows in this phase; LangGraph remains responsible for assistant and recruiting-agency state machines.

Slack Agent Ops is a command center and approval surface, not a third agent runtime. The Socket Mode worker posts redacted summaries for completed Jolene Chief of Staff, Jolene Operating Loop, and Recruiting Search Team runs, publishes a Slack Home tab with status/approval/run summaries, and routes `/jso` commands through the same internal services used by the app. Slack V3 adds daily briefings, threaded opportunity rooms, and coach-note capture. Opportunity rooms are mapped by `SlackThreadLink` so agents and trusted reviewers can keep discussing a job/application in one Slack thread while the app remains the durable record. Any Slack action that starts internal work must pass the Slack allowlist and a confirmation modal. Slack deliveries and run-start decisions are logged as `NotificationLog` type `slack`, and tied actions add `AgentRunEvent` records where applicable.

Application materials now include two specialist service agents in the standard `AgentRun` layer. `APPLICATION_EVIDENCE_CURATOR` builds the cover-letter evidence plan from approved candidate evidence, verified bullets, projects, work history, GitHub context, and cover-letter RAG. `HIRING_MANAGER_REVIEWER` scores cover letters as launch material, blocking deterministic fallback drafts, generic phrasing, off-target proof points, and unsupported claims before Apply Sprint or assistant launch. These agents are part of the Generated Materials quality gate with Resume Strategy, Cover Letter Writer, Application QA, and Anti-Generic Writing.

Jolene's ADK operator can now render inline confirmation cards for app-local repair plans. Confirmed execution is bounded to internal maintenance actions such as application integrity repair, duplicate/stale detection, email sync, Daily Command Center refresh, Market Intelligence refresh, and graph-run repair/retry/cancel. External submissions, email/outreach sending, employer-system interaction, and broad approve/reject/archive mutations remain outside Jolene's executable boundary.

The System Architecture agent is a read-only architecture confidence layer. A `SYSTEM_ARCHITECTURE` run scans App Router pages, API routes, Prisma schema models/enums, agent services, the code-first skill registry, ADK/LangGraph boundaries, docs, and `/plans`, then writes a connected map, workflow lanes, ranked architecture risks, documentation evidence, and recommended decisions to `AgentRun.outputJson`. `/architecture` renders the latest report and `POST /api/architecture` refreshes it. The agent does not execute repairs; it identifies weak connections such as missing skill coverage, undocumented high-impact API routes, unclear workflow ownership, and stale architecture docs.

Career CEO mode adds a persistent hiring mandate for Jolene. `CareerMission` stores the 30-day high-income sprint target, compensation floor, ideal target, role tracks, dealbreakers, fallback paths, daily capacity, and tone preferences. Jolene's Career CEO brief ranks the current pipeline by income relevance using interviews, ready applications, high-score jobs, follow-ups, blockers, enabled profiles, salary gaps, and mission targets.

Career CEO standups add the closed-loop layer. `CareerSprintSnapshot` persists daily sprint score, income momentum, attention debt, money-move statuses, completed move keys, mission JSON, and the brief JSON. Jolene can generate a new standup on demand, compare against the latest snapshot, identify stale money moves, and explain what needs immediate attention without taking external action.

## Agent Run Observability

`AgentRun` stores:

- agent type
- input JSON
- output JSON
- observability metadata for optional LangSmith tracing
- `graphThreadId`
- `currentNode`
- `workflowVersion`
- `workflowStateJson`
- optional `parentRunId`
- status
- error
- timestamps
- user association when available

The Agent Board shows recent runs, recommendations, warnings, and review needs.

Runtime source is visible on the Agent Board:

- `Standard agent run` for plain typed services.
- `ADK control plane` for opt-in ADK-supervised low-risk agents.
- `LangGraph` for durable workflow runs with checkpoint, resume, repair, retry, or cancel controls.

Graph-backed runs on the Agent Board also expose reliability controls when valid:

- `Repair` is available for stale pending/running graph runs and marks the run failed at `stale_graph_run`.
- `Retry` is available for failed or stale graph runs and starts a child run using `parentRunId`.
- `Cancel` is available for pending/running graph runs and records a `manual_cancel` failure.
- Each reliability action emits an `AgentRunEvent` and captures a redacted quality example for later review.

When `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY` are configured, agent runs and AI helper calls are wrapped in LangSmith traces. The app traces redacted metadata by default: step names, model names, schema names, IDs, counts, decisions, statuses, and field labels are allowed; raw resume text, cover letters, answers, prompts, email, phone, secrets, and raw browser content are masked. LangSmith failure is non-blocking.

## Agent Quality Evaluations

The app has a local quality loop for turning mistakes into repeatable checks. `AgentQualityDataset` groups examples, `AgentQualityExample` stores redacted failure/success cases, `AgentQualityEvaluation` stores scored results, and `AgentImprovementProposal` stores propose-only changes for review.

The supported deterministic evaluator targets are `APPLICATION_ASSISTANT`, `RECRUITING_AGENCY`, `JOB_SEARCH`, and `JOB_MATCHING`.

- `APPLICATION_ASSISTANT` uses `application_assistant_autofill` examples from assistant failures, browser/page-close repairs, manual submit corrections, and explicit Jolene mistake reports.
- `RECRUITING_AGENCY` uses `recruiting_agency_decisions` examples from candidate failures, stale graph repairs, manual cancels, and retry-needed agency runs.
- `JOB_SEARCH` uses `job_search_results` examples from failed/partial runs, low saved-result yield, and weak dedupe signals.
- `JOB_MATCHING` uses `job_matching_decisions` examples from high-scoring matches the user rejected.

Evaluation runs score examples and cluster repeated failure categories into proposals. Outcome calibration adds a cross-workflow scorecard from real applications, callbacks, rejections, duplicate groups, resurfaced suppressed jobs, and assistant failures; it refreshes automatically after high-signal job, application, email, and assistant events. `GET /api/observability/outcomes` reads it, including drill-down details and review-only actions for linked jobs, profiles, sources, duplicate groups, and assistant runs. Each action includes proposal lifecycle metadata when it has been promoted, so Settings can show advisory, proposal open, accepted, or dismissed states. `POST /api/observability/outcomes/recompute` manually repairs/backfills missing redacted quality examples, and `POST /api/observability/outcomes/propose-actions` promotes current outcome review actions into governed `AgentImprovementProposal` records without directly changing sources, profiles, suppressions, prompts, or workflows. Manual recompute and throttled automatic refreshes create aggregate `OutcomeCalibrationSnapshot` rows, and `GET /api/observability/outcomes/trends` compares recent snapshots for improving, flat, regressing, or insufficient-data trends. `POST /api/observability/outcomes/trends/alerts` promotes current regressing trends into deduped review-only proposals, and `GET /api/observability/outcomes/trends/triage` ranks open regression proposals by priority, owner area, reason, and review route. Accepting a low-risk mapped proposal creates an active `SkillAdjustment` rule for the relevant skill. Current mapped categories include rejected high-score matches, weak dedupe, low-yield searches, agency candidate quality, cover-letter fields, and field classification. Future runs consume those rules in bounded deterministic ways: job-fit scoring adds caution, duplicate/stale detection tightens resurfacing checks, search profile review flags low-yield profiles, application QA adds review warnings, and agency approval requires cleaner candidates. Learning impact is computed from later agent outputs, agency learning events, and quality evaluations so Settings can show `helping`, `neutral`, `needs review`, or `insufficient data`. Active learned rules can be disabled from Settings; manual-triggered auto rollback can also disable rules that have at least two applied runs and repeated failed or needs-review impact. Rollback marks the `SkillAdjustment` as `REJECTED`, preserves disable and impact metadata in `patchJson`, stops the rule from future skill runs, and creates a redacted `ROLLBACK` quality example. Settings shows rollback history with source, reason, impact snapshot, matching rollback examples, and follow-up proposal status. Repeated rollbacks for the same target/category create review-only proposals; they do not auto-activate replacement learning. High-risk, unmapped, prompt, scoring-policy, search-source, and workflow proposals remain review-only and do not rewrite behavior automatically. The schema also supports generated materials, GitHub review, outreach, outcome learning, and command center quality targets for future evaluators.

## Implemented Agent Areas

- Candidate Intelligence
- Search Profile Manager
- Job Fit Scorer
- Resume Strategy
- Cover Letter Writer
- Application Evidence Curator
- Hiring Manager Reviewer
- Application QA
- Anti-Generic Writing
- Duplicate/Stale Job Detector
- Outcome Learning
- Daily Command Center
- Recruiter Intelligence
- Portfolio Match
- GitHub Portfolio Review
- Interview Prep
- Company Research
- Compensation Opportunity
- Networking Strategy
- Search Expansion
- LinkedIn Content Team
- System Architecture

## LinkedIn Content Team Workflow

The LinkedIn Content Team turns recent Job Search OS work into approved public posts. It is intentionally memory-aware: before drafting, the workflow builds a public-safe memory and analytics pack from recent `AgentRun` and `AgentRunEvent` history, search-run analytics, application/outcome counts, Market Intelligence output, aggregate LinkedIn post performance, active `SkillAdjustment` rules, prior LinkedIn drafts, approved edits, archived drafts, and screenshot metadata.

The team roles are:

- `Documentarian` for recent work and decisions.
- `Analytics Narrator` for aggregate funnel, application, source, and outcome numbers.
- `Product Strategist` for the broader product lesson.
- `Editor` for clarity and credible tone.
- `Visual Producer` for screenshot selection.
- `Privacy Reviewer` for sensitive-data and unsupported-claim gates.
- `Publisher` for the final Share on LinkedIn call after approval.

Public policy is aggregate-only. The agents can cite jobs fetched, filtered, scored, saved, drop-off reasons, application status counts, source coverage, learning-loop signals, impressions, reach, engagement, and content-pillar performance. They cannot publish company names, job URLs, salaries, recruiters, emails, application-specific outcomes, viewer identities, or commenter identities unless a future approval layer explicitly allows named examples.

Approval is the publishing gate. The user can edit the draft, review agent notes and provenance, and then click **Approve and publish**. If the draft passes privacy/provenance checks and a LinkedIn publishing connection with `w_member_social` exists, the app immediately publishes the post and stores the LinkedIn post id. Failures move the draft to `FAILED` with a retryable error.

## Candidate Ingestion Workflow

1. User uploads a resume or adds a project/career note.
2. Candidate Intelligence extracts structured evidence.
3. Evidence is labeled as verified, inferred, needs review, or rejected.
4. User reviews uncertain items.
5. Approved evidence becomes available for scoring and generated materials.
6. Approving a new resume upload re-onboards the candidate profile: the latest approved upload becomes the active resume source, Candidate Intelligence records resume-upload evidence, and Search Profile Manager proposes reviewable search profiles without creating or deleting them automatically.

## Search Profile Optimization Workflow

1. Search profiles define target roles, industries, locations, compensation, keywords, and exclusions.
2. Search Profile Manager reviews profile definitions and performance.
3. It identifies overlap, broadness, narrowness, stale profiles, noisy searches, and resume re-onboarding profile opportunities.
4. Market Intelligence reviews recent pipeline data against sourced labor-market signals and produces review-only search, positioning, company-targeting, and outreach recommendations.
5. Suggested edits are shown for user approval.
6. Destructive actions are not applied automatically.

## Job Discovery and Scoring Workflow

1. Search runs collect jobs from enabled sources.
2. Duplicate/Stale Job Detector groups likely duplicates and flags stale jobs.
3. Job Fit Scorer scores the job against a search profile and approved evidence.
4. Jobs appear in the review queue with scores, strengths, risks, and missing keywords.
5. Recruiting Agency prepares eligible high-confidence matches for Apply Sprint.
6. The loop pauses while jobs still need approve/reject review or prepared applications still need Apply Sprint work.
7. Search Profile Manager refreshes profile-health snapshots when the gates are clear.
8. Market Intelligence runs after the optimizer so Profile Health and market charts use current profile data.
9. User approves, rejects, saves, archives, applies, and records outcomes at the manual gates.

## Application Packet Workflow

1. User approves a job.
2. The app creates or updates an application tracker.
3. Resume Strategy chooses the positioning and evidence emphasis.
4. RAG retrieves approved candidate evidence.
5. Materials are generated as a draft application packet.
6. Application QA checks unsupported claims, style violations, and weak evidence.
7. User reviews and approves before submission or outreach.

## Application Assistant Workflow

The application assistant workflow combines LangGraph orchestration with local Playwright execution.

1. User launches the assistant from Apply Sprint or an application route.
2. LangGraph validates the ready application package.
3. LangGraph starts the local Playwright runner.
4. Playwright opens the employer form and performs the broad safe fill pass.
5. Playwright reports field inventory and fill events back to the app.
6. The workflow stores current node, events, field decisions, pending command, and counts on the latest automation run.
7. If a known field remains, the workflow issues a fill/upload/skip command.
8. If an unknown required or custom field remains, the workflow enters learning mode. The browser stays open, the user completes the field once, and the assistant records the observed answer through field learning.
9. When the user answers, the workflow resumes with a fill command and saves safe learning according to field-memory policy.
10. The workflow stops before final submit and waits for manual review.
11. Playwright keeps observing manual field edits, submit intent, submit confirmation, and browser close events until the browser session ends.
12. Submit confirmation or submit-click-then-close marks the application applied; closing before submit moves the run to `NEEDS_USER` with an `assistant_closed` blocker.

Implementation notes:

- LangGraph dependencies are imported lazily inside server-only workflow construction to avoid bundling `@langchain/*` into unrelated Next.js RSC route chunks.
- `ApplicationAutomationRun.workflowStateJson` is the app-facing state projection used by Apply Sprint.
- Apply Sprint also derives diagnostics and a timeline from `ApplicationAutomationRun`, structured `ASSISTANT_EVENT` log lines, and log classification so browser closes, blockers, setup failures, and ready-to-review states are visible without reading the raw log first.
- `ApplicationAutomationRun.observabilityJson` stores optional LangSmith metadata; it does not replace workflow events or agent run events.
- Assistant failures and repairs create redacted `AgentQualityExample` records for later evaluation.
- LangGraph checkpointing is backed by Postgres.
- Playwright remains responsible for browser I/O; LangGraph decides workflow state and commands.
- `Needs Me` is reserved for hard blockers and sensitive approvals. Normal unknown application fields should be learned from manual input instead of creating queue work.
- Progressive learning auto-uses low-risk fields immediately, can promote repeated medium/custom answers after consistent observations, and keeps high-risk fields such as salary, legal, demographic, veteran/disability, and sponsorship answers behind approval.

## Recruiting Agency Workflow

The recruiting agency workflow combines LangGraph orchestration with existing deterministic candidate filtering, duplicate suppression, and packet preparation skills. Search runs can start this workflow automatically when eligible 90+ matches exist, unless another agency run is already pending or running. The search run records structured handoff metadata so the Dashboard can show the linked agency run, live events, totals, skip reasons, and repair/retry controls.

1. User, cron, or search auto-handoff starts the recruiting agency.
2. LangGraph creates a durable `AgentRun` thread and loads the approval policy.
3. The workflow finds eligible unsuppressed matches above the configured score threshold.
4. Each candidate is evaluated, approved when eligible, and passed to the packet-preparation skill.
5. Candidate successes and failures are emitted as `AgentRunEvent` records for live UI activity.
6. The workflow finalizes the run with the same result shape used by the existing agency API.
7. Candidate-level failures create recruiting-agency quality examples so repeated issues can be reviewed.

Implementation notes:

- The current first pass processes candidates in a graph node while persisting explicit logical nodes such as `evaluateCandidate`, `approveCandidate`, `prepareApplicationPacket`, and `recordCandidateResult`.
- `AgentRun.workflowStateJson` is the app-facing state projection used by the status endpoint.
- Stale or failed agency runs can be repaired, cancelled, or retried from the Agent Board. Retry creates a child run rather than mutating the failed source run.
- LangGraph checkpointing is backed by Postgres outside test mode.
- The workflow preserves the same suppression and dedupe behavior as the non-graph implementation.

## Outcome Learning Workflow

1. User records outcomes or email sync detects them.
2. Application reconciliation syncs canonical duplicate trackers so submitted jobs win over stale approved/ready duplicates.
3. Application integrity repair catches mechanical drift across trackers, job matches, email confirmations, submitted assistant runs, and resurfaced active matches.
4. Outcome Learning reviews patterns across profiles, sources, industries, and materials.
5. It distinguishes low sample size from meaningful trends.
6. The app surfaces actionable strategy changes.

## Hands-Off Principle

The goal is to reduce physical work for the user without removing judgment. Agents can research, draft, score, prepare, and ask for help when blocked. They should not invent information or silently take high-impact external actions.
