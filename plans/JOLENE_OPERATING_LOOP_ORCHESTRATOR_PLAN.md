# Jolene Operating Loop Orchestrator

## Summary
Formalize Jolene as the user-facing orchestrator for Job Search OS. Jolene remains “Chief of Staff,” while a new Jolene Operating Loop becomes the underlying planner/scheduler that monitors system signals, decides which specialist teams should act, creates approval cards, tracks child runs, and summarizes outcomes back to `/dashboard`.

## Key Changes
- Add a `JOLENE_OPERATING_LOOP` agent type and service that:
  - Reads current system state: open `AgentUserRequest`s, failed/stale `AgentRun`s, Email Ops freshness, search freshness, market freshness, application pipeline counts, ready-to-apply work, LinkedIn drafts/analytics, and career standup signals.
  - Produces an operating plan with signal summary, recommended actions, skipped actions, approval-needed actions, run rationale, and expected child agents.
  - Creates or refreshes a Jolene Chief of Staff brief after each loop so the dashboard always shows the latest executive summary.

- Use Jolene as the orchestrator, not a separate visible persona:
  - Dashboard copy remains “Jolene, Chief of Staff.”
  - Internally, the operating loop is the scheduling/planning layer.
  - Specialist teams still report through `parentRunId` when launched by Jolene.

- Add a conservative v1 autonomy policy:
  - Default mode: **propose first**.
  - Jolene may generate briefs and approval cards automatically.
  - Child agents do not auto-run unless explicitly approved.
  - External actions remain blocked without existing explicit gates: no LinkedIn publishing, application submission, employer contact, email sending, or external calendar writes.

- Add operating loop APIs:
  - `GET /api/jolene/operating-loop`: latest loop plan, freshness, proposed actions, skipped actions, and child-run status.
  - `POST /api/jolene/operating-loop/run`: manually run the planner.
  - `POST /api/jolene/operating-loop/approve`: approve selected proposed internal actions.
  - `GET /api/cron/jolene-operating-loop`: cron-compatible scheduled planner endpoint protected by `CRON_SECRET`.

- Add dashboard UI:
  - Extend the existing Jolene Chief of Staff card with “Operating Loop” status.
  - Show last loop run, next recommended action, blocked signals, and approval-needed actions.
  - Add `Run Operating Loop` action.
  - Keep existing delegated-work approval buttons, but make it clear they came from Jolene’s orchestration pass.

- Add persistence:
  - Store loop runs as `AgentRun` rows with agent type `JOLENE_OPERATING_LOOP`.
  - Store loop output in `outputJson`.
  - Store child-agent launches with `parentRunId` pointing to the operating-loop run or the generated Chief of Staff run, using one consistent parent chosen during implementation.
  - No separate scheduler table in v1 unless current `AgentRun` history proves insufficient.

## Public Interfaces
- New `AgentType`: `JOLENE_OPERATING_LOOP`.
- New routes:
  - `GET /api/jolene/operating-loop`
  - `POST /api/jolene/operating-loop/run`
  - `POST /api/jolene/operating-loop/approve`
  - `GET /api/cron/jolene-operating-loop`
- New dashboard fields exposed through the existing Jolene dashboard surface:
  - last loop run time
  - loop status
  - proposed actions
  - skipped actions
  - approval-needed actions
  - child-run outcomes
- `vercel.json` adds a scheduled Jolene operating loop cron, defaulting to a conservative cadence such as every 2 hours.

## Test Plan
- Unit tests:
  - Operating loop reads the right signal pack.
  - Blockers, failed/stale runs, Email Ops freshness, search freshness, ready applications, and LinkedIn content needs are ranked correctly.
  - Proposed child actions require approval by default.
  - Unsafe/external actions are never auto-run.
  - Approved child runs preserve `parentRunId`.
  - Loop output can generate or refresh a Jolene Chief of Staff brief.

- Route tests:
  - Fetch latest operating loop.
  - Run operating loop manually.
  - Approve selected proposed actions.
  - Reject unsupported, stale, or unsafe approvals.
  - Cron route rejects invalid `CRON_SECRET` and runs with valid auth.

- UI tests:
  - `/dashboard` shows Jolene Operating Loop status.
  - Dashboard shows last run freshness, proposed work, skipped work, and approval-needed actions.
  - Approval buttons launch only supported internal actions.
  - Empty/no-loop state is readable.

- Verification:
  - Prisma migration/generate.
  - Targeted Jolene, route, dashboard, and agent-run tests.
  - `npx tsc --noEmit --pretty false`.
  - `npx react-doctor@latest --verbose --diff`.
  - `npm run build`.
  - Local smoke checks for `/dashboard`, `/agents`, `/api/jolene/operating-loop`, and `/api/cron/jolene-operating-loop`.

## Assumptions
- Jolene is the orchestrator persona; no separate visible “Orchestrator” character is introduced.
- V1 defaults to propose-first orchestration, not autonomous child-agent execution.
- The operating loop may run on a schedule, but it creates plans and approval cards rather than taking risky action.
- Existing specialist agents remain independent services that report to Jolene through `parentRunId`.
- External actions stay behind their current explicit approval gates.
