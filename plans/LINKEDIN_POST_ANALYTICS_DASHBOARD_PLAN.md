# Execute LinkedIn Analytics Dashboard Delivery

## Summary
Carry the approved LinkedIn analytics plan through the repo workflow: save it under `/plans`, implement the hybrid API/CSV analytics feature, update documentation, verify, commit, push, open a meaningful PR, and restart the local dev server.

## Key Changes
- Save the plan as `plans/LINKEDIN_POST_ANALYTICS_DASHBOARD_PLAN.md`.
- Implement LinkedIn analytics authorization separately from publishing using `r_member_postAnalytics`.
- Add persistence for API and CSV metric snapshots linked to published LinkedIn drafts when possible.
- Add sync/import/summary APIs for LinkedIn analytics.
- Add the `/dashboard` LinkedIn Analytics section with full executive KPI set, filters, freshness labels, and Recharts visualizations.
- Feed aggregate LinkedIn performance back into the LinkedIn content memory pack.
- Preserve existing privacy rules: no viewer identities, commenter identities, private profile data, or unsupported public claims.

## Documentation
- Update README/user documentation to explain:
  - LinkedIn publishing vs analytics permissions.
  - How to connect analytics.
  - How API sync works.
  - How CSV paste import works.
  - What metrics are stored.
  - Privacy and aggregate-only policy.
- Update relevant app docs/wiki-style files if present in repo.
- Document that analytics API access may require LinkedIn product approval and CSV import remains the fallback.

## Verification
- Read relevant Next.js docs under `node_modules/next/dist/docs/` if present before code changes.
- Run Prisma migration/generate.
- Run targeted unit and route tests for LinkedIn analytics.
- Run dashboard/UI tests covering empty, CSV-only, API-only, and mixed analytics states.
- Run TypeScript and the repo's standard verification commands.
- Start/restart the dev server and verify `/dashboard` and `/linkedin-content` locally.

## GitHub Workflow
- Create a feature branch from current `main`, for example `feat/linkedin-post-analytics-dashboard`.
- Commit with a clear message such as `Add LinkedIn post analytics dashboard`.
- Push the feature branch.
- Open a PR with a meaningful title:
  - `Add LinkedIn Post Analytics Dashboard`
- PR description should cover:
  - Summary of hybrid API/CSV analytics support.
  - Dashboard KPI/chart experience.
  - Privacy constraints.
  - LinkedIn permission requirements.
  - Test results.
  - Any known limitations, especially `r_member_postAnalytics` access.
- Restart the dev server after the branch is pushed and PR is created.

## Assumptions
- Implementation will happen after leaving Plan Mode.
- The PR should target `main`.
- If LinkedIn analytics API access is unavailable locally, mocked API tests plus CSV import verification are acceptable.
- Dev restart should preserve the existing local database and `.env` settings.
