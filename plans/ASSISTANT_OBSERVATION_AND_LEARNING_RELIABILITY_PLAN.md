# Assistant Observation And Learning Reliability Plan

## Summary

Fix the application assistant so it treats the Playwright browser as an active observation session, not just a one-time autofill runner. While the browser is open, it should stream observed manual field answers to the app, detect submit intent, detect confirmation when available, and send a terminal close event. If the user clicks submit and closes the browser with no validation errors observed, the app will mark the application as applied.

## Key Changes

- Add browser lifecycle events from `scripts/playwright_assistant.py`: `manual_input_observed`, `submit_intent_detected`, `submit_confirmation`, `browser_closed_after_submit`, and `browser_closed_without_submit`.
- Update assistant workflow event handling so submit confirmation and submit-then-close mark the application applied, while close-without-submit becomes `NEEDS_USER` with blocker type `assistant_closed`.
- Make manual field learning visible by emitting workflow events after observed field memories are saved.
- Keep Apply Sprint state synchronized through terminal events instead of waiting for a later log sync.
- Preserve safety: do not auto-click submit, do not learn blocked sensitive fields, and do not mark applied when validation errors are visible.

## Test Plan

- Unit test assistant log classification for structured submit/close events.
- Unit test local assistant origin safety guard.
- Type-check the workflow event payload changes.
- Smoke test Apply Sprint and Dashboard after implementation.

## Assumptions

- Submit click followed by browser close, with no observed validation error, should count as applied.
- Submit confirmation remains stronger evidence when available.
- Ignored Needs Me alerts should not stop passive observation and learning while the browser remains open.
- Existing local-assistant-origin safety changes are preserved.
