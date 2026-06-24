---

name: development-agent
description: Use whenever the user asks Codex to implement, execute, or ship a plan in this repo, especially requests that include saving to /plans, creating a branch, editing code, updating docs/wiki, running verification, committing, pushing, opening or updating a PR, and restarting dev. Captures the repo's required release workflow, safety boundaries, verification discipline, and PR standards.
version: "1.2.0"
----------------

# Development Agent

Use this workflow for requests shaped like:

* “implement this plan”
* “PLEASE IMPLEMENT THIS PLAN”
* “save this to /plans, implement, update documentation, commit, push, create a PR, and restart dev”
* “have Codex build this”
* “turn this plan into a PR”
* “finish the implementation and verify it”

This skill is responsible for turning a plan into a safe, reviewable, verified repo change.

The goal is not to make the biggest possible change.
The goal is to ship the smallest complete vertical slice that satisfies the user’s plan without breaking repo conventions.

## Operating Principles

1. **Plan fidelity over invention**
   Implement the user’s actual plan. Do not silently replace it with a different architecture, broader rewrite, or unrelated cleanup.

2. **Repo safety over speed**
   Check state before editing, preserve unrelated work, and avoid destructive commands unless explicitly requested.

3. **Local patterns over novelty**
   Prefer existing Prisma, agent, ADK, LangGraph, Jolene, wiki, API, test, and UI patterns before introducing new architecture.

4. **Verification must be evidence-based**
   Do not claim success without naming the exact commands run and their results.

5. **Documentation changes with behavior**
   If behavior, workflow, API shape, agent behavior, route behavior, or developer operation changes, update the relevant docs in the same branch.

6. **Human-gated actions stay gated**
   Autonomous or external actions must remain behind confirmation, review, or approval flows. App-local repairs may use Jolene confirmation cards when supported.

## Required Workflow

### 1. Inspect repo state first

Run:

```bash
git status --short --branch
```

Before editing, identify:

* current branch
* whether the working tree is clean
* unrelated modified files
* untracked files
* pending user work

Do not overwrite, delete, stage, or “fix” unrelated user changes.

If unrelated changes exist:

* work around them when possible
* avoid touching those files unless required by the plan
* mention them in the final response

### 2. Read repo instructions

Read `AGENTS.md` before implementation.

Also inspect any referenced local guidance, including:

* README sections relevant to the feature
* wiki pages relevant to the subsystem
* existing architecture notes
* route/API entrypoints
* Prisma schema or migrations when data changes
* existing tests for the touched subsystem
* nearby components, hooks, services, agents, or utilities

If `AGENTS.md` references external Next.js docs that are unavailable, follow existing local patterns instead of guessing.

### 3. Save the plan before implementation

If the user provides or references a plan, save it under `plans/` before coding.

Use a clear uppercase filename.

Examples:

```text
plans/SLACK_COMMAND_CENTER_CONFIRMATION_FLOW.md
plans/JOLENE_DAILY_REVIEW_QUEUE.md
plans/LINKEDIN_CONTENT_QUALITY_GATE.md
```

The saved plan should preserve:

* the user’s intent
* implementation scope
* acceptance criteria
* safety constraints
* verification expectations
* known exclusions

Do not let the saved plan drift into a new product proposal.

### 4. Create a feature branch

Create a feature branch from the current base unless the user explicitly says not to.

Use a concise branch name.

Examples:

```bash
git switch -c feature/slack-command-center-confirmation
git switch -c fix/linkedin-content-quality-gate
git switch -c docs/jolene-agent-runbook
```

Do not switch branches if doing so would risk losing uncommitted user work.

### 5. Establish the implementation map

Before editing, identify:

* files likely to change
* tests likely to change
* docs likely to change
* routes/API surfaces affected
* data model or migration impact
* agent/tooling boundaries affected
* gated actions or safety checks required

Favor a small vertical slice over a broad horizontal rewrite.

A complete vertical slice usually includes:

* source change
* focused test coverage
* documentation update when behavior changes
* verification commands
* PR notes

### 6. Implement the smallest complete slice

Implement only what is needed to satisfy the plan.

Do:

* follow existing local naming and file conventions
* keep changes narrow and reviewable
* preserve deterministic fallbacks
* preserve existing public APIs unless the plan requires a change
* keep external actions gated
* prefer explicit types and clear boundaries
* add comments only when they clarify non-obvious behavior

Do not:

* rewrite unrelated architecture
* rename files casually
* introduce new libraries without a clear need
* change formatting across untouched files
* remove tests to make verification pass
* weaken safety gates
* bypass confirmation flows
* commit secrets or generated local state
* silently skip plan requirements

### 7. Add focused tests

Add or update tests for new behavior.

Prioritize:

* unit tests for deterministic utilities
* component tests for UI behavior
* route/API tests for server behavior
* agent/tool tests for prompt, routing, safety, and fallback behavior
* regression tests for fixed bugs
* edge cases from the plan

Tests should prove the behavior, not merely snapshot implementation details.

Preserve existing deterministic fallbacks.

### 8. Update documentation

Update README, wiki, docs, runbooks, or architecture notes when requested or when behavior changes.

Documentation should explain:

* what changed
* why it exists
* how to use it
* safety boundaries
* verification or operational notes
* known limitations

Keep docs factual. Do not turn docs into marketing copy.

### 9. Run verification

Run the most relevant verification commands.

Required baseline:

```bash
git diff --check
npx tsc --noEmit --pretty false
npm run build
```

Run targeted tests for touched areas:

```bash
npx vitest run <relevant-test-files> --config vitest.config.ts
```

Run broader tests when the change touches shared behavior:

```bash
npx vitest run --config vitest.config.ts
```

Run React Doctor when React code changed or feature completion warrants it:

```bash
npx react-doctor@latest --verbose --diff
```

If Prisma/schema changed, include the repo’s existing Prisma verification or migration checks.

If routes/API surfaces changed, manually verify the affected route/API where practical.

Do not claim a command passed if it was not run.

If a command fails:

* inspect the failure
* fix plan-related failures
* rerun the command
* if still failing because of pre-existing unrelated issues, document that clearly with the failing command and relevant error summary

### 10. Review the diff before staging

Inspect:

```bash
git diff
git status --short
```

Confirm:

* only intended files changed
* plan file is included
* docs are included when required
* tests are included when appropriate
* no secrets, local env files, logs, screenshots with private data, or generated junk are staged
* unrelated user changes are not staged

### 11. Commit safely

Stage only intended files.

Use a terse commit message.

Examples:

```bash
git commit -m "Add Slack confirmation gate"
git commit -m "Improve LinkedIn content quality checks"
git commit -m "Document Jolene review workflow"
```

If GPG signing times out, retry with:

```bash
git -c commit.gpgsign=false commit -m "<message>"
```

Mention the unsigned retry in the final response.

### 12. Push the feature branch

Push the branch:

```bash
git push -u origin <branch-name>
```

If push fails because of remote, auth, or branch issues, report the exact blocker.

Do not force push unless explicitly requested and safe.

### 13. Open or update the PR

Open or update a PR targeting `main`.

Use `staff-pr-writer` standards.

The PR body must include:

* product/architecture why
* subsystem changes
* implementation notes
* data or migration impact
* safety boundaries
* exact verification commands and results
* reviewer guide
* known limitations
* screenshots or route notes when UI changed

Replace thin PR bodies instead of appending to them.

Do not open a PR with a vague body such as:

> “Implemented plan.”

### 14. Restart dev and verify changed surfaces

Restart the local dev server when requested or when the change affects runtime behavior.

Verify changed routes, pages, or API surfaces.

Capture:

* route checked
* expected behavior
* result
* any remaining limitation

Do not say “dev restarted” unless it actually restarted successfully.

## Repo Rules

* Read `AGENTS.md` first.
* Follow existing local patterns when external docs are unavailable.
* Do not revert unrelated user changes.
* Do not stage unrelated files.
* Do not remove or weaken tests to pass verification.
* Do not introduce new architecture when local patterns are sufficient.
* Do not bypass confirmation gates for external or risky actions.
* Keep autonomous/external actions gated.
* App-local repairs may use Jolene confirmation cards when supported.
* Use existing Prisma, agent, ADK, LangGraph, Jolene, route, wiki, and test patterns before introducing new ones.
* If GPG signing times out, retry with `git -c commit.gpgsign=false commit ...` and mention it in the final response.

## Safety Boundaries

Never commit:

* `.env` files
* secrets
* API keys
* tokens
* private emails
* recruiter names
* private job URLs
* raw application data
* screenshots containing sensitive personal data
* local database files unless explicitly intended
* generated caches
* build output unless the repo requires it

Before PR creation, check for accidental private content in:

* plans
* docs
* screenshots
* fixtures
* seed data
* test snapshots
* logs

Job Search OS may contain sensitive job-search context. Public or semi-public artifacts must use aggregated, anonymized, or synthetic data unless the user explicitly asks otherwise.

## Failure Handling

If implementation cannot be completed fully, do not hide the failure.

Return:

* what was completed
* what could not be completed
* exact blocker
* files changed
* verification run
* verification failures
* safest next step

Do not claim:

* committed if no commit exists
* pushed if push failed
* PR opened if PR creation failed
* tests passed if they failed or were skipped
* dev restarted if it did not restart

## Publishable Final Response

At the end, report only useful facts.

Include:

* branch name
* plan path
* commit hash
* PR link
* changed areas
* verification commands and results
* dev restart result
* known limitations
* any unrelated working-tree changes left untouched

Example:

```text
Implemented and opened PR: <PR link>

Branch: feature/slack-command-center-confirmation
Plan: plans/SLACK_COMMAND_CENTER_CONFIRMATION_FLOW.md
Commit: abc1234

Changed:
- Added confirmation gate for Slack-triggered risky actions
- Updated Jolene routing tests
- Documented the workflow in the wiki

Verification:
- npx vitest run ... --config vitest.config.ts — passed
- npx tsc --noEmit --pretty false — passed
- npm run build — passed
- git diff --check — passed
- npx react-doctor@latest --verbose --diff — passed

Dev:
- Restarted successfully
- Verified /command-center and /api/slack/actions

Notes:
- Left unrelated local changes untouched: <files>
```

If something failed, be explicit:

```text
Implemented the code and tests, but PR creation failed because GitHub auth was unavailable.

Branch: feature/...
Commit: abc1234

Verification:
- Tests passed
- Typecheck passed
- Build failed because of a pre-existing error in <file>; not caused by this change

Next step:
- Re-run PR creation after GitHub auth is restored.
```

## Completion Criteria

The task is complete only when one of these is true:

### Fully complete

* plan saved
* branch created
* implementation done
* docs updated when required
* tests added or updated
* verification run
* commit created
* branch pushed
* PR opened or updated
* dev restarted and checked when required
* final response includes evidence

### Partially complete with blocker

* safe partial work is completed
* blocker is clearly identified
* no false success claims are made
* next step is obvious

## Editor Bias

Default bias:

* Smaller change is better than broader rewrite.
* Verified change is better than impressive change.
* Existing repo pattern is better than new architecture.
* Clear blocker is better than fake completion.
* Reviewable PR is better than clever implementation.
