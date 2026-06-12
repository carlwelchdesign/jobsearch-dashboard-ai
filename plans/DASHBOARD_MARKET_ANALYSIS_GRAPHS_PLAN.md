# Dashboard Market Analysis Graphs Plan

## Summary

- Centralize the full Market Analysis / Weekly Market Brief on the dashboard.
- Remove the detailed Weekly Market Brief section from `/profiles`.
- Add Recharts-based analytical graphs, richer summaries, and cited article/news cards.
- Keep existing market-intelligence research collection and advisory-only behavior.

## Key Changes

- Convert the dashboard Market Analysis card into a richer dashboard section with tabs:
  - `Overview`: summary, confidence, freshness, top lane, top skills, and practical takeaways.
  - `Charts`: role-lane comparison, skill comparison, trend lines, source/action proportions, and match distribution.
  - `Research`: article/news cards with title, publisher, date, relevance, confidence, source link, claim, and implication.
  - `Actions`: recommended actions plus search-learning/adaptation audit.
- Keep the dashboard page as the only full Market Analysis surface.
- Remove `MarketIntelligencePanel` from `/profiles` and drop the `latestMarketRun` query/import there.
- Keep the existing `POST /api/market-intelligence/run` endpoint and `Run market brief` control.

## Data and Interfaces

- Extend `MarketIntelligenceOutput.chartData` with:
  - `laneDemand`
  - `skillDemand`
  - `profileHealth`
  - `actionMix`
  - `matchQualityDistribution`
  - `sourceCoverage`
- Add dashboard-only historical trend data by querying recent completed `MARKET_INTELLIGENCE` `AgentRun` rows in `src/app/dashboard/page.tsx`.
- Build trend series from prior `outputJson.generatedAt`, `chartData.laneDemand`, `chartData.skillDemand`, and confidence.
- Avoid database migrations; use historical `AgentRun.outputJson`.
- Keep article storage limited to metadata, claims, summaries, short excerpts, implications, and links.

## UI Implementation

- Add a client chart component because Recharts requires client-side rendering.
- Keep the dashboard page as a server component and pass serialized chart/history data into the client component.
- Use Recharts:
  - `BarChart` for role lanes, skills, and profile health.
  - `LineChart` for trends over time.
  - `PieChart` for action mix and source coverage.
  - `ScatterChart` for match quality distribution.
- Use MUI tabs, cards, chips, alerts, and existing theme colors.
- Include empty states for no report, no history, no articles, and sparse chart data.

## Tests

- Update market-intelligence unit tests for new chart fields and improved summary.
- Update dashboard tests for centralized tabs, charts, research, and endpoint wiring.
- Add/update profile page tests to confirm the detailed brief was removed from `/profiles`.
- Run focused tests, type-check, React Doctor, build, and `git diff --check`.

## Assumptions

- Recharts is the preferred charting library.
- The dashboard is the canonical Market Analysis location.
- Existing trusted-source discovery remains the source of article/news links.
- No schema migration is needed.
