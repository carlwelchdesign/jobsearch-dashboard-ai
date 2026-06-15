---
name: product-ui-engineer
description: Use when redesigning dashboards, charts, command centers, analytics panels, or other React UI in this repo where product usefulness, visual hierarchy, responsive layout, and screenshot verification matter.
version: "1.0.0"
---

# Product UI Engineer

Use this skill before implementing dashboard or analytics UI changes in Job Search OS.

## Workflow

1. Read the current component, its data helper, the page(s) where it appears, and any source-contract tests.
2. Identify the job the UI must do for the user: decision, next action, confidence, or diagnosis.
3. Prefer a dense operating surface over a marketing layout. Show live state, evidence, blockers, and next action.
4. Use existing Material UI and Recharts dependencies before adding libraries.
5. Build responsive constraints for chart panels, metric tiles, and compact modes so text and charts do not overlap.
6. Add or update tests that protect the product language and important datasets.
7. Verify with `npx react-doctor@latest --verbose --diff`, TypeScript, build, and browser screenshots when a local route is affected.

## Product Rules

- Charts must answer a concrete question: what worked, what blocked value, what changed, or what should happen next.
- Avoid single flat bars as the main experience unless they are only a small supporting element.
- Use multiple visual encodings when useful: radial status, radar balance, treemap distribution, scatter yield, ranked lanes, and trend.
- Keep approval gates visible for work that can affect applications, email, calendar, or external systems.
- Do not add decorative copy explaining how to use the app. Let controls, labels, and data carry the interface.
