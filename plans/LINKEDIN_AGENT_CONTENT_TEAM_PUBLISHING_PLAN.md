# LinkedIn Agent Content Team Publishing Plan

## Summary

Upgrade `/linkedin-content` into a memory-aware content studio where a team of agents documents recent Job Search OS work, uses aggregate analytics, captures real redacted app screenshots, lets the user edit and approve, then publishes to LinkedIn immediately on approval.

Publishing uses LinkedIn Share on LinkedIn with `w_member_social`. Posting stays gated by draft approval, privacy review, provenance checks, and LinkedIn publishing connection status.

## Key Changes

- Add LinkedIn publishing auth separate from identity-only OIDC.
  - Request `openid profile email w_member_social`.
  - Store access token, expiry, granted scopes, LinkedIn subject/person URN, and connection status.
  - Show Settings copy that this connection can publish approved posts.

- Replace the single content generator with a content strategy team.
  - `Documentarian`: summarizes recent app work, decisions, and agent activity.
  - `Analytics Narrator`: turns aggregate funnel, application, and source numbers into publishable insights.
  - `Product Strategist`: frames the broader lesson around agentic workflow systems.
  - `Editor`: improves clarity, tone, and credibility.
  - `Visual Producer`: selects real app screenshots when useful.
  - `Privacy Reviewer`: blocks sensitive data and unsupported claims.
  - `Publisher`: sends the LinkedIn API call after approval.

- Add a first-class memory and analytics pack before each content run.
  - Sources: recent `AgentRun`, `AgentRunEvent`, `JobSearchRun`, search-run analytics, Apply Sprint funnel, application/outcome counts, Market Intelligence output, accepted skill adjustments, prior LinkedIn drafts, approved edits, archived drafts, and screenshot metadata.
  - Output: aggregate facts, recent decisions, lessons learned, story angles, do-not-claim rules, screenshot recommendations, and source provenance.
  - Public policy: aggregate analytics only. No company names, job URLs, salaries, recruiters, emails, application-specific outcomes, or private user data.

- Extend LinkedIn draft persistence.
  - Add lifecycle states: `DRAFT`, `NEEDS_REVIEW`, `APPROVED`, `PUBLISHING`, `PUBLISHED`, `FAILED`, `ARCHIVED`.
  - Store edited body, hashtags, disclosure text, memory sources, analytics sources, agent reviews, claims, risks, selected screenshots, approval timestamp, publish timestamp, LinkedIn post URN/id, and publish errors.
  - Include subtle disclosure by default: `Prepared by my agent content team from the Job Search OS build log.`

- Add real app screenshot capture.
  - Use Playwright against the running local app.
  - Capture only allowlisted routes such as dashboard, sources, runs, Apply Sprint, settings/learning, and LinkedIn content.
  - Save PNGs under `public/generated/linkedin-content`.
  - Run privacy checks against screenshot metadata and extractable page text where practical.
  - Block media publishing if screenshot privacy review fails.

- Add publish-on-approval flow.
  - User can edit the generated post before approval.
  - Approval is the final user action.
  - If privacy/provenance checks pass and LinkedIn share auth is connected, the app immediately publishes.
  - If LinkedIn or media upload fails, mark the draft `FAILED` and expose retry without losing edits.

- Add LinkedIn publish routes.
  - `POST /api/linkedin-content/drafts/:id/approve`: validates, approves, and publishes.
  - `POST /api/linkedin-content/drafts/:id/publish`: retries a failed approved draft.
  - Text-only posts use LinkedIn UGC `shareMediaCategory: NONE`.
  - Image posts register upload, upload PNG bytes, then create the UGC post with `shareMediaCategory: IMAGE`.

## Test Plan

- Unit tests:
  - OAuth URL includes `w_member_social`.
  - Memory pack includes aggregate analytics and excludes private fields.
  - Agent reviews include provenance and disclosure.
  - Privacy review blocks sensitive post text and screenshot metadata.
  - LinkedIn text/image payloads match UGC API requirements.
  - Publish failures set `FAILED` and preserve draft edits.

- Route tests:
  - Generate draft with agent-team reviews.
  - Edit draft.
  - Approve and publish.
  - Retry failed publish.
  - Reject approval when privacy, provenance, scope, or screenshot checks fail.

- UI tests:
  - Shows memory sources, analytics facts, agent reviews, screenshots, edit controls, approval state, publish state, and retry errors.
  - Approval triggers publishing only when all gates pass.

- Local verification:
  - Read relevant Next.js docs under `node_modules/next/dist/docs/` before implementation when present.
  - Run Prisma migration/generate.
  - Start dev server.
  - Generate a draft from recent app work.
  - Capture at least one redacted real app screenshot.
  - Use mocked LinkedIn API in automated tests; do not publish real posts during tests.

## Assumptions

- Publishing happens immediately after approval.
- v1 focuses on LinkedIn posts only, not scheduling, comments, engagement analytics, or multi-channel campaigns.
- Marketing agents are a content strategy team, not a full campaign automation suite.
- Public analytics are aggregate only.
- Agents may use internal app history to write broadly, but every public claim must be grounded in stored memory, analytics, screenshots, or user-approved edits.
