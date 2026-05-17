# Tighten Application Duplicate Reconciliation

## Summary

Fix the Applications page so a submitted/applied role suppresses all sibling application trackers for the same company and role, even when the ATS exposes separate regional postings.

## Key Changes

- Add an application-specific identity key based on company and normalized title family.
- Ignore location only for application-submission reconciliation, not general job discovery.
- Archive stale approved/ready/generated application trackers when a submitted sibling exists.
- Sync linked job matches to the canonical submitted status.
- Keep stale records archived instead of deleting them so audit history remains intact.

## Test Plan

- Add reconciliation coverage for same company/title across regions.
- Add integrity coverage for cross-region stale application and resurfaced match detection.
- Run focused application tests, TypeScript, and production build.
- Run application integrity repair and verify Applications no longer shows ready duplicates for submitted roles.

## Assumptions

- Applying to one regional variant of the same company/title means the other regional variants should no longer be actionable.
- Distinct titles at the same company should remain separate application groups.
- No database migration is required.
