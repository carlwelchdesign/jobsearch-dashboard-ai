# Direct Application URL Reliability Fix

## Summary

- Make `applicationUrl` mean a direct employer or ATS application target, not any useful job/source URL.
- Use a direct-only Apply Sprint policy: board, auth, paywall, intermediary, and listing/search URLs are not launchable until resolved to a direct application URL.
- Remediate existing risky ready applications by trying to resolve known boards first, then moving unresolved applications out of the launch queue without rejecting or archiving them.

## Key Changes

- Add a shared application URL quality module used by search ingestion, recruiting agency eligibility, packet prep, Apply Sprint, assistant launch, and extension-ready APIs.
- Update Search Query Backlog so board/detail/listing URLs stay in `rawData` as source/detail URLs unless a direct application URL is resolved.
- Replace "has URL" gates with "launchable URL" gates for agency selection, candidate prep, bulk prep, ready queue selection, assistant launch, and extension package lookup.
- Preserve existing API compatibility while adding URL-quality detail where it helps explain hidden or unsupported rows.

## Remediation

- Add an idempotent repair service and script with dry-run and apply modes.
- Try to resolve Built In, Working Nomads, and Himalayas URLs to external direct apply URLs.
- If resolved, update `JobPosting.applicationUrl`, provider metadata, and raw-data provenance.
- If unresolved, clear `JobPosting.applicationUrl`, preserve the original URL in raw data, and transition affected `ready_to_apply` applications back to `approved` with an `application_url_repair` audit event.

## Test Plan

- Unit test URL classification across direct ATS/employer URLs, board detail URLs, listing URLs, auth/paywall sites, invalid URLs, and current bad examples.
- Update search-query tests so unresolved board URLs do not become launchable application URLs.
- Add/adjust tests for Apply Sprint, recruiting agency, manual prepare candidates, bulk prep, and assistant launch rejection.
- Verify remediation dry-run and apply behavior.
- Run focused Vitest suites, TypeScript, production build, and `git diff --check`.

## Assumptions

- No Prisma migration is required.
- Existing `rawData`, `applicationUrl`, statuses, and `ApplicationEvent` audit records are enough.
- Final submission remains manual; this fix only prevents bad links from reaching the launch-ready path.
