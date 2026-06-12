# Broaden Job Search Provider Coverage

## Summary

Improve search robustness by treating LinkedIn as a discovery signal for original employer/ATS postings, not as a direct scrape target. Expand the existing Brave-backed `Search Query Backlog`, source catalog, and diagnostics so requested ATS partners and job boards are represented and searchable through safe open-web discovery.

## Key Changes

- Add requested providers to the source catalog:
  - Direct/active: Greenhouse, Lever, Ashby.
  - Brave-backed active query coverage: Workable, SmartRecruiters, iCIMS, Jobvite, BambooHR, Teamtailor, Jobylon, Join, Jobtrain, Bullhorn, Oracle Taleo, SAP SuccessFactors, ZipRecruiter, Dice, Wellfound, Monster, CareerBuilder, SimplyHired, Adzuna, USAJOBS.
  - Manual/auth-gated: LinkedIn, Glassdoor, FlexJobs.
- Expand `searchQueryTemplates` with provider-specific queries for senior frontend, staff frontend, React, TypeScript, product engineer, design systems, AI/product UI, remote, and US/global roles.
- Keep `JobSourceType` unchanged; represent broad providers through the existing `search_query` source.
- Store broad provider identity in search-query `rawData.searchProvider` for providers outside the current Prisma `AtsProvider` enum.
- Add search diagnostics for configured query count, provider domains covered, listing pages suppressed, expanded job-detail links, and missing Brave provider warnings.
- Update `/sources`, README, user guide, and wiki docs to explain expanded provider coverage and the LinkedIn original-source strategy.

## Interfaces And Data

- No new user-facing API endpoints.
- No Prisma schema change in this slice.
- Existing `Search Query Backlog` configs should merge in new default templates while preserving user-added query strings.
- Listing/search pages must continue to be suppressed unless expanded into real job-detail URLs.

## Test Plan

- Add source-catalog coverage tests asserting every requested provider appears in the catalog and every non-manual requested provider has search-query coverage.
- Add search-query adapter tests for broad provider metadata and aggregator listing-page suppression.
- Verify:
  - `npx vitest run src/lib/job-search/adapters/search-query.test.ts src/lib/job-search/source-catalog.test.ts --config vitest.config.ts`
  - `npx tsc --noEmit --pretty false`
  - `npx react-doctor@latest --verbose --diff`
  - `git diff --check`
  - `npm run build`

## Assumptions

- Use hybrid coverage first: broaden catalog/query coverage and diagnostics without building high-risk provider scrapers.
- LinkedIn is not scraped directly; the app searches for original employer, ATS, or career-page postings behind LinkedIn-visible roles.
- `BRAVE_SEARCH_API_KEY` is required for broad provider discovery; the UI and run progress should make the limitation obvious when it is missing.
