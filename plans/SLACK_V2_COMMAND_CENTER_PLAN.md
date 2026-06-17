# Slack V2 Command Center

## Summary

Build Slack v2 as an internal-only command center over the existing Job Search OS control plane. Slack should make status, pending approvals, safe internal run starts, and decision history easier to use, while `AgentRun`, `AgentRunEvent`, `NotificationLog`, Jolene services, and the app remain the source of truth.

Chosen defaults:
- Primary focus: Command center
- Primary surface: Slack App Home + expanded `/jso`
- Authority: Internal app actions only
- Slack API fit: keep Socket Mode, add App Home publishing, modal confirmations, and richer slash-command responses.

## Key Changes

- Add a Slack Home tab dashboard with today status, pending approvals, latest runs, app links, and safe internal action buttons.
- Expand `/jso` to support `status`, `approvals`, `runs`, `run jolene`, `run loop`, `run search-team`, and `help`.
- Require Slack modal confirmation before any command or Home button starts internal app work.
- Keep v1 approval buttons while improving state feedback and preserving run-owner resolution from persisted run/entity records.
- Avoid a new `AgentType`; Slack remains an ops surface over existing app services.

## Safety Rules

- Slack may start or approve internal app work only.
- Slack must not submit job applications, send email, publish LinkedIn posts, contact employers, mutate external calendars, or make irreversible external moves.
- `SLACK_ALLOWED_USER_IDS` applies to every mutating Slack action.
- Durable state remains in Prisma, `AgentRun`, `AgentRunEvent`, and `NotificationLog`.

## Test Plan

- Unit-test Slack config/manifest expectations, Home view rendering, command routing, modal handlers, authorization, and existing run-owner approval behavior.
- Mock Slack client paths for App Home publishing and interaction updates.
- Verify with focused Slack tests, full tests, TypeScript, build, and `git diff --check`.
