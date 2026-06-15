# Upgrade LinkedIn Content Team For Documentary-Quality Posts

## Summary
- Fix generic repeated hooks, stale plan angles, weak prompt fidelity, and evidence misses in `/linkedin-content`.
- Default the content team to a Documentary Builder standard: scene, evidence, decision, consequence, artifact, and human-readable takeaway.
- Update both runtime content behavior and repo-local skills so current drafts improve immediately and future agents have durable guidance.

## Key Changes
- Make the user prompt the primary assignment; use plan sources as supporting evidence only when relevant.
- Replace generic deterministic fallback lines with format-specific documentary structures.
- Add prompt-relevance scoring so Search Operations chart prompts select search/chart evidence instead of unrelated plan angles.
- Require a concrete evidence anchor from plan sources, agent runs, analytics, screenshots, or grounded claims.
- Add a deterministic repair pass when evidence exists but the draft omits it.
- Add clearer content-team review roles: Assignment Editor, Evidence Reporter, Documentary Producer, Narrative Editor, and Authenticity Reviewer.
- Add `.agents/skills/documentary-content-producer/SKILL.md` and `.agents/skills/content-quality-editor/SKILL.md`.

## Test Plan
- Add tests for the exact Search Operations chart failure pattern.
- Assert generic stale phrases are absent and evidence anchors are present.
- Assert prompt fidelity passes when evidence is present and blocks when evidence is truly absent.
- Assert fallback formats produce distinct structures and analytics are used only for analytics prompts.
- Run targeted LinkedIn content tests, TypeScript, React Doctor, build, diff check, and restart dev.

## Assumptions
- Default voice is Documentary Builder: grounded, specific, readable, candid, and not hype.
- Public LinkedIn output remains review-gated and privacy-safe.
- No Prisma migration is required.
