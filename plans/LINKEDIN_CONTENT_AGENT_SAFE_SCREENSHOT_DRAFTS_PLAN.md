# LinkedIn Content Agent With Safe Screenshot Drafts

## Summary
Add a draft-only LinkedIn content agent that turns Job Search OS progress into engaging, technically credible LinkedIn post drafts. V1 does not post to LinkedIn or request `w_member_social`; it creates reviewable text and redacted/safe screenshot-style attachments for manual copy/download.

## Key Changes
- Add `LINKEDIN_CONTENT` agent support and persisted `LinkedInPostDraft` records.
- Generate structured draft output: title, hook, body, hashtags, content pillar, source facts, screenshot assets, and privacy review.
- Add deterministic fallback content for offline or missing-OpenAI operation.
- Add `/linkedin-content` for generation, copy, screenshot download, and archive.
- Generate safe aggregate SVG share-preview assets instead of live screenshots with personal job/application data.
- Keep Share on LinkedIn API posting documented as a future guarded phase.

## Verification
- Agent, privacy, API, and UI rendering tests.
- TypeScript, diff whitespace check, and production build.
