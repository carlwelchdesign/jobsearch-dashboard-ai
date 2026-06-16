# Daily Apply Cockpit Redesign Plan

## Summary
Refocus the app around one primary daily job-search workflow: find good jobs, make quick decisions, apply, and follow up. Replace the current command-center feel with a daily cockpit on `/dashboard`, and demote diagnostics, admin tooling, architecture views, and agent logs into secondary areas.

## Key Changes
- Rebuild `/dashboard` around four prioritized lanes: Find jobs, Decide, Apply today, and Follow up.
- Add a single today's goal strip with ready-to-apply count, review count, blockers, applied today, and latest search freshness.
- Rename primary nav around user work: Today, Find Jobs, Apply, Applications, Materials, Follow Up, Settings, and System.
- Move low-frequency diagnostics under System or secondary surfaces.
- Simplify Apply Sprint so the selected next application and user actions appear before funnel diagnostics and logs.
- Simplify Find Jobs so run status, jobs found/saved/ready, top exceptions, and profile optimization are primary, with event streams and internal diagnostics behind details panels.

## Test Plan
- Add/update page tests for daily workflow lanes, primary CTAs, Apply Sprint hierarchy, and nav labels.
- Run targeted Vitest tests, TypeScript, React Doctor, build, smoke pages, and visual checks for `/dashboard`, `/dashboard/search`, `/applications/assistant`, `/jobs`, and `/applications`.

## Assumptions
- Optimize for an individual daily job seeker.
- Preserve human-in-the-loop application submission.
- Reorganize current surfaces before adding backend workflows.
