# Tighten Job Deduplication and Suppression

## Summary

Implement a strict, shared duplicate/suppression gate so applied, rejected, archived, ready-to-apply duplicates, and same-role listings from different ATS/source URLs do not re-enter or remain visible in active workflows. The gate will be used consistently across search ingestion, Jobs, recruiting agency, bulk packet prep, manual capture, and Apply Sprint.

## Key Changes

- Add shared suppression reasons for already submitted, rejected, archived, ready-to-apply, duplicate-group sibling, same company/title/source duplicate, and company cooldown.
- Strengthen canonical matching for ATS wrapper company names, `Title @ Company` captured titles, source URL variants, and same company plus normalized title family across Greenhouse, Lever, Ashby, and company-site URLs.
- Enforce the strict gate in search ingest, active Jobs, recruiting agency, bulk packet prep, manual capture, and Apply Sprint.
- When a job is applied, rejected, archived, or moved to ready-to-apply, keep historical records but suppress active siblings from review and submission queues.

## Behavior

- Active Jobs should not show anything equivalent to an applied, rejected, archived, or ready-to-apply job.
- Apply Sprint should show only one canonical ready application per role.
- Recruiting agency and bulk packet prep must skip any candidate related to existing application, rejection, archive, ready state, duplicate group, or company cooldown.
- Historical records remain available in non-active views for audit and manual recovery.

## Test Plan

- Unit-test canonical keys for ATS wrappers, `@ Company` titles, URL variants, and title-family matching.
- Unit-test suppression for applied, rejected, archived, ready-to-apply, duplicate-group, and URL-equivalent jobs.
- Add integration coverage for search ingestion, Jobs active filtering, recruiting agency selection, bulk prep, and Apply Sprint visibility.

## Assumptions

- Strict blocking is preferred over warning-only behavior.
- The fix covers all active queues, not only search results.
- No schema migration is required for v1; use existing `JobSuppression`, `duplicateGroupId`, canonical keys, and match/application statuses.
