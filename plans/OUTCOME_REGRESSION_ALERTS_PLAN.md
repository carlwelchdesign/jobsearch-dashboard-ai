# Outcome Regression Alerts Plan

## Summary
Turn sustained negative outcome trends into governed review signals so regressions are not only passive Settings chips. The app should create review-only proposals when outcome snapshots show worsening job search, matching, agency, or assistant quality, without automatically changing sources, profiles, suppressions, prompts, workflows, or learned rules.

## Key Changes
- Detect `regressing` metrics and workflow scores from existing outcome trends.
- Add `POST /api/observability/outcomes/trends/alerts`.
- Create deduped `AgentImprovementProposal` records with `metadataJson.source = "outcome_trend_regression"`.
- Keep regression proposals `PROPOSED` and review-only.
- Add a Settings action near Outcome trends to create missing regression reviews.
- Label trend-generated proposals as `outcome regression` in the quality proposal list.
- Update README and wiki docs.

## Public Interfaces
- New endpoint: `POST /api/observability/outcomes/trends/alerts`.
- Response: `{ ok, scanned, created, existing, proposals }`.
- Existing trend and outcome endpoints remain read-only.

## Test Plan
- Unit test metric and workflow regression alert creation.
- Unit test insufficient data creates no alerts.
- Unit test dedupe prevents duplicate regression proposals.
- Route test the new alerts endpoint.
- Run `npx prisma validate`, `npx tsc --noEmit --pretty false`, focused observability tests, `npm test`, `npm run build`, and `npm run smoke:pages`.

## Assumptions
- Regression alerts are manual-triggered from Settings.
- Trend snapshots remain aggregate and redacted.
- No automatic behavior changes are triggered by regression proposals.
