# Improve Jolene's Search-Run "Why" Answers

## Summary
Jolene currently treats "why did fetched jobs jump to 32,145?" as a generic search status question, so she repeats counters instead of explaining causality. Add a dedicated read-only search diagnostics path that uses recent `JobSearchRun` history plus existing `buildSearchRunAnalytics()` progress diagnostics to answer causal search questions with likely drivers, evidence, and next checks.

## Key Changes
- Add a Jolene search diagnostics capability for causal search questions such as "why did fetched jobs increase?", "why did this run fetch so many jobs?", and "why did yield change?"
- In the Jolene state-query flow, route `questionKind: "why"` plus search/jobs/profiles domains to this diagnostic answer before the generic `stateFacts()` summary.
- Load the latest 5-10 `JobSearchRun` records, including `jobsFetched`, `jobsAfterDedupe`, `jobsAfterFilters`, `jobsSaved`, `profileIds`, `triggeredBy`, `progress`, `errors`, `startedAt`, and `finishedAt`.
- Reuse `buildSearchRunAnalytics()` for the latest run and prior runs.
- Compare the latest run against the previous baseline and explain whether the spike is raw discovery volume or useful yield.
- Keep the answer read-only; Jolene may recommend reviewing `/dashboard/search`, `/profiles`, or `/runs`, but must not auto-change profiles or sources.

## Test Plan
- Add focused Jolene tests for causal search diagnostics, progress JSON diagnostics, missing progress fallbacks, low useful-yield framing, and non-causal status behavior.
- Run:
  - `npx vitest run src/lib/jolene/actions.test.ts src/lib/job-search/run-analytics.test.ts --config vitest.config.ts`
  - `npx tsc --noEmit --pretty false`
  - `npm run build`
  - `git diff --check`
