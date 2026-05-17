# Learning Impact Dashboard Plan

## Summary
Activated learning rules now affect future agent runs, but the app does not yet show whether each rule is helping. Add an impact layer that connects active `SkillAdjustment` records to later agent outputs, quality examples, and evaluations so Settings can show which learned rules are healthy, need review, or need manual rollback.

## Key Changes
- Add read-only impact analysis for active proposal-backed adjustments.
- Derive applied runs from agent outputs and recruiting agency `learning_applied` events.
- Compare post-activation quality evaluations and failures by applied run, target, and category.
- Add `GET /api/observability/learning-impact`.
- Add a Settings learning-impact section near Agent quality and Skill learning.
- Keep this phase read-only; no auto-disable or rollback.

## Test Plan
- Unit test impact statuses: `insufficient_data`, `helping`, `neutral`, and `needs_review`.
- API route test for `GET /api/observability/learning-impact`.
- Settings render/build coverage through existing checks.
- Run Prisma validation, TypeScript, focused tests, full tests, build, and page smoke.

## Assumptions
- No schema migration is required.
- Impact is computed from existing JSON metadata and records.
- Manual rollback controls will be planned after impact visibility exists.
