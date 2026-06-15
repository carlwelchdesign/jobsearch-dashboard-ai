# Jarvis Search Dashboard + System Architecture Agent

## Summary
- Treat the current search analytics UI as a failed v1, not a small styling issue.
- Replace the flat outcome strip with a real command-dashboard experience using richer Recharts primitives already available: `RadialBarChart`, `RadarChart`, `Treemap`, `Sankey`, `ScatterChart`, and `ComposedChart`.
- Add a first-class `SYSTEM_ARCHITECTURE` agent so the app can explain its own routes, agents, data flows, workflow boundaries, and weak connections from repo evidence.
- Build repo-local skills for future work: a product UI/UX engineer skill and a system architecture agent skill.

## Key Changes
- Redesign `SearchRunAnalyticsCharts` into a dashboard surface:
  - Replace the horizontal outcome bar with a "Run Command Deck": radial run-quality gauge, KPI telemetry tiles, top action callout, and source/profile winners.
  - Add a Sankey or treemap "Opportunity Terrain" view showing where jobs went: saved, review-only, missing URL, duplicates, suppressed/listing pages, and below threshold.
  - Add a radar "Search Signal Profile" showing quality dimensions such as qualification rate, save rate, agency readiness, source concentration, and blocker pressure.
  - Keep useful charts, but make them feel like a cockpit: source bubble map, profile ranked lanes, quality bands, blocker priority, and recent trend.
  - Compact mode becomes a condensed mission card with a radial gauge, top blocker, best source/profile chips, and next-action copy.

- Add a real architecture agent:
  - Add `SYSTEM_ARCHITECTURE` to `AgentType` with a Prisma migration.
  - Add `system_architecture` to the code-first skill registry as low-risk, read-only, and covered by existing registry tests.
  - Implement `runSystemArchitectureAgent` using deterministic repo inspection first: App Router routes, API routes, Prisma models/enums, `AgentRun` usage, ADK/LangGraph boundaries, skill registry, plans, README/wiki docs.
  - Persist the report in `AgentRun.outputJson` with nodes, edges, workflows, risks, orphaned areas, documentation pointers, and recommended architecture decisions.
  - Add `/architecture` plus `GET/POST /api/architecture` so the system map can be refreshed and reviewed from the app.

- Add repo-local skills:
  - `.agents/skills/product-ui-engineer/SKILL.md`: required for future dashboard/frontend redesigns, emphasizing product usefulness, visual hierarchy, responsive verification, and screenshot review.
  - `.agents/skills/system-architecture-agent/SKILL.md`: required for architecture reviews, agent additions, workflow changes, Prisma/agent boundary changes, and system-map updates.
  - Do not download external skills unless curated search reveals a clearly better existing fit; the needed guidance is project-specific.

## Interfaces / Data
- Prisma migration required only for the new `SYSTEM_ARCHITECTURE` enum value.
- No new persistent architecture model for v1; `AgentRun.outputJson` is the durable report store.
- Extend search analytics helper only as needed for derived visual datasets: run quality score, radar dimensions, Sankey/treemap outcome nodes, and action recommendations.
- `node_modules/next/dist/docs/` is unavailable in this checkout, so implementation follows existing Next.js App Router patterns already in the repo.

## Test Plan
- Update search analytics tests for the new derived datasets and verify old flat-copy language stays gone.
- Add component/source-contract tests proving the dashboard no longer renders the old line-style "Run Outcome Mix" strip as the primary experience.
- Add system architecture agent tests for route/model/agent discovery, risk finding generation, and `AgentRun` persistence.
- Run:
  - `npx vitest run src/lib/job-search/run-analytics.test.ts src/components/search-run-analytics-charts.test.ts src/lib/skills/registry.test.ts --config vitest.config.ts`
  - architecture route/agent focused tests added during implementation
  - `npx tsc --noEmit --pretty false`
  - `npx react-doctor@latest --verbose --diff`
  - `npm run build`
  - `git diff --check`
- Restart the dev server and verify `/runs`, dashboard placements that embed `SearchRunAnalyticsCharts`, and the new `/architecture` route.

## Assumptions
- This supersedes the current merged graph replacement rather than layering another small chart tweak on top.
- High visual engagement is desired, but the dashboard must still answer operational questions: what worked, what blocked value, and what to do next.
- The architecture agent is read-only in v1. It reports structure and drift; it does not rewrite code or execute repairs.
