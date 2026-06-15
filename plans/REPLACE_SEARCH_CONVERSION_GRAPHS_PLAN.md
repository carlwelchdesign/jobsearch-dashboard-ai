# Replace Search Conversion Graphs With Meaningful Charts

## Summary

- Replace the current "Live conversion" retention bars with real run analytics that explain search quality, opportunity yield, and next action.
- Keep Recharts, but shift from linear funnel shrinkage to charts that answer useful questions: what worked, what blocked jobs, which profiles/sources produced value, and whether runs are improving.
- Apply the new experience everywhere `SearchRunAnalyticsCharts` appears.

## Key Changes

- Replace `ConversionFlow` with a new `SearchRunInsightBoard`.
- Add hero outcome metrics, outcome mix, top blocker, best source, and best profile callouts.
- Upgrade full-size charts for source yield, profile yield, quality bands, blockers, and trends.
- Upgrade compact mode to remove "Live conversion" and show a compact run outcome with top blockers and source/profile winners.

## Interfaces / Data

- No Prisma migration.
- Extend only internal `SearchRunAnalytics` helper output with derived chart datasets.
- Keep existing `JobSearchRun.progress` JSON as the source of truth.

## Verification

- Update analytics helper tests.
- Add source-contract coverage that the old "Live conversion," "kept," and "dropped" language is gone.
- Run targeted Vitest, TypeScript, React Doctor, build, and live route verification.
