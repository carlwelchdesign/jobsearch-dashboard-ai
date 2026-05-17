# Application Canonical Sync And Outcome Reconciliation Plan

## Summary

Fix stale duplicate application trackers by making submitted/applied state canonical across duplicate application records, job matches, pages, email outcomes, and assistant lifecycle events. If any tracker for the same canonical job is submitted, stale approved/ready duplicates should be archived automatically so `/applications`, Apply Sprint, Dashboard, Jobs, and outcome views agree.

## Key Changes

- Add a shared application reconciliation service using existing canonical job dedupe keys.
- Prefer submitted states over ready/approved states when multiple trackers represent the same job.
- Archive duplicate `approved` or `ready_to_apply` trackers when a submitted sibling exists.
- Sync sibling `JobProfileMatch` records to the submitted state when appropriate.
- Run reconciliation from high-signal outcome and application surfaces, including application outcomes, assistant submit lifecycle, email outcomes, manual mark-applied, approval, packet approval/backfill, and `/applications` reads.

## Test Plan

- Unit test Gecko-style duplicate groups: one applied tracker plus one approved duplicate archives the approved duplicate.
- Unit test visible grouping keeps `ready_to_apply` when no submitted sibling exists.
- Unit test unrelated applications with different canonical keys are not merged.
- Smoke test `/applications`, `/applications/assistant`, `/dashboard`, and `/jobs`.

## Assumptions

- Chosen policy: archive stale non-submitted duplicate trackers when a submitted/applied tracker exists.
- Submitted statuses are `applied`, `follow_up_due`, `screening`, `interviewing`, `offer`, and `rejected_by_company`.
- Archiving duplicates preserves history and is preferable to deletion.
