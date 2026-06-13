# Jolene Chief of Staff Release Workflow

## Summary
Save the Jolene Chief of Staff plan, update the repo implementation workflow skill so future plan implementations follow the required release steps, then implement Jolene as the proactive Chief of Staff surface with documentation, verification, commit, push, PR, and dev restart.

## Key Changes
- Save the feature plan as `plans/JOLENE_CHIEF_OF_STAFF_PLAN.md`.
- Create branch `feat/jolene-chief-of-staff` from current `main`.
- Update `.agents/skills/development-agent/SKILL.md` so it explicitly triggers whenever the user asks to implement a plan, save it to `/plans`, update all docs, commit, push, create a PR, and restart dev.
- Implement Jolene as “Jolene, Chief of Staff”:
  - add `JOLENE_CHIEF_OF_STAFF` agent type
  - create a Jolene Chief of Staff service using existing `AgentRun`, `AgentRunEvent`, `parentRunId`, and `AgentUserRequest`
  - produce executive priorities, delegated work proposals, blockers, risks, evidence, and approval-needed actions
  - fold Career CEO/standup output into Jolene’s Chief of Staff brief
- Add API routes:
  - `GET /api/jolene/chief-of-staff`
  - `POST /api/jolene/chief-of-staff/run`
  - `POST /api/jolene/chief-of-staff/approve`
- Update `/dashboard` first:
  - show quiet proactive Jolene priority cards
  - include evidence/rationale
  - include approve/open/ask actions
  - keep chat available but no longer make it the primary Jolene value surface
- Preserve safety boundaries:
  - Jolene proposes delegated work by default
  - approved child runs use `parentRunId`
  - no LinkedIn publishing, final application submission, employer contact, or destructive mutation without explicit approval

## Documentation
- Update README/user docs with:
  - Jolene’s Chief of Staff role
  - proactive dashboard cards
  - approval and delegation behavior
  - safety boundaries
  - how this differs from the old chat-only Jolene
- Update any repo wiki-style docs found during implementation.
- Document the updated release workflow skill and when it should trigger.

## Test Plan
- Unit tests:
  - Jolene Chief context includes agent runs/events, blockers, pipeline state, market signals, LinkedIn signals, and career mission data.
  - priorities rank blockers, failed/stale runs, and approval-needed work before optional work.
  - delegated actions require approval.
  - approved delegated runs include `parentRunId`.
  - Career CEO/standup intents route through Jolene Chief output.
- Route tests:
  - latest brief endpoint returns latest Jolene Chief run.
  - run endpoint creates a `JOLENE_CHIEF_OF_STAFF` run.
  - approve endpoint executes only approved supported actions.
- UI tests:
  - `/dashboard` renders “Jolene, Chief of Staff”.
  - proactive priority cards show rationale/evidence.
  - cards expose approve/open/ask actions.
- Verification:
  - read `AGENTS.md`; if `node_modules/next/dist/docs/` is unavailable, follow local App Router patterns
  - Prisma migration/generate
  - targeted Vitest tests
  - `npx tsc --noEmit --pretty false`
  - `npx react-doctor@latest --verbose --diff`
  - `npm run build`
  - local smoke check `/dashboard`, `/agents`, and Jolene API routes

## GitHub Workflow
- Commit message: `Add Jolene chief of staff workflow`
- Push branch `feat/jolene-chief-of-staff`.
- Open PR targeting `main` with title: `Add Jolene Chief of Staff Workflow`.
- PR description should cover:
  - saved plan and skill update
  - Jolene Chief of Staff behavior
  - dashboard proactive cards
  - delegation and approval safety boundaries
  - documentation updates
  - verification results
  - known limitations
- Restart local dev after PR creation and verify the app is running.

## Assumptions
- Updating the existing `development-agent` skill is preferred over creating a second overlapping skill.
- The saved `/plans` file contains the Jolene Chief of Staff product and implementation plan, not the release checklist alone.
- The PR targets `main`.
- If GitHub connector/CLI auth is unavailable, implementation should still commit and push, then report the PR creation blocker clearly.
