# Command Center and Jolene

## Command Center

The Command Center is the main operating page for the job search system. It replaces the old linear "step" flow with a live operating view.

It shows:

- latest search run state
- live search progress
- jobs found, deduped, filtered, and saved
- open blockers
- application packet review needs
- application pipeline counts
- daily plan actions
- links to high-priority work

## Live Search Updates

The search run command center reads the latest `JobSearchRun` and displays meaningful progress while a run is active.

Tracked run data includes:

- status: running, completed, failed, partial
- trigger: manual or cron
- started and finished timestamps
- profile IDs searched
- jobs fetched
- jobs after dedupe
- jobs after filters
- jobs saved
- progress entries
- errors

The goal is for the user to see what the search system is actually doing instead of only seeing a spinner.

## Daily Plan

The daily command center agent can produce a short action list from current jobs, applications, blockers, follow-ups, and profile health.

Examples:

- review high-fit jobs
- generate packets for approved jobs
- resolve open questions
- follow up on stale applications
- improve a noisy search profile

## Jolene

Jolene is the persistent assistant available on every screen from a floating "Ask Jolene" button.

Jolene is context-aware. The app passes the current route and relevant local data to Jolene so she can answer questions like:

- Why is this job being shown?
- What score or signal caused this recommendation?
- What should I do next on this page?
- What blocker is stopping this application?
- Which setting controls this behavior?
- How should future search parameters change?

## Jolene Persistence

Jolene stores conversations in:

- `JoleneConversation`
- `JoleneMessage`

Conversation history is scoped by user and page context, so a job-detail conversation can remain attached to that job while settings or dashboard conversations stay separate.

## Voice

Jolene supports browser-native voice features where supported:

- microphone dictation through Web Speech recognition
- spoken replies through browser speech synthesis

Voice is optional and controlled from Jolene's drawer.

## Route Contexts

Jolene currently builds specialized context for:

- dashboard
- jobs list
- job detail
- applications
- application detail
- Apply Sprint
- Needs Me
- Settings

For unknown routes, she falls back to general workflow help and navigation guidance.
