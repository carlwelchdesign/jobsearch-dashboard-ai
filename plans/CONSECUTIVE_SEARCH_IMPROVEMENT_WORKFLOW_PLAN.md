# Consecutive Search Improvement Workflow

## Summary

Create a gated search improvement loop that runs safe automation in order while pausing where human judgment or real-world outcome data is required.

## Workflow

1. Run job discovery across enabled profiles and sources.
2. Score, dedupe, and save matching jobs.
3. Auto-run the recruiting agency for eligible high-confidence `needs_review` matches.
4. Pause profile-health recalculation if any jobs still need approve/reject review.
5. Pause profile-health recalculation if prepared applications still need Apply Sprint work.
6. Run the Search Profile Optimizer once review and application gates are clear.
7. Run Market Intelligence only after the optimizer writes fresh profile-health snapshots.
8. Refresh the dashboard charts from the latest Market Intelligence output.

## Gated Behavior

- Review-only broad-discovery matches remain in `needs_review` and block profile optimization until the user decides approve/reject.
- Approved, generated, or ready-to-apply applications block profile optimization until they move through Apply Sprint or outcome tracking.
- Market Intelligence skips with a clear progress reason when the optimizer did not complete, so Profile Health does not present stale data as fresh.
- Final application submission remains manual.

## Verification

- Focused tests cover recruiting agency handoff, profile optimizer gates, and Market Intelligence waiting for a completed optimizer pass.
- TypeScript and diff checks should pass after implementation.
