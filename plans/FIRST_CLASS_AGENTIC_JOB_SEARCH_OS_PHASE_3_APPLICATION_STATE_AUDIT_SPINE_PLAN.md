# First-Class Agentic Job Search OS Phase 3 Application State And Audit Spine Plan

## Status

- Owner: Carl with Codex implementation support.
- Status: implemented in Phase 3 branch.
- Branch: `codex/phase-3-application-state-audit-spine`.
- Product posture: protected single-user production app.
- Scope: canonical application transitions, structured application audit history, soft archive, and compact timeline visibility.

## Summary

Phase 3 makes application lifecycle mutations transactional and auditable. The app already has reconciliation and integrity repair; this phase moves scattered status writes behind a canonical transition service and extends `ApplicationEvent` into a durable state-history spine.

## Implementation Backlog

| ID | Priority | Title | Owner Area | Status | Acceptance Criteria |
|---|---:|---|---|---|---|
| PLATFORM-004 | P1 | Canonical application transition service | Platform | Implemented | Application status changes flow through `transitionApplicationState` with versioned audit events |
| AUDIT-003 | P1 | Structured application event history | Platform/Trust | Implemented | Events include source, actor, request id, idempotency key, before/after snapshots, and entity version |
| APP-003 | P1 | Soft archive Apply Sprint deletion | Product/Platform | Implemented | Apply Sprint deletion preserves the application record and audit history |
| UX-003 | P1 | Compact application state timeline | Product/UX | Implemented | Application detail shows recent state history without exposing generated material content |

## Non-Goals

- No autonomous submission, email sending, calendar writes, or direct LinkedIn job automation.
- No broad cross-domain audit table in this PR.
- No full audit explorer UI; only compact application-detail timeline visibility.
