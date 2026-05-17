# Agency Command Center UI/UX Fix

## Summary

Redesign the Agency command center on `/applications` from a mixed-height button row into a clear control panel with one primary workflow, consistent secondary actions, and a cleaner activity/status area.

## Key Changes

- Replace the current single horizontal control row with a primary action panel layout.
- Make `Run recruiting agency` the dominant action, with activity/status details directly below it.
- Group secondary actions into a consistent grid: `Auto-prepare`, `Open sprint console`, `Launch next ready`, and `Sync packets`.
- Normalize button height, width, icon treatment, and action hierarchy across the section.
- Keep existing API calls, polling, background work, and route behavior unchanged.

## Test Plan

- Update `/applications` page tests to verify the command center and its expected controls still render.
- Run `npx vitest run src/app/applications/page.test.ts --reporter=dot`.
- Run `npx tsc --noEmit --pretty false`.
- Smoke `http://localhost:3000/applications` after implementation.

## Assumptions

- This is a UI/UX refinement only.
- Existing MUI components remain in use.
- No database, API, LangGraph, LangSmith, or agent workflow behavior changes are required.
