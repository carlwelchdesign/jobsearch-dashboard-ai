# Tighten Email Ops Signal Quality

## Summary

- Make Email Ops strict by default: only real job-response signals from Gmail Primary/Updates or targeted application queries should produce findings.
- Do not use a bigger model as the first fix. The current failures are mostly retrieval, gating, and policy bugs: broad Gmail scans plus "unknown means needs review" turns junk into work.
- Keep LLM/classifier use behind deterministic safeguards: if a message fails the job-mail gate, it becomes `UNRELATED` or `NO_ACTION`, not a review item.

## Key Changes

- Gmail sync:
  - Remove the broad `newer_than:Xd` query from normal Gmail Email Ops runs.
  - Query Gmail with `category:primary` and `category:updates` plus job-response terms.
  - Keep targeted per-application queries, but add exclusions for alerts/newsletters/promos where possible.
  - Track `scanned`, `ingested`, and `suppressed` so the dashboard can say "we skipped junk" without showing it as work.
- Email classifier:
  - Add a deterministic pre-classification gate before outcome classification.
  - Classify obvious consumer/promotional/newsletter mail as `UNRELATED`.
  - Classify generic job-alert/listing emails as `NO_ACTION` unless they reference an already-applied company/role and contain response language.
  - Only return `NEEDS_REVIEW` for messages that pass the job-mail gate but still cannot be safely classified.
- Application matching:
  - Raise the match threshold and require stronger evidence than common title words.
  - Do not match on generic role terms or job-alert subjects alone.
  - Require at least one strong company/domain signal or a thread continuation from an already-matched email before assigning an application label.
  - Preserve valid ATS matches from Greenhouse/Ashby/Lever/Workday-style senders when company or role evidence is present.
- Email Ops findings/calendar drafts:
  - Skip `UNRELATED`, `NO_ACTION`, and unmatched low-confidence `NEEDS_REVIEW` emails entirely.
  - Create findings only for confirmations, rejections, recruiter responses, interviews, assessments, offers, or high-confidence gated review cases.
  - Create calendar drafts only for matched, high-confidence interview/scheduling/assessment messages.
  - Add a one-time cleanup path for existing noisy recent records.
- Dashboard:
  - Replace guessing-oriented copy with precision-oriented status.
  - Add a suppressed count in the latest-run metrics if available.
  - Keep approval gates for offers, replies, stage changes, and calendar drafts.

## Test Plan

- Add classifier tests for exact noisy examples.
- Add positive tests for confirmations, rejections, interview/scheduling, and assessments.
- Add matcher tests for generic job alerts, valid ATS responses, and existing matched threads.
- Run targeted email/Jolene tests and broader verification.

## Assumptions

- Strict mode is the desired default.
- Gmail Primary and Updates are the main useful sources for this workflow.
- The goal is high precision: missing a rare ambiguous email is preferable to filling the review queue with junk.
- Existing noisy records should be cleaned up after the code change so the dashboard immediately becomes usable.
