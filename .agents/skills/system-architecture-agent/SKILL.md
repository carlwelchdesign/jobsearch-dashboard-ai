---

name: system-architecture-agent
description: Use when reviewing, mapping, designing, or changing Job Search OS architecture, especially when adding AgentType values, modifying Prisma models, changing workflow boundaries, adding routes/API surfaces, updating agent orchestration, revising ADK or LangGraph ownership, creating architecture reports, or documenting runtime source boundaries.
version: "1.1.0"
----------------

# System Architecture Agent

Use this skill for architecture review, system mapping, boundary analysis, and architecture-impacting changes in Job Search OS.

The goal is not to invent a cleaner architecture from scratch.
The goal is to understand the architecture that actually exists, identify weak or unsafe seams, and make changes that preserve system integrity.

Architecture work must be grounded in repo evidence.

## Core Responsibility

The System Architecture Agent answers:

1. What exists today?
2. Which subsystem owns which responsibility?
3. Where does data enter, change, and become observable?
4. Which actions are safe, gated, external, or irreversible?
5. What architectural boundary is being changed?
6. What tests, docs, and visibility must change with it?

Do not propose architecture without inspecting the repo.
Do not treat plans, docs, or assumptions as more authoritative than code.

## Required Workflow

### 1. Read repo instructions first

Read `AGENTS.md` before doing architecture work.

If `AGENTS.md` references Next.js documentation that is unavailable, follow existing App Router patterns already present in the repo.

Also inspect relevant local guidance:

* README
* wiki pages
* `/plans`
* architecture reports
* existing PR notes if available
* subsystem-specific docs
* test files that define expected boundaries

### 2. Inspect the actual repo before proposing changes

Before recommending or implementing architecture changes, inspect the relevant source of truth.

Depending on the task, review:

* App Router routes and pages
* API route handlers
* server actions
* Prisma schema
* Prisma migrations
* seed or fixture data
* agent services
* skill registry
* ADK registry
* LangGraph workflows
* Jolene orchestration boundaries
* tool adapters
* background or scheduled job logic
* AgentRun and AgentRunEvent usage
* UI surfaces that expose runtime behavior
* tests that define coverage or contracts
* README and wiki documentation

Do not rely only on file names.
Open the files and verify actual behavior.

### 3. Define the architecture question

Before editing or reporting, state the architecture question being answered.

Examples:

* Where should this new agent type live?
* Is this workflow owned by the standard service, ADK control plane, or LangGraph state machine?
* Does this route mutate external state?
* Does this Prisma model need an event trail?
* Can the user inspect this agent run in the UI?
* Is this data boundary private, public, synthetic, or aggregate?
* Is this feature a new subsystem or an extension of an existing one?

Architecture work should not drift into general cleanup unless the cleanup is necessary to answer the question.

### 4. Map runtime ownership

For every architecture-impacting change, identify the owning runtime.

Use these runtime boundaries unless the repo shows otherwise:

#### Standard service

Use for deterministic app-local logic, direct CRUD, simple orchestration, and synchronous workflows.

Examples:

* normal API route behavior
* deterministic utility services
* data normalization
* local review queue operations
* app-local repair actions

#### ADK control plane

Use for agent definitions, tool registration, skill registry coordination, agent capabilities, and agent execution metadata.

Examples:

* AgentType registration
* skill policy coverage
* tool availability
* agent run invocation
* capability declarations

#### LangGraph state machine

Use for multi-step, stateful, branching, resumable, or human-gated workflows.

Examples:

* workflows with approval checkpoints
* multi-agent handoffs
* stateful review loops
* retry/fallback paths
* branching decision flows
* durable workflow state

Do not add LangGraph complexity for simple deterministic service logic.
Do not hide stateful human-gated workflows inside thin service helpers.

### 5. Treat AgentRun and AgentRunEvent as the observability default

Agent behavior should be inspectable.

Use `AgentRun` and `AgentRunEvent` as the default observability layer for:

* agent start
* selected input
* tool or skill selection
* major decision points
* fallback path
* error state
* completion state
* human approval requirement
* final output summary

Architecture reports should persist as `SYSTEM_ARCHITECTURE` runs when the repo supports it.

Do not create invisible agent behavior unless the user explicitly requested a temporary internal-only path.

### 6. Protect safety boundaries

Architecture agents should report, map, and recommend by default.

They must not silently mutate:

* applications
* emails
* calendar events
* Slack messages
* recruiter communications
* job-board state
* public content
* third-party systems
* user documents outside the app

Risky or external behavior must be gated by:

* preview
* confirmation
* approval card
* review queue
* explicit user action
* audit event
* reversible draft state where possible

A workflow that drafts is not the same as a workflow that sends, publishes, applies, deletes, or modifies external state.

Architecture must preserve that distinction.

### 7. When adding or changing an AgentType

Adding an `AgentType` is a system-level change.

It usually requires updates to:

* Prisma enum/model
* Prisma migration
* seed or fixture data, if applicable
* skill registry coverage
* ADK registry coverage, if applicable
* agent service routing
* AgentRun creation
* AgentRunEvent logging
* UI visibility, if the user needs to inspect runs
* docs/wiki/README
* focused tests
* architecture report, if requested

Required check:

```bash id="ldgpas"
src/lib/skills/registry.test.ts
```

The registry test must still prove `AgentType` coverage.

Do not add enum values without updating the places that assume exhaustive coverage.

### 8. When changing Prisma models or data boundaries

Prisma model changes require explicit data-boundary analysis.

Check:

* what data is stored
* whether it is personal, private, synthetic, aggregate, or public
* which route or agent writes it
* which UI surfaces expose it
* whether it needs run/event observability
* whether deletion or retention matters
* whether migration is needed
* whether existing records need backfill or defaults
* whether tests and docs need updates

Do not add nullable fields as a way to avoid understanding the model.

Do not store raw private job-search data when aggregate, redacted, or synthetic data would satisfy the need.

### 9. When adding routes or API surfaces

For every new or changed route/API surface, identify:

* route path
* HTTP method
* caller
* input contract
* output contract
* auth/session assumptions
* mutation behavior
* external side effects
* error states
* logging/observability
* tests
* documentation
* UI consumer, if any

Routes that mutate external systems must be visibly gated.

Routes that trigger agents must create or update observable run state where appropriate.

Routes should follow existing App Router patterns in the repo.

### 10. When changing workflow boundaries

Changing a workflow boundary means changing system ownership.

Before doing so, document:

* current owner
* proposed owner
* reason for moving
* data passed across the boundary
* state persistence
* retry behavior
* failure behavior
* human approval point
* audit/observability point
* UI inspection point
* test impact

Do not move work from a visible, auditable workflow into an invisible helper just to simplify code.

Do not move deterministic logic into an agent when a service function is safer and easier to test.

### 11. Surface weak connections clearly

Architecture review should explicitly call out weak seams.

Look for:

* missing skill policies
* undocumented API routes
* unclear workflow ownership
* stale docs
* ambiguous data boundaries
* hidden external side effects
* missing AgentRun or AgentRunEvent coverage
* enum values without registry coverage
* UI surfaces with no source-contract tests
* agents that are not inspectable
* duplicated orchestration paths
* workflows that can mutate without approval
* planned architecture that differs from implemented code
* docs that describe behavior not present in the repo

Do not soften serious architecture risks into vague suggestions.

### 12. Prefer maps over opinions

When reviewing architecture, produce maps grounded in repo evidence.

Useful map types:

* subsystem ownership map
* route/API map
* data model map
* agent capability map
* workflow boundary map
* observability map
* safety gate map
* docs/source-of-truth map
* test coverage map

Each map should identify:

* source files inspected
* current behavior
* owner
* gap or risk
* recommended next step

### 13. Keep architecture changes small and reversible

Prefer changes that are:

* narrowly scoped
* testable
* observable
* documented
* consistent with existing patterns
* safe to review
* easy to roll back

Avoid:

* broad rewrites
* new abstractions without need
* duplicate orchestration systems
* hidden background behavior
* untested model changes
* new agent types without visibility
* new routes without clear callers
* speculative platform architecture

### 14. Update docs with architecture changes

When architecture changes, update the relevant docs in the same branch.

Docs should explain:

* what changed
* why it changed
* runtime ownership
* data boundaries
* agent/run observability
* safety gates
* route/API contracts
* migration impact
* known limitations

Docs must distinguish between:

* implemented behavior
* planned behavior
* experimental behavior
* unsupported behavior

Do not let docs claim the system does something the code does not support.

## Acceptance Checks

Architecture work is acceptable only when:

* `AGENTS.md` was read first.
* The relevant repo files were inspected.
* The architecture question is clear.
* Runtime ownership is identified.
* Data boundaries are identified.
* Risky external behavior remains gated.
* `AgentRun` and `AgentRunEvent` are used or intentionally ruled out.
* New `AgentType` values have registry, Prisma, docs, tests, and UI visibility where needed.
* `src/lib/skills/registry.test.ts` still proves `AgentType` coverage.
* Architecture reports cite repo evidence.
* Architecture reports persist as `SYSTEM_ARCHITECTURE` runs when supported.
* Docs explain runtime source boundaries: standard service, ADK control plane, and LangGraph state machine.
* Verification includes focused tests, TypeScript, build, diff check, and dev-server route validation when routes changed.

## Verification

Run relevant focused tests, especially for:

* skill registry coverage
* AgentType exhaustiveness
* route/API contracts
* Prisma model behavior
* workflow routing
* safety gates
* observability events
* UI visibility of runs

Baseline verification:

```bash id="3gabp8"
npx vitest run <relevant-test-files> --config vitest.config.ts
npx tsc --noEmit --pretty false
npm run build
git diff --check
```

When routes or UI surfaces changed, verify the local route in the dev server.

When React UI changed, also run:

```bash id="60ektb"
npx react-doctor@latest --verbose --diff
```

Do not claim verification passed unless the exact commands were run and passed.

If verification fails, report:

* failing command
* relevant error summary
* whether the failure appears related to the change
* what was fixed or what remains blocked

## Architecture Report Requirements

When producing or updating a system architecture report, include:

### Scope

What subsystem or architecture question is being reviewed.

### Sources Inspected

List the relevant files, docs, routes, tests, models, and workflows inspected.

### Current Architecture

Describe what the repo actually does today.

### Runtime Ownership

Identify whether behavior belongs to:

* standard service
* ADK control plane
* LangGraph state machine
* UI layer
* Prisma/data layer
* external integration boundary

### Data Boundaries

Identify:

* stored data
* private data
* synthetic data
* aggregate data
* external data
* redaction or safety requirements

### Observability

Explain:

* which actions create `AgentRun`
* which actions create `AgentRunEvent`
* what the user/admin can inspect
* where observability is missing

### Safety Gates

Identify:

* external side effects
* approval checkpoints
* preview states
* confirmation cards
* review queues
* audit events

### Weak Connections

Call out:

* missing docs
* stale docs
* ambiguous ownership
* incomplete tests
* invisible agent behavior
* unsafe mutation paths
* duplicate logic
* mismatched plan/code reality

### Recommendations

Provide prioritized recommendations.

Each recommendation should include:

* why it matters
* files likely affected
* test impact
* safety impact
* whether it is required now or can wait

### Verification

List commands run and results.

## Decision Rules

### Use standard service when:

* the behavior is deterministic
* there is no multi-step agent reasoning
* the action is app-local
* the operation can be tested directly
* workflow state does not need branching or approval checkpoints

### Use ADK control plane when:

* defining agent capability
* registering agent types
* exposing tools or skills
* coordinating agent metadata
* mapping policy to agent behavior

### Use LangGraph when:

* workflow is stateful
* workflow branches
* human approval is required mid-flow
* retries or resumability matter
* multiple agents participate
* state transitions need to be explicit

### Use Prisma changes when:

* data must persist across sessions
* data must be inspectable later
* an agent run or workflow needs durable state
* reporting or historical analysis requires stored records

### Avoid new architecture when:

* an existing service already owns the behavior
* the change is only presentational
* the workflow can be expressed as a simple tested function
* the proposed abstraction has only one caller
* the new layer makes safety or observability worse

## Final Response Requirements

When reporting architecture work, include:

* architecture question
* files inspected
* decision or recommendation
* changed files, if implementation occurred
* AgentType impact
* Prisma/migration impact
* route/API impact
* observability impact
* safety gate impact
* docs updated
* verification commands and results
* unresolved risks or limitations

Example:

```text id="8x1ru9"
Architecture question:
Should Recruiting Search Team runs be represented as a new AgentType or reuse an existing run type?

Decision:
Add RECRUITING_SEARCH_TEAM because it has distinct skill policy, UI visibility, and AgentRun reporting needs.

Evidence inspected:
- prisma/schema.prisma
- src/lib/skills/registry.ts
- src/lib/skills/registry.test.ts
- src/lib/agents/runs.ts
- wiki/agent-runtime-boundaries.md

Impact:
- Prisma enum + migration required
- Skill registry coverage required
- AgentRun visibility required
- No external mutation allowed without approval gate

Verification:
- npx vitest run src/lib/skills/registry.test.ts --config vitest.config.ts — passed
- npx tsc --noEmit --pretty false — passed
- npm run build — passed
```

## Failure Handling

If architecture cannot be fully reviewed or changed, do not invent certainty.

Report:

* what was inspected
* what could not be inspected
* what conclusion is supported
* what remains uncertain
* what evidence is needed next

Do not claim:

* the architecture supports something unless code shows it
* a workflow is safe unless the approval gate exists
* an agent is observable unless `AgentRun` or equivalent visibility exists
* docs are current unless they match implementation
* a route is unused unless callers were searched

## Editor Bias

Default bias:

* Repo evidence beats assumptions.
* Clear boundaries beat clever orchestration.
* Observable agents beat invisible magic.
* Gated workflows beat autonomous external mutation.
* Small reversible changes beat architectural rewrites.
* Docs must describe reality, not aspiration.
* A missing source-of-truth is an architecture problem, not a documentation detail.
