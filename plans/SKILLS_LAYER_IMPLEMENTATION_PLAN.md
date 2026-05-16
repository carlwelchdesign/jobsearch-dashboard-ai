# Skills Layer With Jolene-Based Learning

## Summary

Add a code-first skills layer over every existing recruiting agent, with runtime learning from mistake reports captured through in-app Jolene. Skills remain deterministic TypeScript wrappers around current services, while learned improvements are stored as auditable database adjustments. Low-risk updates auto-apply only to thresholds, warnings, style guidance, and wording; anything that changes external actions, submissions, data deletion, or broad candidate strategy becomes a pending proposal.

## Key Changes

- Add a `src/lib/skills` registry with typed `SkillDefinition` entries for all existing agent capabilities, including job fit scoring, packet prep, application QA, recruiter outreach, company research, interview prep, portfolio match, outcome learning, search/profile optimization, duplicate detection, networking, compensation, and daily command center.
- Add `runSkill()` as the standard execution wrapper. It should resolve the code-defined skill, merge active learned adjustments, enforce risk policy, call the existing agent/service, and return typed output plus applied adjustment metadata.
- Refactor recruiting agency orchestration to call skills instead of direct service calls for approval, packet preparation, QA, and ready-to-apply decisions. Preserve the existing API response shape for `POST /api/applications/agency/run`.
- Add Prisma models for learning:
  - `SkillFeedback`: mistake report from Jolene, linked when possible to user, skill id, agent run, application, job, and raw Jolene message.
  - `SkillAdjustment`: proposed or active learned change with `skillId`, `kind`, `riskLevel`, `status`, `patchJson`, rationale, source feedback id, and applied timestamps.
- Add Jolene mistake-capture intent. Phrases like "that was wrong", "learn this", "the agency made a mistake", or "don't do that again" should create `SkillFeedback`, classify the likely skill from current page context/history, generate proposed adjustments, auto-apply low-risk ones, and reply with what was recorded.
- Add a Settings or Agents audit surface showing mistake reports, auto-applied updates, pending high-risk proposals, active adjustments, and superseded adjustments.
- Do not let learned adjustments change final employer submission behavior. Final submit remains manual.

## Interfaces And Behavior

- `SkillDefinition` should include: `id`, `label`, `agentType?`, `riskLevel`, `inputSchema`, `outputSchema`, `defaultPolicy`, `execute`, and `applyAdjustments`.
- Low-risk auto-apply is limited to:
  - numeric threshold tweaks with small bounded changes,
  - warning/rationale text,
  - style-rule additions,
  - prompt/guidance wording used by deterministic builders,
  - QA checks that make behavior more conservative.
- High-risk changes must stay pending, including:
  - lowering agency approval safety,
  - changing job scoring weights enough to alter promotion materially,
  - auto-submission behavior,
  - deleting or archiving data,
  - changing personal claims, credentials, compensation, or demographic answers.
- Jolene feedback should preserve the user's original explanation and create structured fields for `problemSummary`, `expectedBehavior`, `affectedSkillId`, `confidence`, and proposed adjustment ids.
- Active adjustments should be versioned and reversible. A newer active adjustment for the same skill/kind should supersede the older one rather than mutating it in place.

## Test Plan

- Unit test the skill registry to confirm every current `AgentType` or agent service has a registered skill.
- Unit test `runSkill()` for adjustment merge order, bounded low-risk changes, and rejection of high-risk auto-apply.
- Unit test Jolene mistake intent parsing and feedback creation from app contexts like job detail, applications, and dashboard.
- Unit test recruiting agency behavior remains compatible: same request/response shape, still creates applications, prepares packets, and never submits externally.
- Unit test audit-log queries for active, pending, and superseded adjustments.
- Run `npm test` and `npm run build`.

## Assumptions

- V1 covers all existing agents with skill wrappers, but only the recruiting agency must be refactored to rely on skills immediately.
- Learning happens through in-app Jolene, not this development chat.
- The base skill definitions live in code; only feedback and learned runtime adjustments live in the database.
- Auto-applied learning is intentionally conservative and auditable.
- The local Next.js docs path required by `AGENTS.md` is unavailable in this dependency install, so implementation follows existing route and UI conventions in this repo.
