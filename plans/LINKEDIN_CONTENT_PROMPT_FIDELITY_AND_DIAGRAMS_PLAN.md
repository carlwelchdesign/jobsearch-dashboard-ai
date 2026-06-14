# LinkedIn Content Prompt Fidelity and Diagram Upgrade

## Summary
The bad result happened because generation fell back to the old generic deterministic template and did not enforce prompt satisfaction. The next fix should make `/linkedin-content` treat the user prompt as a contract: if the prompt asks for "system architecture with architectural diagrams," the draft must be about architecture, must include architecture-specific context, and must generate diagram assets. Generic search-funnel posts should be impossible for that prompt.

## Key Changes
- Add a prompt-intent planner before writing.
  - Detect intents such as `architecture_diagram`, `architecture_explainer`, `build_log`, `workflow_story`, `analytics_insight`, `jolene_ops`, `email_ops`, and `market_intelligence`.
  - Convert the user prompt into required content obligations: topic, required concepts, visual artifact type, forbidden generic fallback phrases, and context sources.
  - For architecture prompts, require references to system layers, agents, data flow, memory/context, approval gates, publishing flow, and diagrams.
- Replace the generic deterministic fallback with intent-specific fallbacks.
  - Remove the old reusable "practical testbed / blank page / boundary matters" fallback from LinkedIn content generation.
  - Add an architecture fallback that works even without `OPENAI_API_KEY`.
  - Architecture fallback should use repo-derived context: Next.js App Router, Prisma/Postgres, `AgentRun`/`AgentRunEvent`, Jolene Chief of Staff, Email Ops, LinkedIn content agents, job search, Apply Sprint, Playwright screenshots, OpenAI structured output when configured, and LinkedIn publish gates.
  - Search-funnel analytics should only appear when the prompt or selected intent calls for analytics.
- Add prompt-satisfaction quality gates.
  - Score every draft for prompt coverage before persistence.
  - For architecture-diagram prompts, require architecture language in title/hook/body and require at least one generated diagram asset.
  - Reject or mark `NEEDS_REVIEW` when the draft ignores the prompt, overuses recent phrasing, or relies on unrelated funnel analytics.
  - Persist quality review details so the UI shows "why this matches your prompt" or "why this needs review."
- Generate real architecture diagram assets.
  - Add a Visual Producer path for generated diagrams, separate from app screenshots.
  - Render diagram PNGs under `public/generated/linkedin-content` using local SVG/HTML plus Playwright screenshot capture, avoiding new diagram dependencies.
  - For architecture prompts, generate at least:
    - `System Architecture`: UI/routes, APIs, agent services, Prisma/Postgres, external services.
    - `Agent Content Flow`: prompt, memory pack, plans, analytics, content agents, privacy review, draft approval, LinkedIn publish.
  - Keep privacy review on generated diagrams and publish only the primary selected visual in v1.
- Expand durable draft metadata.
  - Add or reuse JSON persistence for original prompt, detected intent, selected angle, rejected angles, prompt obligations, prompt-satisfaction score, generation mode, quality warnings, visual rationale, and diagram metadata.
  - Show these fields on draft cards so failures are obvious.
  - Display when a draft used deterministic fallback because OpenAI is not configured.
- Improve the `/linkedin-content` UI.
  - Keep the prompt-first composer.
  - Add visible prompt-quality feedback after generation.
  - Add a clear "Generated from prompt" section on each draft.
  - Add a "Visuals" section that distinguishes app screenshots from generated architecture diagrams.
  - Add an optional "Regenerate with same prompt" action that preserves the prompt and asks agents to choose a different angle.

## Test Plan
- Unit tests:
  - Architecture-diagram prompt detects `architecture_diagram`.
  - Architecture fallback produces architecture-specific copy without OpenAI.
  - Old generic fallback phrases are not present in new architecture output.
  - Prompt-satisfaction review blocks unrelated search-funnel posts for architecture prompts.
  - Diagram asset generation creates safe diagram metadata and selected visual rationale.
  - Legacy `contentPillar` generation still works but cannot override an explicit prompt.
- Route tests:
  - `POST /api/linkedin-content/drafts` with `prompt: "system architecture with architectural diagrams"` returns a draft with architecture intent, diagram metadata, plan/repo memory sources, and prompt-quality review.
  - Draft is marked `NEEDS_REVIEW` if prompt satisfaction fails.
  - Existing edit, approve, publish, retry, and archive routes remain compatible.
- UI tests:
  - Draft card shows original prompt, detected intent, quality review, generation mode, visual rationale, and diagram assets.
  - Architecture prompt drafts do not show generic funnel-first copy.
  - Missing OpenAI configuration is visible when fallback mode is used.
- Verification:
  - Read local Next.js docs if available; otherwise follow current App Router patterns.
  - Run targeted Vitest tests for LinkedIn content agent, memory pack, route, and UI source contracts.
  - Run `npx tsc --noEmit --pretty false`, `npx react-doctor@latest --verbose --diff`, `npm run build`, and `git diff --check`.
  - Restart dev and smoke-check `/linkedin-content`.
  - Generate one local architecture-diagram draft and verify the body and visual assets match the prompt.

## Assumptions
- V1 generates local diagram PNG assets and publishes only the primary selected visual.
- OpenAI remains optional, but fallback output must still be prompt-specific and useful.
- Architecture diagrams can be generated from repo/runtime context without exposing private job-search details.
- Privacy and final LinkedIn approval gates remain unchanged.
