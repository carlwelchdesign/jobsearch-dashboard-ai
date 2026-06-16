# Phase 6: Recruiting Search Optimization Team

## Summary

Build a specialized recruiting-agent team that Jolene can orchestrate to actively improve search results and matches. The first optimization target is **Qualified yield**: the share of scored jobs that pass profile thresholds and final filters.

Jolene remains the executive orchestrator. She decides when the search system needs attention, proposes or launches the recruiting search team, and summarizes the outcome. The Recruiting Search Director owns the domain workflow and coordinates specialist child agents for yield diagnosis, profile editing, source quality, match calibration, and outcome review.

## Key Changes

- Add a durable recruiting search optimization workflow:
  - Parent `RECRUITING_SEARCH_DIRECTOR` run.
  - Child specialist runs for search yield, profile editing, source quality, match calibration, and outcome recruiting.
  - `SearchOptimizationRun` and `SearchProfileChange` records for audit, rollback, and UI visibility.
- Allow bounded local profile management:
  - Auto-apply low-risk edits such as excluded keywords/titles, preferred keywords/companies, small threshold moves, max-result caps, and repeated low-yield profile pauses.
  - Keep structural or risky changes review-only: create, merge, delete, global source disable, major threshold jumps, and required keyword rewrites.
- Tie Jolene into orchestration:
  - Jolene Chief of Staff and Operating Loop can propose the recruiting search team when search is stale, Qualified yield is weak, blocker load is high, or profile optimization is stale.
  - Approved Jolene delegated work runs the search optimization team and reports child-run ids.
- Add operating surfaces:
  - `/profiles` shows the latest recruiting search team run, changes, applied edits, proposals, and rollback actions.
  - `/dashboard/search` explains Qualified yield and points to the latest optimization action.
  - `/agents` includes the new agents through roster, quality gates, and skill policy coverage.

## Public Interfaces And Types

- New `AgentType` values:
  - `RECRUITING_SEARCH_DIRECTOR`
  - `SEARCH_YIELD_ANALYST`
  - `SEARCH_PROFILE_EDITOR`
  - `SOURCE_QUALITY_ANALYST`
  - `MATCH_CALIBRATION_REVIEWER`
  - `OUTCOME_RECRUITER`
- New service API:
  - `runRecruitingSearchOptimization({ userId, mode, parentRunId? })`
  - `buildSearchOptimizationContext({ userId })`
  - `applySearchProfileChange(changeId)`
  - `rollbackSearchProfileChange(changeId)`
  - `searchOptimizationGate({ userId })`
- New API routes:
  - `POST /api/search-optimization/run`
  - `GET /api/search-optimization/latest`
  - `POST /api/search-optimization/changes/[id]/apply`
  - `POST /api/search-optimization/changes/[id]/rollback`

## Test Plan

- Unit-test yield diagnosis for low Qualified yield, high blocker load, noisy source/profile pairs, near-miss-heavy score bands, and insufficient data.
- Unit-test bounded change application and rollback for profile fields.
- Route-test protected single-user enforcement for run, latest, apply, and rollback APIs.
- Test Jolene delegated-work integration for proposing and executing the recruiting search team.
- Regression-test skill registry coverage, agent roster coverage, quality gates, profile optimizer behavior, and search-run analytics.

## Assumptions

- Optimization target is Qualified yield first, not raw fetched volume.
- Active management means local profile edits may be applied automatically when low-risk and bounded.
- Risky structural changes remain review-only.
- All edits must be auditable and rollbackable.
- External action boundaries remain unchanged: no auto-submit, no unapproved email sending, no calendar writes, and no unreviewed LinkedIn publishing.
