# Job Rejection Learning Plan

## Summary
Change job rejection from a simple status update into a learning signal. Rejections should still happen immediately, but the UI will then ask an optional "Why?" using quick reason chips plus a free-text note. The saved reason will teach both job fit scoring and, where relevant, agency approval behavior.

## Key Changes
- Add a shared rejection-learning helper:
  - Accept `userId`, `jobPostingId`, `matchId`, `source`, optional reason codes, optional note.
  - Always create `SkillFeedback` for `job_fit_scorer`.
  - Also create `SkillFeedback` for `approve_agency_match` when the rejected match was agency/application-related, high-confidence, or previously approved.
  - Save reason codes and note in `contextJson`; create low-risk active `GUIDANCE` adjustments, not automatic scoring-weight rewrites.
- Update reject APIs:
  - Keep `/api/jobs/[id]/reject` fast and backward-compatible.
  - Allow optional `{ matchId, reasons, note, source }`.
  - Add a feedback-only endpoint for after-the-fact reasons so the UI can reject first, then submit learning when the user answers.
  - Extend bulk rejection so selected jobs can share a single optional rejection reason.
- Update UI behavior:
  - Replace raw reject `ActionButton`s with a reusable reject control on Jobs, Dashboard, swipe reject, and bulk reject.
  - On click/swipe: reject immediately, then show a compact optional reason prompt.
  - Reason chips: `Wrong seniority`, `Wrong tech stack`, `Compensation/location`, `Company/industry`, `Weak fit`, `Duplicate/stale`, `Low quality posting`, `Not interested`.
  - Include optional free-text note and a skip/dismiss path.
  - Apply Sprint reject should use the same reason prompt after removing the application and marking the match rejected.
- Preserve suppression behavior:
  - Rejected matches remain `rejected`, so they stay out of active search/review/agency queues.
  - Existing one-click flows still work if the user skips the reason prompt.

## Test Plan
- API tests:
  - Single reject still works without reasons.
  - Single reject with reasons creates job-fit feedback and, when applicable, agency feedback.
  - Feedback-only endpoint records reasons for an already rejected match.
  - Bulk reject updates statuses and records shared feedback for each selected match.
- UI tests where practical:
  - Reject button shows optional reason prompt after success.
  - Skip leaves job rejected without blocking.
  - Submitting chips/note records feedback and shows confirmation.
- Regression checks:
  - Existing rejected-job suppression tests still pass.
  - `npm run build` passes.

## Assumptions
- Rejection happens before asking why.
- Reasons are optional.
- Reason input uses chips plus optional note.
- Learning targets both job fit scoring and agency approval, but uses conservative guidance records rather than automatically changing scoring weights.
