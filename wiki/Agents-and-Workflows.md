# Agents and Workflows

The app implements agents as deterministic services with typed inputs and outputs. Agents do not randomly talk to each other. Workflows orchestrate agents in a controlled order and persist `AgentRun` records for observability.

LangGraph is used selectively where durable state-machine behavior is useful. The production graph-backed workflows are now the application assistant and the recruiting agency. The assistant uses graph state for package validation, browser launch, field inspection, field command, user pause, resume, and ready-to-submit. The recruiting agency uses graph state for candidate discovery, approval, packet preparation, result recording, and finalization.

LangGraph is not used as a general replacement for every deterministic service. Most agents remain plain typed services because they are easier to test, reason about, and run synchronously.

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

Evaluation runs score examples and cluster repeated failure categories into proposals. Outcome calibration adds a cross-workflow scorecard from real applications, callbacks, rejections, duplicate groups, resurfaced suppressed jobs, and assistant failures; it refreshes automatically after high-signal job, application, email, and assistant events. `GET /api/observability/outcomes` reads it, including drill-down details and review-only actions for linked jobs, profiles, sources, duplicate groups, and assistant runs. `POST /api/observability/outcomes/recompute` manually repairs/backfills missing redacted quality examples, and `POST /api/observability/outcomes/propose-actions` promotes current outcome review actions into governed `AgentImprovementProposal` records without directly changing sources, profiles, suppressions, prompts, or workflows. Accepting a low-risk mapped proposal creates an active `SkillAdjustment` rule for the relevant skill. Current mapped categories include rejected high-score matches, weak dedupe, low-yield searches, agency candidate quality, cover-letter fields, and field classification. Future runs consume those rules in bounded deterministic ways: job-fit scoring adds caution, duplicate/stale detection tightens resurfacing checks, search profile review flags low-yield profiles, application QA adds review warnings, and agency approval requires cleaner candidates. Learning impact is computed from later agent outputs, agency learning events, and quality evaluations so Settings can show `helping`, `neutral`, `needs review`, or `insufficient data`. Active learned rules can be disabled from Settings; manual-triggered auto rollback can also disable rules that have at least two applied runs and repeated failed or needs-review impact. Rollback marks the `SkillAdjustment` as `REJECTED`, preserves disable and impact metadata in `patchJson`, stops the rule from future skill runs, and creates a redacted `ROLLBACK` quality example. Settings shows rollback history with source, reason, impact snapshot, matching rollback examples, and follow-up proposal status. Repeated rollbacks for the same target/category create review-only proposals; they do not auto-activate replacement learning. High-risk, unmapped, prompt, scoring-policy, search-source, and workflow proposals remain review-only and do not rewrite behavior automatically. The schema also supports generated materials, GitHub review, outreach, outcome learning, and command center quality targets for future evaluators.

## Implemented Agent Areas

- Candidate Intelligence
- Search Profile Manager
- Job Fit Scorer
- Resume Strategy
- Cover Letter Writer
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

## Candidate Ingestion Workflow

1. User uploads a resume or adds a project/career note.
2. Candidate Intelligence extracts structured evidence.
3. Evidence is labeled as verified, inferred, needs review, or rejected.
4. User reviews uncertain items.
5. Approved evidence becomes available for scoring and generated materials.

## Search Profile Optimization Workflow

1. Search profiles define target roles, industries, locations, compensation, keywords, and exclusions.
2. Search Profile Manager reviews profile definitions and performance.
3. It identifies overlap, broadness, narrowness, stale profiles, and noisy searches.
4. Suggested edits are shown for user approval.
5. Destructive actions are not applied automatically.

## Job Discovery and Scoring Workflow

1. Search runs collect jobs from enabled sources.
2. Duplicate/Stale Job Detector groups likely duplicates and flags stale jobs.
3. Job Fit Scorer scores the job against a search profile and approved evidence.
4. Jobs appear in the review queue with scores, strengths, risks, and missing keywords.
5. User approves, rejects, saves, or archives.

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
8. If an unknown required or custom field remains, the workflow creates a Needs Me request and waits.
9. When the user answers, the workflow resumes with a fill command and saves safe learning according to field-memory policy.
10. The workflow stops before final submit and waits for manual review.

Implementation notes:

- LangGraph dependencies are imported lazily inside server-only workflow construction to avoid bundling `@langchain/*` into unrelated Next.js RSC route chunks.
- `ApplicationAutomationRun.workflowStateJson` is the app-facing state projection used by Apply Sprint.
- `ApplicationAutomationRun.observabilityJson` stores optional LangSmith metadata; it does not replace workflow events or agent run events.
- Assistant failures and repairs create redacted `AgentQualityExample` records for later evaluation.
- LangGraph checkpointing is backed by Postgres.
- Playwright remains responsible for browser I/O; LangGraph decides workflow state and commands.

## Recruiting Agency Workflow

The recruiting agency workflow combines LangGraph orchestration with existing deterministic candidate filtering, duplicate suppression, and packet preparation skills.

1. User or cron starts the recruiting agency.
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
2. Outcome Learning reviews patterns across profiles, sources, industries, and materials.
3. It distinguishes low sample size from meaningful trends.
4. The app surfaces actionable strategy changes.

## Hands-Off Principle

The goal is to reduce physical work for the user without removing judgment. Agents can research, draft, score, prepare, and ask for help when blocked. They should not invent information or silently take high-impact external actions.
