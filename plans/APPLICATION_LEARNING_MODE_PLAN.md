# Application Learning Mode

## Summary
Replace the current `Needs Me` driven interruption flow with an application learning loop. The assistant should fill everything it safely knows, stay attached while the user manually completes unknown fields, capture what the user enters, learn reusable answers, and use those learned answers on future applications.

## Key Changes
- Add a first-class learning mode to the application assistant workflow.
- Use progressive field-memory promotion: low-risk fields auto-use immediately, repeated medium/custom answers can promote after consistent observations, and high-risk sensitive answers stay review-gated.
- Hide `Needs Me` from primary navigation and reserve the underlying request system for hard blockers.
- Update Apply Sprint UI to show learning/observing status, observed field counts, and blocker context.
- Keep final application submission manual.

## Public Interfaces
- Existing field-learning API remains the main write path.
- Assistant workflow state uses `observeManualInput` plus `observe` commands for learning mode.
- Existing blocker/request APIs remain available for compatibility.

## Test Plan
- Add workflow tests proving unknown required fields enter learning mode instead of creating ordinary `Needs Me` requests.
- Add field-learning tests for repeated-answer promotion and sensitive-answer review gates.
- Run targeted application tests, TypeScript, React Doctor, build, and `git diff --check`.

## Assumptions
- Use progressive learning.
- Hide `Needs Me` from primary navigation, but do not delete the page or APIs.
- Never auto-submit employer applications.
- Do not bypass bot protection or site security checks.
