# Staff PR Body Template

Use this as the default structure for meaningful repository PRs.

```markdown
## Why

Explain the product, architecture, or operational problem this PR solves. Include the phase/plan context when relevant.

## What Changed

- **Area:** Concrete change and user/system impact.
- **Area:** Concrete change and user/system impact.
- **Area:** Concrete change and user/system impact.

## Implementation Notes

Describe the important contracts, services, route behavior, UI behavior, and compatibility decisions. Mention what was intentionally left unchanged.

## Data / Migration

List schema changes, migrations, generated-client requirements, backfill behavior, local deployment implications, and any data-preservation semantics.

## Safety And Boundaries

Call out protected workflows, human-in-the-loop requirements, destructive-action behavior, external action boundaries, and any real local data that was or was not mutated during verification.

## Verification

- `command` - result
- `command` - result
- Route check: `METHOD /path` - result

Include failed-then-fixed checks when they matter for reviewer confidence.

## Reviewer Guide

Review in this order:

1. `path` - why it matters.
2. `path` - why it matters.
3. `path` - why it matters.

## Known Limitations / Follow-Ups

- Honest limitation or deferred work.
- Any intentionally skipped local/prod mutation.
```
