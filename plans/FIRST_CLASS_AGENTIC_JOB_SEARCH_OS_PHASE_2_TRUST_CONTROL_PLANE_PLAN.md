# First-Class Agentic Job Search OS Phase 2 Trust Control Plane Plan

## Status

- Owner: Carl with Codex implementation support.
- Status: implemented in PR.
- Branch: `codex/phase-2-trust-control-plane`.
- Product posture: protected single-user production app.
- Scope: durable claim provenance, approval gates, agent roster visibility, and red-team/eval coverage.

## Summary

Phase 2 turns the trust posture from policy into enforceable product behavior. Generated materials and public drafts get durable claim records, unsupported claims block packet approval and LinkedIn publishing, and `/agents` becomes an inspectable control plane for agent ownership, tools, side effects, status, child runs, blocked actions, and last eval score.

## Implementation Backlog

| ID | Priority | Title | Owner Area | Status | Acceptance Criteria |
|---|---:|---|---|---|---|
| EVID-001 | P1 | Claim-level provenance | AI/Trust | Implemented | Generated resumes, cover letters, packets, LinkedIn drafts, and application answers can sync durable claim rows |
| TRUST-002 | P1 | Material approval gate | AI/Trust | Implemented | Unsupported claims block packet approval and LinkedIn publish/approve paths while export stays available |
| AGENT-002 | P1 | Agent roster control plane | AI/Platform | Implemented | `/agents` shows owner, runtime, tools, side effects, approval status, current status, child runs, blocked actions, and eval score |
| QA-002 | P1 | Red-team trust fixtures | QA/Trust | Implemented | Deterministic fixtures cover prompt injection, unsupported claims, private leakage, external action attempts, LinkedIn misuse, and ungrounded public content |

## Non-Goals

- No autonomous submission, email sending, calendar writes, or direct LinkedIn job automation.
- No replacement of existing `generationNotes`, `applicationQa`, or LinkedIn draft claim JSON.
- No persisted onboarding/readiness checklist in this PR.
