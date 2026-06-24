# Clear Architecture Warning on `/architecture`

## Summary

- The "6 agent type(s)" warning is stale saved report data from June 17, 2026. Current source already covers those agent types, and focused registry tests pass.
- The remaining real issue is the API documentation warning. The scanner checks documentation filenames instead of documentation content, so it reports noisy gaps.
- Fix both by improving the architecture scanner, documenting the missing high-impact route families, and refreshing the saved architecture report.

## Key Changes

- Update `src/lib/agents/system-architecture.ts` so documentation detection reads README/wiki/skill file contents, not just paths.
- Keep route matching deterministic and conservative: exact route mention first, dynamic segment tolerant matching second, documented route-family matching only for explicit API family references.
- Add architecture docs for these route families with owner, data boundary, and approval policy:
  - `/api/agent-user-requests/[id]/resolve`, `/api/agent-user-requests/stream`
  - `/api/application-answer-memory`
  - `/api/application-field-memory/[id]`, `/api/application-field-memory/bulk`
  - `/api/cover-letters/[id]/pdf`, `/api/cover-letters/[id]/plain-text`
  - `/api/resume-profiles/[id]`, `/api/resume-profiles/seed`
- Refresh the architecture report after code/docs changes so `/architecture` shows the current run instead of the stale June 17 report.

## Public Interfaces

- No new API routes, schema fields, or Prisma migrations.
- Internal report-generation types may change to carry doc content during scanning, but `SystemArchitectureOutput.documentation` should remain path/summary based so the UI contract stays stable.
- `/api/architecture` behavior remains the same: `POST` creates a new read-only `SYSTEM_ARCHITECTURE` run.

## Test Plan

- Run focused tests:
  - `npm test -- --run src/lib/agents/system-architecture.test.ts src/lib/skills/registry.test.ts`
- Add or update architecture tests to assert:
  - no "Agent types without skill policy coverage" risk when registry coverage is current
  - route documentation detection uses doc content and no longer flags the documented route families
- Run broader verification before handoff:
  - typecheck/build as appropriate for this repo
  - refresh `/api/architecture`
  - reload `http://localhost:3000/architecture` and confirm the stale six-agent warning is gone

## Assumptions

- The desired outcome is to remove false/stale architecture warnings, not hide genuine risks.
- The six specialist recruiting-search agent types should remain covered by existing registry entries, not documented as infrastructure-only.
- If `node_modules/next/dist/docs/` remains unavailable, follow the repo's existing App Router route-handler patterns as the local skill allows.
