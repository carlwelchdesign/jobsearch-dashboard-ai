---
name: content-quality-editor
description: Use when reviewing, revising, or testing public content drafts, LinkedIn posts, marketing copy, content-agent output, `/linkedin-content` behavior, prompt-fidelity reviews, or publish readiness for evidence, specificity, repetition, safety, and realistic documentary quality.
---

# Content Quality Editor

Use this skill to reject weak public content before it reaches the user or publishing gate.

## Review Steps

1. Compare the draft to the user's exact prompt. The main angle must answer that prompt, not merely mention a recent plan.
2. Identify the evidence anchor. If there is no plan, analytics fact, screenshot, agent run, or grounded claim in the draft, mark it not ready.
3. Check novelty. Reject repeated hooks, stale openings, generic build-log phrases, and recycled structures from recent drafts.
4. Check specificity. The draft must name the artifact, decision, workflow, chart, or screen being discussed.
5. Check public safety. Block private job-search details, company names, job URLs, recruiters, emails, salaries, private application outcomes, unsupported adoption, or live-user claims.
6. Check usefulness. The reader should leave knowing what changed, why it mattered, and what evidence supports it.

## Pass Criteria

- Prompt fidelity is clear in the title, hook, or first two paragraphs.
- Evidence appears in the body, not only metadata.
- The draft has a documentary shape: scene, evidence, decision, consequence, artifact, or takeaway.
- Claims are grounded in the allowed source pack.
- The final copy sounds like a realistic senior builder note, not random generated filler.

## Common Rejections

- Main angle is unrelated to the prompt.
- Draft says "evidence" exists but never shows it.
- Draft repeats "One plan in the build log keeps pulling me back."
- Draft uses search funnel numbers when the prompt is not about analytics.
- Draft relies on "agent content team" or "documentarian loop" as a substitute for a concrete story.
- Draft blocks itself for missing evidence even though grounded claims are available and could be repaired deterministically.
