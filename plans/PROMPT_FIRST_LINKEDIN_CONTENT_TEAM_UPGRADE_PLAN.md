# Prompt-First LinkedIn Content Team Upgrade

## Summary
Upgrade `/linkedin-content` from a fixed content-pillar dropdown into a prompt-first content studio. The agent team should behave more like documentarians: use the user's daily brief, `/plans` history, recent agent work, analytics, prior drafts, app screenshots, and performance signals to create more varied, creative, grounded LinkedIn posts with better visual choices.

## Key Changes
- Replace the content-focus dropdown with a freeform "What should we post about today?" brief.
  - Keep optional quick-start chips such as Build log, Product lesson, Workflow story, Architecture note, Agent decision, Market insight.
  - Preserve backwards compatibility for internal callers that still pass `contentPillar`, but treat it as a weak hint rather than the primary driver.
- Expand the LinkedIn content memory pack.
  - Add `/plans/*.md` as first-class context, summarized into plan titles, recent decisions, implementation themes, unresolved ideas, and narrative angles.
  - Include recent Jolene Chief of Staff briefs, Email Ops summaries, dashboard route work, market intelligence, LinkedIn analytics, prior drafts, approved edits, archived drafts, and agent run summaries.
  - Add novelty signals from recent drafts so the team avoids repeating the same hook, structure, screenshot, and "future CMS / operating system" phrasing.
- Make the content team more creative but still grounded.
  - Add explicit agent roles for `Narrative Strategist`, `Documentarian`, `Editorial Challenger`, `Visual Producer`, `Analytics Narrator`, `Editor`, and `Privacy Reviewer`.
  - Generate multiple candidate angles internally, score them for freshness, specificity, provenance, and visual fit, then persist the selected angle and rejected alternatives in agent reviews.
  - Require varied post structures: build log, lesson learned, decision diary, teardown, before/after workflow, contrarian take, field note, visual walkthrough, and product thesis.
  - Keep privacy rules unchanged: no company names, recruiter names, job URLs, emails, salaries, application-specific outcomes, viewer identities, commenter identities, or unsupported claims.
- Improve screenshots and visual selection.
  - Replace the static four-route recommendation list with a dynamic route catalog covering `/dashboard`, `/dashboard/search`, `/dashboard/social`, `/dashboard/market`, `/dashboard/pipeline`, `/dashboard/email-ops`, `/sources`, `/runs`, `/applications`, `/applications/assistant`, `/jobs`, `/profiles`, `/evidence`, `/resumes`, `/needs-me`, `/agents`, `/settings`, and `/linkedin-content`.
  - Visual Producer chooses 2-3 candidate routes based on the prompt, memory pack, recent app changes, and prior screenshot history.
  - Capture multiple safe screenshots, run the existing privacy checks, and select the strongest story-fit image rather than always slicing to the first passing screenshot.
  - Store screenshot rationale so the user can see why the image was chosen.
- Update APIs and persistence.
  - `POST /api/linkedin-content/drafts` accepts `prompt`, optional `tone`, optional `format`, optional `visualDirection`, and legacy `contentPillar`.
  - Persist prompt metadata in the draft through existing JSON fields where possible.
  - Existing approve, publish, retry, edit, archive, privacy, and LinkedIn publishing behavior remains unchanged.
- Update UI.
  - The top composer becomes a prompt-first generation surface, not a dropdown form.
  - Draft cards show the original prompt, selected angle, agent rationale, plan sources, novelty notes, visual rationale, and screenshot candidates.
  - Keep editing and approval flow intact.

## Test Plan
- Unit tests:
  - Memory pack includes `/plans` summaries and excludes private or unsafe content.
  - Prompt input influences generated angle, title, hook, and screenshot recommendations.
  - Novelty review penalizes repetitive hooks, structures, screenshots, and prior draft phrasing.
  - Privacy review still blocks sensitive text and unsafe screenshot metadata.
  - Legacy `contentPillar` callers still work.
- Route tests:
  - Generate a draft with a freeform prompt.
  - Generate with legacy `contentPillar`.
  - Verify response includes prompt metadata, plan memory sources, agent reviews, and visual rationale.
  - Existing edit, approve, publish, retry, and archive routes remain compatible.
- UI tests:
  - `/linkedin-content` no longer renders the content-focus dropdown as the primary control.
  - Composer includes a freeform prompt and quick-start chips.
  - Draft cards show plan sources, selected angle, visual rationale, screenshots, and agent reviews.
- Verification:
  - Read relevant Next.js docs under `node_modules/next/dist/docs/` if present.
  - Run targeted Vitest tests for LinkedIn content agent, memory pack, routes, and UI source tests.
  - Run `npx tsc --noEmit --pretty false`, `npx react-doctor@latest --verbose --diff`, `npm run build`, and `git diff --check`.
  - Restart dev and smoke-check `/linkedin-content`.

## Assumptions
- Default UX is freeform brief with optional quick-start chips.
- Default voice is bold but grounded: creative, specific, and engaging, but every public claim still needs provenance.
- Default visual strategy is story-fit screenshots chosen dynamically by the Visual Producer.
- This remains a draft/review/publish workflow; agents do not publish without explicit approval.
