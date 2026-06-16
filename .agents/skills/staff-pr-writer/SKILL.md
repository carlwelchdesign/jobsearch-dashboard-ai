---
name: staff-pr-writer
description: Write or rewrite professional, staff-level GitHub pull request titles and descriptions for this repo. Use when creating a PR, updating a weak PR body, summarizing a branch for reviewers, preparing release notes from a diff, or converting implementation work into a contextual reviewer-ready PR with architecture, product, data, safety, verification, and rollout detail.
---

# Staff PR Writer

## Purpose

Turn repo changes into a PR that a senior reviewer can evaluate without reconstructing the entire branch. The PR body must explain why the work exists, what changed, how it was implemented, how it was verified, what risks remain, and how it should be reviewed.

## Context Gathering

Before writing, gather current facts from the branch. Do not rely only on memory or the final commit message.

Use these sources when available:

- `git diff main...HEAD --stat`
- `git diff main...HEAD --name-only`
- relevant focused diffs for the primary service, schema, routes, UI, docs, and tests
- `/plans/*` files touched by the branch
- README/user guide/doc changes touched by the branch
- verification commands actually run and their outcomes
- local route checks actually performed
- known skipped checks or intentionally avoided mutations

If GitHub PR metadata is available, inspect the current title/body and preserve accurate parts while replacing shallow structure.

## Writing Standard

Write like a staff engineer handing the PR to a busy but careful maintainer:

- Lead with the product/architecture problem, not a file list.
- Separate the change into meaningful layers: schema/data, domain services, routes/workflows, UI/docs, tests.
- Name the important contracts and boundaries introduced or changed.
- Explain migration or rollout implications.
- Call out safety boundaries explicitly, especially external actions, destructive actions, data deletion, or local-only checks.
- Include reviewer guidance: files/areas to review first and why.
- Include verification as exact commands plus route checks, with honest caveats.
- Avoid hype, generic claims, and filler.
- Do not hide limitations. Known risk is useful context, not weakness.

## Required PR Shape

Use the template in `references/pr-body-template.md` unless the target repository has a stricter PR template.

Minimum sections:

- `## Why`
- `## What Changed`
- `## Implementation Notes`
- `## Data / Migration`
- `## Safety And Boundaries`
- `## Verification`
- `## Reviewer Guide`
- `## Known Limitations / Follow-Ups`

For small PRs, sections may be shorter, but do not collapse them into a vague summary. For large PRs, add bullets grouped by subsystem.

## Quality Bar

Before updating a PR, check:

- A reviewer can understand the business/product reason in under 30 seconds.
- A reviewer can identify the riskiest files quickly.
- Every verification claim corresponds to a command or route check that actually happened.
- Any skipped mutation or skipped browser check is explained.
- The title is specific enough to distinguish the PR in history.

If the current PR body is thin, replace it rather than appending a better section below weak content.
