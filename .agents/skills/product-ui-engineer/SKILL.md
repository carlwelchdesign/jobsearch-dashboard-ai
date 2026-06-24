---

name: product-ui-engineer
description: Use when designing, redesigning, reviewing, or implementing dashboards, charts, command centers, analytics panels, review queues, decision surfaces, or other React UI in this repo where product usefulness, visual hierarchy, responsive layout, evidence visibility, action safety, accessibility, and screenshot verification matter.
version: "1.1.0"
----------------

# Product UI Engineer

Use this skill before implementing dashboard, analytics, command center, or decision-surface UI changes in Job Search OS.

The goal is not to make the UI look impressive.
The goal is to help the user understand what is happening, what matters, what is blocked, what evidence supports the system’s recommendation, and what action is safe to take next.

A strong Job Search OS interface should feel like an operating surface, not a marketing page.

## Core Responsibility

Design and implement React UI that answers four questions:

1. **What is happening right now?**
2. **Why does it matter?**
3. **What evidence supports that conclusion?**
4. **What should the user do next, and is it safe?**

If a dashboard, chart, or command center does not help with decision, confidence, diagnosis, prioritization, or safe action, it is probably decorative.

## Required Workflow

### 1. Read the existing implementation first

Before editing, inspect:

* the current component
* parent page or route where it appears
* data helper or selector
* mock data or fixture source
* source-contract tests
* existing UI tests
* relevant API route or server action
* related wiki, README, or product notes if available

Do not redesign from imagination if the repo already has product language, data contracts, or UI patterns.

### 2. Identify the user job

Define the job of the UI before changing layout.

The UI should primarily help the user do one or more of:

* decide what deserves attention
* choose the next action
* understand confidence or uncertainty
* diagnose a blocker
* compare options
* review evidence
* approve or reject a risky action
* understand progress over time
* recover from stale, missing, or failed data

Write the design around the job, not around chart variety.

Bad UI goal:

> Make the dashboard more visually interesting.

Good UI goal:

> Help the user see which job-search lane is blocked, why it is blocked, and what the safest next action is.

### 3. Establish the decision hierarchy

Before choosing components, define the information hierarchy:

1. Primary status or decision
2. Most important evidence
3. Blockers or risks
4. Recommended next action
5. Secondary metrics
6. Historical or diagnostic detail

The first screenful should not bury the answer under charts.

A useful command center should show:

* current state
* priority
* evidence
* risk
* next action
* approval requirement, if any

### 4. Prefer operating surfaces over presentation layouts

Build dense, useful product UI.

Prefer:

* status lanes
* ranked work queues
* compact metric tiles
* evidence cards
* decision summaries
* confidence indicators
* blockers
* safe action controls
* review states
* audit trails
* empty/error/stale states

Avoid:

* hero sections
* decorative cards
* vague feature copy
* oversized metrics without context
* charts that do not change a decision
* marketing explanations inside the product
* generic “AI insights” panels

The UI should not explain that it is smart.
It should show the evidence that makes it useful.

### 5. Choose charts by question, not appearance

Every chart must answer a concrete product question.

Use charts only when they clarify:

* what worked
* what changed
* what is blocked
* where effort is going
* where value is coming from
* what is stale
* what needs review
* what should happen next

Chart guidance:

* **Trend line / area**: change over time
* **Ranked bars**: top contributors, blockers, or priorities
* **Stacked bars**: composition across categories
* **Scatter / bubble**: effort vs. yield, confidence vs. impact
* **Radar**: balance across a small number of dimensions
* **Radial status**: compact progress or completion state
* **Treemap**: distribution across many categories
* **Timeline**: sequence of events or workflow progress
* **Table / queue**: reviewable items where action matters more than visualization

Avoid making a single flat bar chart the main experience unless it is a small supporting element.

Use existing Material UI and Recharts dependencies before adding libraries.

Do not introduce a new charting library unless:

* Recharts cannot reasonably support the needed visualization
* the new dependency is justified in the plan or PR
* bundle and maintenance impact are considered

### 6. Make evidence visible

If the UI includes a recommendation, score, priority, or next action, it should expose the evidence behind it.

For recommendation surfaces, include:

* why this item is recommended
* what data contributed to the recommendation
* what is uncertain
* what is stale or missing
* what action is safe
* what action needs approval

Avoid black-box UI.

Bad:

> Recommended: Follow up today.

Good:

> Recommended: Draft a follow-up. Evidence: no response after 6 days, prior thread exists, role still marked active. Requires approval before email is sent.

### 7. Keep safety gates visible

Any work that can affect external systems must show approval state clearly.

This includes:

* applications
* email
* calendar
* Slack
* recruiter messages
* job-board actions
* document edits
* public content publishing
* external API writes

Risky actions should have:

* clear action label
* preview of what will happen
* approval or confirmation state
* cancel path
* visible boundary between draft and sent/published/applied
* audit-friendly result after action

Do not hide safety behind a menu or generic button.

Bad:

> Run Agent

Good:

> Draft follow-up
> Requires approval before sending

### 8. Design responsive behavior intentionally

Before implementation, define how the UI behaves at:

* mobile width
* tablet width
* desktop width
* dense dashboard width
* narrow side panel or embedded view, if relevant

Protect against:

* overlapping chart labels
* clipped legends
* metric cards with wrapping numbers
* unreadable axis labels
* buttons pushed offscreen
* tables that become unusable
* cards that grow unevenly
* hidden approval controls
* scroll traps

For chart panels:

* set explicit min heights
* use responsive containers carefully
* avoid long labels on axes when compact
* provide compact legends or summaries
* consider switching from chart to ranked list on small screens
* test with realistic data, long labels, zero states, and loading states

### 9. Handle real product states

Do not design only the happy path.

Cover:

* loading
* empty
* error
* partial data
* stale data
* zero metrics
* long labels
* high counts
* low confidence
* blocked actions
* approval required
* permission denied
* offline or failed agent run
* no recommendation available

Empty states should be useful, not decorative.

Bad:

> Nothing here yet.

Good:

> No applications need review right now. Last checked 14 minutes ago. Duplicate checks and follow-up scans are still available.

### 10. Preserve product language

Product UI copy should be specific, calm, and action-oriented.

Prefer:

* “Needs review”
* “Blocked by missing evidence”
* “Draft ready”
* “Approval required”
* “Last checked”
* “No safe action available”
* “Recommended next step”
* “Evidence”
* “Confidence”
* “Stale”

Avoid:

* “Unlock”
* “Supercharge”
* “AI magic”
* “Revolutionize”
* “Autonomous”
* “10x”
* “Command your career”
* “Seamless intelligence”
* “Game-changing”

Do not add decorative copy explaining how to use the app.
Let controls, labels, and data carry the interface.

### 11. Implement using existing patterns

Prefer existing repo conventions for:

* Material UI layout
* theme tokens
* spacing
* typography
* Recharts wrappers
* loading states
* error states
* card components
* data helpers
* route structure
* test utilities
* fixtures
* accessibility patterns

Do not introduce:

* one-off styling systems
* unnecessary wrappers
* new global theme assumptions
* hard-coded magic values without reason
* hidden layout dependencies

### 12. Add focused tests

Add or update tests that protect:

* product language
* important datasets
* visible safety gates
* empty/error/stale states
* chart fallback summaries
* responsive/compact behavior where testable
* action disabled/enabled rules
* evidence visibility
* source-contract expectations

Tests should verify what the user depends on, not implementation trivia.

Good test targets:

* “Approval required” appears for risky actions
* recommended item includes evidence text
* stale data warning appears
* zero-state message is useful
* chart data helper handles missing values
* compact mode still exposes next action
* blocked item cannot trigger external action

### 13. Verify visually and technically

Run the required technical checks from the repo workflow.

At minimum, when React UI changed:

```bash id="x9bmrh"
npx react-doctor@latest --verbose --diff
npx tsc --noEmit --pretty false
npm run build
git diff --check
```

Run targeted tests:

```bash id="wzhxbp"
npx vitest run <relevant-test-files> --config vitest.config.ts
```

When a local route is affected, verify in browser screenshots.

Capture screenshots for:

* desktop
* mobile or narrow viewport
* loading/empty/error state when practical
* the main changed route or panel
* any chart-heavy area

Do not mark UI work complete until screenshots confirm:

* no overlap
* no clipped critical text
* charts are legible
* primary action is visible
* approval gates are visible
* empty/error states are understandable
* layout works at realistic widths

## Product Rules

* The UI must answer a concrete user question.
* The first screenful should clarify status, evidence, risk, and next action.
* Charts must support a decision, diagnosis, comparison, or trend.
* Avoid single flat bars as the main experience unless they are only supporting context.
* Use multiple visual encodings only when they improve understanding.
* Dense is good when it increases operational clarity.
* Minimal is good when it removes distraction.
* Pretty is not enough.
* Keep approval gates visible for work that can affect applications, email, calendar, Slack, public content, or external systems.
* Do not add decorative instruction copy.
* Do not bury important actions below ornamental charts.
* Do not hide uncertainty.
* Do not imply automation has acted when it has only drafted, recommended, or queued.
* Do not make unsafe external actions one-click without preview or confirmation.

## Visual Hierarchy Rules

For command centers and dashboards, prioritize:

1. What needs attention now
2. Why it needs attention
3. What evidence supports that
4. What action is available
5. Whether approval is required
6. What changed recently
7. What supporting metrics explain the pattern

For analytics panels, prioritize:

1. The question the chart answers
2. The main reading of the chart
3. The comparison or trend
4. The implication
5. The underlying data or caveat

For review queues, prioritize:

1. Item identity
2. Reason for review
3. Evidence
4. Risk level
5. Recommended action
6. Approve/reject/defer controls
7. Last updated timestamp

## Accessibility Rules

UI changes should preserve or improve accessibility.

Check:

* semantic headings
* useful button labels
* keyboard-reachable controls
* visible focus states
* color is not the only signal
* chart summaries exist for important data
* loading and error states are announced where appropriate
* disabled states explain why action is unavailable
* icons have labels or are decorative correctly

Charts should include surrounding text that summarizes the key point so the meaning is not locked inside the visual.

## Data Display Rules

When data is missing, stale, or uncertain, show that clearly.

Do not:

* convert unknown to zero
* hide missing data in a successful state
* show precision the data does not support
* imply confidence without a source
* over-rank items with weak evidence

Prefer labels like:

* “No data yet”
* “Unknown”
* “Last checked”
* “Needs refresh”
* “Low confidence”
* “Blocked by missing evidence”
* “Partial data”

## Screenshot Review Checklist

Before calling the UI done, inspect screenshots for:

* Does the page answer the intended user job?
* Is the primary state visible without scrolling?
* Is the next action obvious?
* Is evidence visible near the recommendation?
* Are risky actions clearly gated?
* Are charts legible?
* Are legends and labels readable?
* Does the layout survive narrow widths?
* Are empty/error/loading states useful?
* Does the screen feel like an operating surface, not a landing page?

## PR Notes for UI Work

When opening or updating a PR for UI work, include:

* the user job the UI now supports
* screens/routes changed
* components changed
* data helpers changed
* chart or layout decisions
* responsive behavior
* safety gates preserved or added
* tests added
* screenshots captured
* known limitations

## Completion Criteria

UI work is complete only when:

* the user job is clear
* the component uses existing local patterns
* important states are handled
* safety gates are visible where required
* focused tests are added or updated
* TypeScript passes
* build passes
* React Doctor passes when applicable
* screenshots verify affected routes or panels
* docs are updated when behavior or workflow changed

## Editor Bias

Default bias:

* Clarity beats decoration.
* Evidence beats vibes.
* Actionability beats visual complexity.
* Gated workflows beat magical automation.
* Existing patterns beat new dependencies.
* Screenshot verification beats “looks fine in code.”
* A compact operating surface beats a spacious marketing dashboard.
