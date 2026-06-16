# Built In Search Result Expansion And True Application Links

## Summary
Built In URLs such as `https://builtin.com/jobs/remote/dev-engineering/search/front-end-engineer?page=2` are search-result/listing pages, not jobs. Job Search OS should use those pages as a discovery source, expand them into individual Built In job-detail URLs, and only treat an employer/ATS apply URL as the canonical `applicationUrl`.

## Key Changes
- Treat every `builtin.com/jobs...` URL, including `/jobs/.../search/...` pages, as a listing page only.
- Expand Built In listing pages through JSON-LD `ItemList` first and job-card anchors as a fallback.
- Enrich Built In detail pages during normalization by extracting full job detail, company/title/location metadata, and the external apply URL when available.
- Never save Built In listing/search URLs as `JobPosting.applicationUrl`.
- If a Built In detail page is removed, blocked, login-gated, or lacks an external apply URL, keep the job reviewable with no `applicationUrl` so Apply Sprint cannot treat Built In as the application form.

## Test Plan
- Add coverage for the exact Built In `/jobs/remote/dev-engineering/search/front-end-engineer?page=2` listing pattern.
- Add job-card fallback parsing tests when JSON-LD is absent.
- Add Built In detail normalization tests for `howToApply`, external apply anchors, full description enrichment, and removed/no-apply pages.
- Run focused search-query adapter tests, TypeScript, lint, full unit tests, build, and smoke checks where local services allow.

## Assumptions
- This is a server-side HTML parsing improvement, not browser automation.
- No Prisma migration is required.
- Built In remains a discovery source; employer/ATS URLs remain the only Apply Sprint-ready links.
