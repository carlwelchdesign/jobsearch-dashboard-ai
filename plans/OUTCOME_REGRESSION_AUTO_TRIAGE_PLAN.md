# Outcome Regression Auto Triage Plan

## Summary
Add an auto-triage layer for outcome regressions so new regression proposals are not just created, but ranked, grouped, and routed to the clearest next review action. This remains review-only: no sources, profiles, suppressions, prompts, workflows, or skill rules are changed automatically.

## Key Changes
- Extend regression proposal creation with triage metadata: priority, owner area, review route, reason, signal type, and related agent area.
- Add `GET /api/observability/outcomes/trends/triage` for open regression proposals sorted by priority.
- Add a Settings “Regression triage” section near Outcome trends.
- Use existing `AgentImprovementProposal` records and JSON metadata; no schema migration.
- Keep accepted high-risk regression proposals review-only unless an existing safe activation mapping applies.

## Triage Rules
- High priority: callback rate declines, assistant failures rise, rejected high-score matches rise, or `APPLICATION_ASSISTANT` / `JOB_MATCHING` workflow scores drop.
- Medium priority: duplicate group growth, resurfaced suppressed jobs, `JOB_SEARCH` score decline, or source/profile noise.
- Low priority: weaker regressions with limited supporting context or already-open related review proposals.
- Dedupe remains by user, trend key, latest snapshot id, and proposal status.

## Test Plan
- Unit test triage priority assignment for metric and workflow regressions.
- Unit test queue filtering and priority sorting for open regression proposals.
- Route test the triage endpoint.
- Run `npx prisma validate`, `npx tsc --noEmit --pretty false`, focused observability tests, `npm test`, `npm run build`, and `npm run smoke:pages`.

## Assumptions
- Auto triage is advisory and review-first.
- Regression proposals continue to use the existing proposal accept/dismiss flow.
- Documentation updates go to `README.md` and wiki pages after implementation.
