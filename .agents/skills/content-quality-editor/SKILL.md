---

name: content-quality-editor
description: Use when reviewing, revising, testing, or gating public content drafts, LinkedIn posts, marketing copy, content-agent output, `/linkedin-content` behavior, prompt-fidelity reviews, publish readiness, or documentary build-in-public drafts for evidence, specificity, repetition, safety, grounded claims, realistic voice, and repairability.
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# Content Quality Editor

Use this skill to prevent weak public content from reaching the user or publishing gate.

This skill is not a copy polish pass.
It is a quality-control gate for public-facing Job Search OS content.

The editor’s job is to decide whether a draft is:

1. **Ready to publish**
2. **Repairable with available evidence**
3. **Review-only**
4. **Rejected**

A weak draft should not pass because it sounds polished.
A strong draft should not be blocked if the evidence exists and the repair is obvious.

## Core Standard

Every public draft must be:

* faithful to the user’s prompt
* grounded in a real evidence anchor
* specific about the artifact, workflow, screen, chart, agent run, decision, or implementation detail
* safe for public sharing
* useful to a reader who does not know the app
* written in a realistic senior-builder voice
* free of repeated hooks, stale phrasing, and generic AI/product filler

The editor should prefer concrete repair over vague criticism.

## Review Steps

### 1. Check prompt fidelity

Compare the draft to the user’s exact prompt.

The main angle must answer the assignment, not merely mention a recent plan, stale build-log item, or generic Job Search OS theme.

Ask:

* What did the user ask for?
* What is the draft actually about?
* Does the hook match the assignment?
* Does the first third make the requested topic clear?

Fail if:

* the draft swaps in a different topic
* the post uses a familiar reusable angle instead of the requested one
* the requested screen, workflow, chart, artifact, or decision is only mentioned in passing

### 2. Identify the evidence anchor

Find the specific evidence anchor used in the public body.

Valid anchors include:

* product screen
* screenshot
* chart
* analytics fact
* plan source
* implementation note
* documented decision
* agent run
* test result
* before/after workflow
* UX failure
* system behavior
* grounded architectural constraint

The evidence must appear in the body of the draft, not only in metadata, source notes, or agent-review commentary.

Fail if:

* the draft says evidence exists but never shows it
* the evidence is only implied
* the evidence appears only in internal notes
* the post makes claims that do not trace to the selected anchor

Repair if:

* the evidence exists in the provided source pack
* the draft only needs the anchor moved into the hook or body
* unsupported language can be replaced with grounded wording

### 3. Check claim support

Every factual body claim must trace to one of:

* the selected evidence anchor
* allowed source material
* aggregate facts
* documented architecture context
* privacy-safe user-provided context

Flag claims that imply:

* traction
* user adoption
* hiring outcomes
* company interest
* product completeness
* performance improvement
* automation accuracy
* live-user behavior
* business results

Fail if those claims are unsupported.

Repair by weakening unsupported claims.

Examples:

Unsupported:

> This is already changing how candidates manage their job search.

Grounded:

> This changed how I understood the next decision inside my own job-search workflow.

Unsupported:

> The agents now know what matters.

Grounded:

> The workflow now has a clearer handoff between evidence, recommendation, and human approval.

### 4. Check specificity

The draft must name the actual thing being discussed.

Look for concrete nouns:

* Command Center
* Slack room
* review queue
* application tracker
* analytics chart
* agent run
* screenshot
* onboarding flow
* content draft
* prompt-fidelity review
* duplicate check
* safe action gate
* workflow handoff

Fail if the draft relies on vague nouns:

* system
* process
* journey
* leverage
* intelligence
* workflow
* content engine
* agent loop
* platform
* operating system

Repair by replacing vague nouns with the actual artifact or behavior.

### 5. Check documentary shape

The draft should have a visible documentary arc.

It does not need labels, but it should include most of:

* scene: what was happening
* evidence: what made the issue visible
* decision: what changed
* consequence: what became clearer, safer, faster, or more useful
* artifact: what now exists
* takeaway: what the reader can learn

Fail if:

* it is only a progress update
* it praises the app without showing the work
* it jumps from problem to slogan
* the takeaway is pasted on instead of earned

Repair by adding the missing turn in the story.

### 6. Check novelty and repetition

Reject repeated hooks, stale openings, recycled transitions, and familiar scaffolding from recent drafts.

Common stale patterns:

* “One plan in the build log keeps pulling me back.”
* “I’ve been thinking a lot about…”
* “The future of job search is…”
* “This started as a simple idea…”
* “The clearest source…”
* “documentarian loop”
* “before after about…”
* “agent content team” used as the story instead of a concrete artifact

Fail if the draft feels like a previous post with nouns swapped.

Repair by rebuilding the hook around the actual evidence anchor.

### 7. Check public safety

Block unsafe or private details.

Do not publish:

* company names from active applications
* job URLs
* recruiter names
* emails
* salaries
* private application outcomes
* private calendar details
* private messages
* viewer identities
* exact application statuses
* unsupported adoption claims
* live-user claims
* confidential source material

Repair by abstracting the sensitive detail.

Instead of:

> A recruiter at [Company] replied after I applied to [job URL].

Use:

> One active application exposed a gap in the workflow.

Instead of:

> This helped me with a $200K role.

Use:

> This helped me separate a high-priority opportunity from general job-search noise.

### 8. Check usefulness

The reader should leave knowing:

* what changed
* why it mattered
* what evidence supported the change
* what practical lesson applies beyond this specific app

Fail if the post only says:

* I built something
* agents helped
* the system is smarter
* job search is hard
* AI makes things easier

Repair by adding the practical consequence.

Example:

> The useful part was not that an agent generated a recommendation. It was that the screen made the recommendation auditable before I acted on it.

### 9. Check voice

The final copy should sound like a realistic senior builder note.

Prefer:

* candid
* specific
* observant
* plainspoken
* slightly imperfect in a human way
* grounded in tradeoffs

Avoid:

* investor marketing
* launch-announcement tone
* abstract AI manifesto language
* fake certainty
* “founder hero” framing
* generic productivity claims
* over-explaining the obvious
* polished-but-empty language

Bad:

> Job Search OS unlocks a new paradigm of autonomous career acceleration.

Good:

> The problem was simpler and more annoying: I had activity everywhere, but no clear answer to what deserved attention next.

## Decision Labels

Use one of these labels in reviews.

### `ready_to_publish`

Use only when:

* prompt fidelity is clear
* evidence appears in the public body
* claims are grounded
* safety passes
* the post is specific
* the takeaway is earned
* no required screenshot or artifact is missing

### `repairable`

Use when:

* the main idea is right
* evidence exists in the source pack
* the draft can be fixed without inventing facts
* safety issues can be abstracted
* the hook or body needs clearer grounding

When marking repairable, provide the repaired version.

### `review_only`

Use when:

* the draft is directionally useful but not publishable
* screenshots or required artifacts are missing
* factual claims need user confirmation
* source evidence is incomplete
* the draft contains useful internal analysis but should not be public yet

### `rejected`

Use when:

* the main angle does not answer the prompt
* there is no available evidence anchor
* the draft invents unsupported claims
* safety problems cannot be repaired cleanly
* the draft is mostly generic filler
* it repeats stale structures from recent content
* the content sounds like marketing copy detached from the work

## Pass Criteria

A draft passes only if all are true:

* Prompt fidelity is clear in the hook or first two paragraphs.
* A concrete evidence anchor appears in the body.
* The body names the artifact, workflow, screen, chart, decision, or agent run being discussed.
* Claims trace to allowed source material.
* The draft includes a documentary shape: scene, evidence, decision, consequence, artifact, or takeaway.
* The reader can understand why the change matters without knowing Job Search OS.
* The final takeaway is earned by the evidence.
* Public safety checks pass.
* The copy sounds like a realistic senior builder note, not generated filler.

## Common Rejections

Reject or repair drafts that:

* answer a different prompt than the user gave
* say “evidence” exists but never show it
* keep evidence only in metadata, review notes, or source facts
* use a plan title as a substitute for an actual story
* repeat “One plan in the build log keeps pulling me back.”
* repeat pasted-output scaffolding like “clearest source,” “documentarian loop,” or `before after about ...`
* use search funnel numbers when the prompt is not about analytics
* rely on “agent content team” as a substitute for a concrete artifact
* mention a workflow but never explain what changed
* make the app sound complete when the source only supports planning or experimentation
* block itself for missing evidence even though grounded claims are available and can be repaired deterministically
* contain factual body claims that do not trace to aggregate facts, selected evidence anchors, or documented architecture context

## Repair Rules

When a draft is weak but repairable:

1. Preserve the user’s requested angle.
2. Select the strongest available evidence anchor.
3. Move that anchor into the first third of the draft.
4. Replace vague nouns with concrete artifacts.
5. Remove unsupported claims.
6. Abstract private details.
7. Add one visible tradeoff or before/after.
8. End with a takeaway earned by the evidence.

Do not over-polish.
Do not make the draft sound more impressive than the evidence supports.

## Required Review Output

When reviewing a draft, return:

### Verdict

Use one:

* `ready_to_publish`
* `repairable`
* `review_only`
* `rejected`

### Reason

Briefly explain the main reason for the verdict.

### Evidence Anchor

Name the anchor, or say `missing`.

### Issues

List the specific issues that matter.

### Fix

If repairable, provide a revised version.

### Safety Notes

Mention anything removed, abstracted, or needing confirmation.

## Editor Bias

Default bias:

* Be strict about evidence.
* Be strict about prompt fidelity.
* Be strict about public safety.
* Be generous about repair when the source material supports it.
* Prefer a plain, specific, slightly rough post over a polished generic one.

The best public content should feel documented, not manufactured.
