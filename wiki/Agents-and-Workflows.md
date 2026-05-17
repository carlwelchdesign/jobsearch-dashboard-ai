# Agents and Workflows

The app implements agents as deterministic services with typed inputs and outputs. Agents do not randomly talk to each other. Workflows orchestrate agents in a controlled order and persist `AgentRun` records for observability.

LangGraph is used selectively where durable state-machine behavior is useful. The first production use case is the application assistant workflow, where the system needs to move through states such as package validation, browser launch, field inspection, field command, user pause, resume, and ready-to-submit.

LangGraph is not used as a general replacement for every deterministic service. Most agents remain plain typed services because they are easier to test, reason about, and run synchronously.

## Agent Run Observability

`AgentRun` stores:

- agent type
- input JSON
- output JSON
- status
- error
- timestamps
- user association when available

The Agent Board shows recent runs, recommendations, warnings, and review needs.

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
- LangGraph checkpointing is backed by Postgres.
- Playwright remains responsible for browser I/O; LangGraph decides workflow state and commands.

## Outcome Learning Workflow

1. User records outcomes or email sync detects them.
2. Outcome Learning reviews patterns across profiles, sources, industries, and materials.
3. It distinguishes low sample size from meaningful trends.
4. The app surfaces actionable strategy changes.

## Hands-Off Principle

The goal is to reduce physical work for the user without removing judgment. Agents can research, draft, score, prepare, and ask for help when blocked. They should not invent information or silently take high-impact external actions.
