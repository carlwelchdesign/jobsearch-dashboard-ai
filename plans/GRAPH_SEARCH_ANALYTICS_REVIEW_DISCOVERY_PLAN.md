# Graph-Based Search Analytics And Broader Review-First Discovery

## Summary
Replace the current text-only search/run counters with visual funnel analytics everywhere those metrics appear, and broaden job discovery through a new review-first search lane. The goal is to make it obvious why “17k fetched” turns into “12 saved,” while increasing LinkedIn-like opportunity coverage without sending weak matches directly into Apply Sprint.

## Key Changes
- Save this plan under `/plans`, create a new feature branch, preserve existing uncommitted provider-search work, then implement, update docs, verify, commit, push, open/update the PR description, and restart the dev server.
- Keep the database schema unchanged. Store richer run analytics in `JobSearchRun.progress` JSON, since fixed persisted counters only cover `jobsFetched`, `jobsAfterDedupe`, `jobsAfterFilters`, and `jobsSaved`.
- Add a shared run analytics model/helper that normalizes old and new run data for charts, labels, explanations, and tests.

## Graphs And Diagnostics
- Replace boring metric cards everywhere search metrics appear with Recharts-based visuals:
  - Funnel chart: fetched → detail candidates → scored → above threshold → new jobs → new matches → agency eligible → ready.
  - Stacked drop-reason bars: duplicate existing job, existing match, below threshold, listing suppressed, missing application URL, max-results cap, source errors.
  - Per-profile grouped bars: fetched, scored, qualified, saved, capped.
  - Per-source/provider bars: raw volume versus qualified/saved yield.
  - Score distribution histogram: below threshold, near miss, qualified, high confidence.
  - Recent-runs line chart: fetched, qualified, saved, ready over time.
- Rename confusing labels:
  - `Fetched` = raw source results.
  - `New` = new job records after dedupe.
  - `Matched` = jobs scoring above profile threshold.
  - `Saved` = new profile matches created for the application pipeline.
- Add plain-English diagnostics beside the charts, for example: “Most jobs were filtered by score threshold” or “This profile hit its max results cap.”

## Search Broadening
- Add a broad enabled search profile for LinkedIn-parity discovery, targeting generic senior software, full-stack, product engineer, frontend, React, TypeScript, design systems, AI/product UI, remote, and US/global terms.
- Use a lower review threshold for this broad profile, but route near-miss matches to existing `needs_review` status instead of Apply Sprint.
- Keep high-confidence matches eligible for the normal approved/apply pipeline; keep broad/uncertain matches visible for manual review.
- Add diagnostics that show whether volume is being held back by profile thresholds, required keywords, profile caps, listing suppression, provider errors, or missing `BRAVE_SEARCH_API_KEY`.

## Documentation And Tests
- Update README, user guide, wiki operations/search docs, and `/sources` copy to explain the new charts, metrics, broad profile, near-miss review behavior, and why fetched counts can be much larger than saved counts.
- Add tests for:
  - Analytics helper output from old and new `progress` payloads.
  - Funnel/drop-reason math.
  - Broad profile seed/config behavior without overwriting user custom profiles.
  - Ingestion counters for below-threshold, existing match, max cap, suppressed listing, and near-miss review cases.
  - UI component rendering for chart-ready datasets.
- Run verification:
  - targeted Vitest for search ingestion, source catalog, analytics helpers, and affected UI tests
  - `npx tsc --noEmit --pretty false`
  - `git diff --check`
  - `npm run build`

## Assumptions
- LinkedIn remains a discovery signal only; no direct scraping or account automation.
- Broad discovery should increase reviewable jobs first, not automatically push all broader matches into Apply Sprint.
- Existing `needs_review` status is the right landing place for broad near-misses.
- Recharts remains the charting library because it is already used in the app.
