# Phase 5: Agent Depth And Quality Scale

## Summary

Phase 5 makes the existing agent quality system operational. Job Search OS already has agent runs, skill policies, red-team fixtures, quality examples, quality evaluations, and improvement proposals. This phase adds a canonical quality gate layer so the Agent Review Board can answer which agent domains are safe to scale, which are stale, which lack eval coverage, and which are blocked by failed evaluations or policy events.

## Key Changes

- Add a shared agent quality gate service that rolls up quality examples, evaluations, proposed improvements, recent runs, and blocked-action events by `AgentQualityTarget`.
- Add `GET /api/agents/quality-gates` for protected single-user access to current gate state.
- Surface the gate board on `/agents` with pass, stale, missing-eval, needs-review, and blocked states.
- Keep Phase 5 inspect/review oriented: no autonomous external actions, no auto-activation of risky learning, and no new write path beyond existing evaluation/proposal routes.
- Expand docs so agent quality gates become the operating layer for Phase 5, while Phase 4 readiness remains product workflow readiness.

## Public Interfaces And Types

- `buildAgentQualityGates({ userId })`
- `AgentQualityGate`
- `AgentQualityGateStatus`
- `AgentQualityGateSummary`
- `GET /api/agents/quality-gates`

## Test Plan

- Unit-test gate rollups for pass, stale, missing evaluation, needs-review, and blocked states.
- Route-test protected single-user access to `/api/agents/quality-gates`.
- Source-contract test `/agents` for the quality gate board and run-evaluation controls.
- Regression-test existing agent roster coverage and existing quality evaluation routes.

## Assumptions

- Phase 5 is an agent quality/control-plane phase, not a new autonomous execution phase.
- Existing quality tables are sufficient for the first gate board; no new Prisma model is required.
- Quality gates are advisory and review-oriented in this PR; they do not block existing routes until later explicit enforcement work.
- External action boundaries remain unchanged: no auto-submit, no unapproved email sending, no calendar writes, and no unreviewed LinkedIn publishing.
