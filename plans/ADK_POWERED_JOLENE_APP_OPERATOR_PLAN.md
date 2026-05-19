# ADK-Powered Jolene App Operator Plan

## Summary

Upgrade Jolene from a mostly hard-coded assistant router into an ADK-managed app operator. Jolene should understand broad app-context requests, inspect local data, delegate to existing agents, perform trusted internal actions, and explain what she did. The default autonomy is **Trusted App Admin**: Jolene may run safe internal actions directly, but must confirm destructive, irreversible, or external actions.

## Key Changes

- Register Jolene in the ADK control plane as `jolene-app-operator`.
  - Keep `JoleneConversation` and `JoleneMessage` as the chat source of truth.
  - Record Jolene ADK tool activity in message `actionJson` and `AgentRun` / `AgentRunEvent` when she performs multi-step operations.
- Replace the brittle intent router with an ADK tool planner.
  - Keep deterministic fast paths for exact retrieval like “where is my Linear cover letter?”
  - For broader requests, route through an ADK Jolene planner that selects tools, executes allowed actions, and returns a concise result.
  - Preserve current fallback chat only when no app tool or local context is relevant.
- Add Jolene app tools grouped by permission tier.
  - Read tools: search jobs, applications, generated materials, evidence, profiles, agent runs, Needs Me requests, settings summaries, market intelligence, and outcome signals.
  - Safe mutation tools: run job search, run duplicate detector, sync email, run Daily Command Center, run Market Intelligence, prepare approved packets, refresh integrity checks, resolve low-risk recommendations.
  - Guarded mutation tools: approve/reject jobs, archive duplicates, repair application state, update search profiles, disable learned rules, retry/cancel agent runs.
  - External/manual-gate tools: launch application assistant, open employer application, submit-related workflow actions, email/code retrieval, outreach, and anything that affects third-party systems.
- Add a permission policy.
  - Jolene can directly execute read tools and safe internal mutations.
  - Jolene must ask for confirmation before destructive actions, bulk actions, external actions, final application submission, email sending, profile deletion, learned-rule disabling, or anything affecting more than 10 records.
  - Every guarded action response must include what will change, affected records, and an undo/repair path when available.
- Improve Jolene’s operating context.
  - Add a global app context builder that summarizes current pipeline state across dashboard, jobs, applications, Needs Me, agent runs, evidence, profiles, outcomes, and recent failures.
  - Include recent conversation history, current route context, and relevant retrieved records.
  - Keep sensitive content summarized by default; do not dump full resumes, cover letters, application answers, emails, or browser content unless explicitly requested.
- Add visible activity and follow-through.
  - Jolene responses should show completed actions, skipped actions, blockers, links to affected records, and next best step.
  - Long-running actions should return an `AgentRun` link and status summary.
  - The Agent Board should label Jolene-operated runs as `ADK control plane`.

## Public Interfaces And Types

- Extend ADK registry:
  - `jolene-app-operator`
  - runtime: `adk`
  - risk: `guarded_mutation`
  - tools: app read tools, safe mutation tools, guarded mutation tools
- Extend Jolene action result shape:
  - add optional `requiresConfirmation`
  - add optional `plannedActions`
  - add optional `executedActions`
  - keep current `clientAction` behavior for navigation/refresh
- Add internal ADK tool modules for Jolene:
  - app search/read tools
  - workflow/run tools
  - job/application mutation tools
  - agent management tools
  - confirmation policy helper
- No Prisma migration is required for the first phase.
  - Store ADK/Jolene execution metadata in existing `actionJson`, `contextJson`, `AgentRun.observabilityJson`, and `AgentRunEvent.payloadJson`.

## Test Plan

- Unit test permission policy:
  - read-only requests execute immediately
  - safe internal mutations execute immediately
  - destructive/bulk/external actions require confirmation
  - unknown or ambiguous requests ask a clarifying question
- Unit test Jolene ADK routing:
  - “Find my Socure cover letter” uses retrieval tools
  - “Run a fresh search and check duplicates” executes safe tools
  - “Approve the top 5 jobs if they look good” requires confirmation before changing records
  - “Reject every Airbnb duplicate” requires confirmation and shows affected records
  - “Why is Linear still showing in ready to apply?” reads applications, jobs, duplicates, and outcomes before answering
- Integration test `/api/jolene`:
  - preserves existing request/response shape
  - stores planned/executed actions in assistant message `actionJson`
  - returns navigation/refresh actions when appropriate
  - does not regress current email-sync, retrieval, or career-coaching behavior
- Verification:
  - `npx vitest run src/lib/jolene src/lib/adk --config vitest.config.ts`
  - `npx tsc --noEmit --pretty false`
  - `npm run build`
  - smoke `/dashboard`, `/jobs`, `/applications`, `/agents`, and `/api/jolene`

## Assumptions

- Jolene should act as a trusted internal app admin, not an unbounded external automation agent.
- Internal app actions can be automated when reversible or low-risk.
- Destructive, bulk, external, or final-submit actions require confirmation.
- LangGraph remains responsible for durable application assistant and recruiting-agency workflows.
- ADK is used for Jolene’s tool planning, permissions, and execution traceability, not as a replacement for existing persisted app state.
