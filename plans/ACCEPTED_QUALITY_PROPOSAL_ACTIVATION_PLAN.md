# Accepted Quality Proposal Activation Plan

## Summary
The app already captures cross-agent quality examples, scores them, and creates `AgentImprovementProposal` records. The next step is to make accepted low-risk proposals affect agent behavior through the existing skills learning layer, while keeping high-risk workflow, prompt, search-source, and scoring changes review-only.

## Key Changes
- Add `acceptImprovementProposal(id)` in the observability quality layer.
- Low-risk, known proposal categories create an auditable `SkillAdjustment`.
- High-risk or unmapped proposals are accepted as review intent only.
- Acceptance is idempotent and will not create duplicate adjustments for the same proposal.
- Update `POST /api/observability/proposals/[id]/accept` to return activation metadata.
- Show whether each Settings proposal activates learning or is review-only.
- Document that broad prompt rewrites, search-source changes, workflow changes, and high-risk scoring changes are not auto-applied.

## Test Plan
- Unit test safe proposal acceptance creates one active `SkillAdjustment`.
- Unit test accepting the same proposal twice is idempotent.
- Unit test high-risk proposals are marked accepted but do not create adjustments.
- Unit test unmapped proposal categories are accepted as review-only.
- API route test verifies activation metadata is returned.
- Run Prisma validation, TypeScript, focused tests, full tests, build, and smoke checks.

## Assumptions
- No schema migration for v1; proposals link to adjustments through `SkillAdjustment.patchJson.proposalId`.
- Only low-risk mapped guidance is auto-activated.
- Human review remains required before meaningful scoring, search, prompt, or workflow policy changes affect the app.
