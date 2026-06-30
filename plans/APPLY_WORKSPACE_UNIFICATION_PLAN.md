# Unify Job and Application Into an Apply Workspace

## Summary

Use every local `.agents/skills/*` agent in the implementation workflow:
`development-agent`, `system-architecture-agent`, `product-ui-engineer`,
`react-doctor`, `content-quality-editor`, `documentary-content-producer`, and
`staff-pr-writer`. The `.agents/evals/product-ui-engineer` directory is an eval
suite for the `product-ui-engineer` skill, not a separate implementation agent.

Make the application page the canonical Apply Workspace once a job has an
application tracker. The user should search, review, prepare, and apply from one
action-first surface instead of bouncing between duplicate job and application
detail pages.

## Key Changes

- Add a canonical application lookup for job pages.
- Prefer applications with generated materials and recent activity.
- Do not require `ready_to_apply`; approved/material-bearing applications must
  surface.
- Update `/jobs/[id]` so jobs with trackers hand off to the canonical
  `/applications/[id]` workspace.
- Redesign `/applications/[id]` as a dense operating surface with job status,
  match evidence, application URL, packet readiness, and one primary CTA in the
  first viewport.
- Keep human approval and external application gates visible.
- Reduce noise with progressive disclosure across Apply, Materials, Fit,
  Research, and History groupings.
- Collapse full job description, raw evidence references, long research
  sections, and audit history by default.

## Public Interfaces

- No database migration.
- No stored job, application, profile, or evidence records are mutated.
- Add internal helper interfaces for canonical application lookup, primary apply
  action derivation, and Apply Workspace loading.
- Optional tab URL state may be used if it matches existing app patterns.

## Agent Roles

- `system-architecture-agent`: map route ownership, data boundaries, safety
  gates, and schema impact.
- `product-ui-engineer`: shape the page as a compact operating surface.
- `development-agent`: implement, verify, branch, save plan, and prepare release
  workflow.
- `react-doctor`: run React diagnostics after UI changes.
- `content-quality-editor`: review product copy for clarity and safe handling of
  private job/application data.
- `documentary-content-producer`: keep docs/workflow narrative grounded in the
  actual UI change.
- `staff-pr-writer`: prepare reviewer-ready PR notes from the final diff.

## Test Plan

- Add focused tests for canonical application selection.
- Add tests for primary CTA derivation across application states.
- Add UI/source tests that approval gates and employer-form actions remain
  visible.
- Run `npm run lint`, `npx tsc --noEmit --pretty false`, focused Vitest tests,
  `npm run build`, `npx react-doctor@latest --verbose --diff`, and
  `git diff --check`.
- Restart local dev server on `localhost:3000`.
- Verify desktop and mobile screenshots for the Mistral job and application
  routes.

## Assumptions

- Application page is canonical after a tracker exists.
- Duplicate application records are not merged in this change; the UI chooses
  the best canonical one.
- External application submission remains human-controlled.
- The target UI is a dense operating surface, not a decorative dashboard.
