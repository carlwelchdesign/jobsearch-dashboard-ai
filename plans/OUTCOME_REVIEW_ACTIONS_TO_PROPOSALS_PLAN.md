# Outcome Review Actions to Proposals Plan

## Summary
Convert the new outcome calibration review actions into controlled `AgentImprovementProposal` records. This makes recurring issues like noisy sources, loose profiles, duplicate resurfacing, suppression failures, and assistant blockers part of the existing review/accept/dismiss learning workflow instead of leaving them as one-off advisory rows.

## Key Changes
- Add a manual proposal creation path at `POST /api/observability/outcomes/propose-actions`.
- Read the current outcome calibration report, scan recommended actions, and create `AgentImprovementProposal` records for actionable `watch` or `needs_review` issues.
- Keep created proposals as `PROPOSED` and review-first; do not automatically edit profiles, pause sources, repair suppressions, merge duplicates, change prompts, or rewrite workflow behavior.
- Deduplicate open proposals by user, source marker, action category, target type, and target id.
- Add a Settings control near Recommended review actions so outcome actions can be promoted into the existing proposal review workflow.
- Update README and wiki docs to explain that outcome review actions can now become governed proposals.

## Public Interfaces
- New endpoint: `POST /api/observability/outcomes/propose-actions`.
- Response: `{ ok, scanned, created, existing, proposals }`.
- Existing outcome calibration and proposal accept/dismiss routes remain unchanged.

## Test Plan
- Unit test proposal creation from outcome review actions.
- Unit test idempotency when matching open proposals already exist.
- Unit test clean outcome data creates no proposals.
- Route test the new endpoint response.
- Run `npx prisma validate`, `npx tsc --noEmit --pretty false`, focused observability tests, `npm test`, `npm run build`, and `npm run smoke:pages`.

## Assumptions
- Use the existing `AgentImprovementProposal` schema; no migration is needed.
- Proposal promotion is manual and review-only by default.
- Accepted proposals only affect behavior where the current safe `SkillAdjustment` mapping already supports that category.
- No implementation in this phase should silently change job search profiles, source settings, duplicate groups, suppressions, prompts, or agent workflows.
