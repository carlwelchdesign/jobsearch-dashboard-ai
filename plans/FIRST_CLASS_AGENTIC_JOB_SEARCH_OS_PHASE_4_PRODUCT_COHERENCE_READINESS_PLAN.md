# Phase 4: Product Coherence And Readiness Operating Cockpit

## Summary

Phase 4 turns the current computed lifecycle checklist into a real operating layer: persisted readiness overrides, a denser Command Center cockpit, contextual next actions across lifecycle pages, browser-level acceptance coverage, and a staff-level PR description. Existing routes and the protected single-user posture stay intact; this is not a marketing refresh or autonomous-action expansion.

## Key Changes

- Add persisted `ReadinessOverride` rows for user actions such as manual completion, dismiss, and snooze without snapshotting stale system counts.
- Add a shared readiness service that computes live setup, search, review, packet, apply, follow-up, interview, outcome, trust, and health signals, then applies safe presentation-only overrides.
- Add `GET /api/readiness` and protected `PATCH /api/readiness/[key]` APIs.
- Redesign `/dashboard` as a daily operating cockpit with top next action, lifecycle rail, readiness worklist, value-proof metrics, active queues, and Jolene approval boundaries.
- Add compact readiness/next-action panels to the main lifecycle pages: Jobs, Apply Sprint, Applications, Generated Materials, Evidence, and Outcomes.
- Add first-class Playwright acceptance coverage and a required staff-level PR body.

## Public Interfaces And Types

- `ReadinessOverride`
- `ReadinessOverrideStatus`
- `LifecycleReadiness`
- `LifecycleReadinessItem`
- `LifecycleReadinessStage`
- `ReadinessItemStatus`
- `buildLifecycleReadiness({ userId })`
- `applyReadinessOverride({ userId, key, action, snoozedUntil?, note? })`
- `GET /api/readiness`
- `PATCH /api/readiness/[key]`

## Test Plan

- Unit-test readiness computation for setup, search, review, packet, apply, follow-up, interview, outcome, trust blockers, and health blockers.
- Unit-test override behavior for complete, dismiss, snooze, reset, expired snooze, and system-critical blocker precedence.
- Route-test readiness APIs and protected single-user enforcement.
- Update dashboard tests for the operating cockpit, lifecycle rail, readiness worklist, and value-proof metrics.
- Add Playwright tests for `/dashboard`, readiness interactions, Apply Sprint, generated materials, evidence, outcomes, and responsive layout.
- Regression-test packet approval, trust gates, application transitions, and system health.

## Assumptions

- Full UX overhaul means an operating-cockpit overhaul, not a full route rename, brand redesign, or marketing landing page.
- Readiness truth remains computed from live system data; persistence stores only user overrides.
- External-action boundaries remain unchanged: no auto-submit, no unapproved email sending, no calendar writes, and no unreviewed LinkedIn publishing.
- Existing App Router, MUI, Recharts, Prisma, Jolene, ADK, and protected single-user patterns are reused.
- Phase 5 remains Agent Depth and Quality Scale after this product-coherence phase.
