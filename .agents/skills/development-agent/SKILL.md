---
name: development-agent
description: Use whenever the user asks Codex to implement a plan in this repo, especially requests that include saving to /plans, creating a branch, updating all documentation, running verification, committing, pushing, opening a PR, and restarting dev. Captures the repo's required release workflow.
version: "1.1.0"
---

# Development Agent

Use this workflow for requests shaped like: "implement this plan", "PLEASE IMPLEMENT THIS PLAN", or "save this to /plans, implement, update documentation, commit, push, create a PR, and restart dev."

## Workflow

1. Confirm the working tree with `git status --short --branch`.
2. If the user provides or references a plan, save it under `plans/` before implementation using a clear uppercase filename.
3. Create a feature branch from the current base unless the user explicitly says not to.
4. Read the relevant wiki page(s), README section, schema/API entrypoints, and existing tests before editing.
5. Implement the smallest complete vertical slice that satisfies the plan.
6. Update README and wiki/docs in the same commit as the feature when documentation is requested or behavior changes.
7. Add focused tests for new behavior and preserve existing deterministic fallbacks.
8. Run verification:
   - relevant `npx vitest run ... --config vitest.config.ts`
   - `npx tsc --noEmit --pretty false`
   - `npx react-doctor@latest --verbose --diff` when React code changed or feature completion warrants it
   - `npm run build`
   - `git diff --check`
9. Stage only intended files, commit with a terse message, and push the feature branch.
10. Open or update a PR targeting `main` using `staff-pr-writer` standards: include the product/architecture why, subsystem changes, implementation notes, data/migration impact, safety boundaries, exact verification, reviewer guide, and known limitations. Replace thin PR bodies instead of appending to them.
11. Restart the local dev server and verify the changed routes/API surfaces.

## Repo Rules

- Read `AGENTS.md` first; if Next.js docs referenced there are unavailable, follow existing local patterns.
- Do not revert unrelated user changes.
- Keep autonomous/external actions gated; app-local repairs may use Jolene confirmation cards when supported.
- Use existing Prisma, agent, ADK, LangGraph, Jolene, and wiki patterns before introducing new architecture.
- If GPG signing times out, retry with `git -c commit.gpgsign=false commit ...` and mention that in the final response.
