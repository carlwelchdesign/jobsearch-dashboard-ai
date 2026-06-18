# Slack Jolene Channel

## Summary

Add first-class Slack chat for the dedicated `SLACK_OPS_JOLENE_ID` channel. Every human message in that channel gets a threaded Jolene response, and safe internal Jolene work can run directly from Slack. External actions remain blocked, and guarded/destructive actions stay behind existing app confirmation boundaries.

## Key Changes

- Extend Slack config with optional `joleneChannelId` from `SLACK_OPS_JOLENE_ID`; keep `SLACK_OPS_CHANNEL_ID` and approvals behavior unchanged.
- Add a Slack Jolene channel handler used by `scripts/slack-dev.ts`:
  - ignore bot/subtype/blank messages
  - only process messages from `SLACK_OPS_JOLENE_ID`
  - reply in the top-level prompt thread, or continue an existing thread
  - strip simple `Jolene` or bot-mention prefixes before routing
- Extract the existing `/api/jolene` POST logic into a shared Jolene chat service so the app route and Slack worker use the same persistence, retrieval, fallback, and response behavior.
- In Slack mode, resolve the protected app user through existing single-user config (`SEED_USER_EMAIL` / `JOB_SEARCH_OS_USER_ID`) and enforce `SLACK_ALLOWED_USER_IDS` if configured.
- Allow direct safe internal commands from the Jolene channel, per chosen preference:
  - job search
  - duplicate/stale check
  - Email Ops
  - Daily Command Center refresh
  - Market Intelligence refresh
  - Jolene Chief of Staff / Operating Loop / Recruiting Search Team through existing Slack run services where applicable
- Keep safety boundaries:
  - no application submit
  - no email/outreach send
  - no LinkedIn publish
  - no external calendar writes
  - no broad destructive app mutations from Slack
- Persist Slack-originated chat in `JoleneConversation` / `JoleneMessage` with Slack metadata in JSON, and log outgoing Slack replies through `NotificationLog`.
- Update README, `.env.example`, Slack setup docs, and the user guide to describe the Jolene channel, required bot invite, allowed-user recommendation, and examples.

## Public Interfaces

- `SLACK_OPS_JOLENE_ID` becomes an active optional env var.
- `SlackConfig` gains `joleneChannelId: string | null`.
- Slack post channel routing gains a `jolene` channel target.
- No Prisma migration is needed; existing JSON fields and `NotificationLog` are enough.
- No new Slack scopes should be required because the manifest already includes channel/group message events; the bot must be invited to the Jolene channel.

## Test Plan

- Add focused Vitest coverage for:
  - config parsing of `SLACK_OPS_JOLENE_ID`
  - ignoring messages outside the Jolene channel
  - ignoring bot/subtype/blank messages
  - threaded response behavior for top-level and thread replies
  - allowed-user enforcement
  - safe command execution from Slack
  - external/destructive requests staying blocked
  - Slack text chunking/sanitization for long Jolene replies
- Run:
  - `npx vitest run src/lib/slack/config.test.ts src/lib/slack/jolene-channel.test.ts src/app/api/jolene/route.test.ts src/lib/jolene/actions.test.ts --config vitest.config.ts`
  - `npx tsc --noEmit --pretty false`
  - `npm run build`
- Manual verification:
  - start `npm run dev`
  - start `npm run slack:dev`
  - post a normal question in the Jolene channel and verify a threaded reply
  - post a safe command such as `run email ops` and verify the app records the run
  - post an external request such as `send this recruiter an email` and verify Jolene refuses/redirects to manual confirmation

## Assumptions

- The dedicated Jolene channel is intended to be an interactive assistant room, so every human message should trigger Jolene.
- Slack-originated safe internal work may execute directly, but external or destructive work remains blocked.
- Threaded replies are preferred to keep the channel readable.
- The current local `SEED_USER_EMAIL` identifies the app user for Slack Jolene.
