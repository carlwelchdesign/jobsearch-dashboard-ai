# Search Listing-Page Expansion And Suppression

## Summary

Prevent Brave Search results like Remote Rocketship category/search pages from being saved as individual jobs. Add conservative listing-page detection, expand list pages into real job URLs when possible, and record unexpanded listing pages in search-run progress metadata for review instead of creating active job matches.

Reference observed case: Remote Rocketship's `senior-frontend-engineer` page is a listing page with many jobs, not one job posting; search index snippets show it as a multi-job result. Direct server fetch currently returns Cloudflare `403`, so fallback behavior matters.

## Key Changes

- Extend raw source results with an optional listing-review marker so adapters can return:
  - normal job postings
  - listing-page review records that must not be normalized, scored, or saved as `JobPosting`
- Update search ingestion to separate listing-review records before scoring:
  - append listing URL, reason, provider, matched query, and source title to `JobSearchRun.progress`
  - increment `listingPagesSuppressed` in run progress stats
  - do not create `JobPosting` or `JobProfileMatch` for unexpanded listing pages
- Replace the single Built In-specific branch with listing detection that:
  - keeps Built In parsing working
  - detects Remote Rocketship search/listing pages
  - uses conservative generic URL/title/snippet signals before saving a Brave result as a job
- Clean up existing bad listing-page matches:
  - archive active matches for the exact Remote Rocketship listing URL and other active `remoterocketship.com/jobs/...` listing URLs
  - do not delete historical rows

## Test Plan

- Unit tests for `search-query`:
  - Remote Rocketship listing URL is not returned as a normal job when fetch is blocked.
  - A generic listing URL with strong query/filter signals becomes a listing-review record.
  - Built In expansion still emits individual `/job/...` postings.
  - Non-listing ATS/job URLs still save normally.
- Ingestion tests:
  - listing-review records update run progress/stats and are not scored or saved as `JobPosting`
- Regression checks:
  - focused Vitest for search-query and ingest-related behavior
  - `npx tsc --noEmit --pretty false`
  - `npm run lint` for touched files

## Assumptions

- Use conservative detection to avoid suppressing real job postings.
- Unexpanded listing pages are reviewable in search-run progress only, not active Jobs.
- If a site blocks server fetches, the system records the listing as blocked/unexpanded and skips creating a job match.
