# Application Assistant Field-Learning Plan

## Summary

Add learning to the local Playwright application assistant so it can observe fields the user fills manually, save reusable field knowledge, and auto-fill safe learned fields in future applications. The system will auto-save safe non-sensitive learnings, auto-fill only low-sensitivity high-confidence answers, and keep sensitive/custom/high-risk answers approval-gated.

## Key Changes

- Extend application form learning beyond current selector/category patterns:
  - Capture manual field values from the Playwright browser during the review window.
  - Compare field snapshots before assistant fill, after assistant fill, and after user edits.
  - Treat fields changed by the user as candidate learnings.
- Add a durable `ApplicationFieldMemory` model or equivalent service-backed table for learned field behavior:
  - Store user, ATS provider, host, field key, label, selector, input type, normalized category, observed answer, sensitivity, reuse policy, source application, confidence, success/failure counts, and last used time.
  - Link to `ApplicationFormPattern` where possible.
- Keep using `ApplicationAnswerMemory` for question-style memories, but add a service that can convert observed manual text/select/radio answers into answer memory when the field is a recurring application question.
- Add a new API endpoint for the Playwright assistant to submit observed manual field learnings after each run.
  - The endpoint classifies sensitivity and either auto-saves or marks the learning as review-needed.
  - Auto-save only non-sensitive fields.
  - Sensitive fields include demographic, disability, veteran, race, gender, age, birthdate, SSN, salary/compensation, visa/sponsorship, legal attestations, and anything matching existing sensitive patterns unless explicitly classified as safe.
- Update the assistant package returned by `/api/applications/[id]/assistant-package` to include active learned field memories for the current user, ATS provider, host, and similar labels.
- Update `scripts/playwright_assistant.py`:
  - Load learned field memories from the assistant package.
  - Fill high-confidence low-sensitivity memories automatically.
  - During the open browser review loop, observe user-edited fields and send learned candidates back to the app.
  - Never capture password, hidden, file, CAPTCHA, token, SSN, or payment fields.
  - Mask or skip values from sensitive categories unless the app requires review.
- Add a Settings or Apply Sprint learning audit section:
  - Show auto-saved safe field memories.
  - Show review-needed sensitive/custom field memories.
  - Allow disabling a memory with `NEVER_REUSE`.
  - Show last used, success count, failure count, and source application.

## Behavior Rules

- Auto-save safe fields:
  - Profile-like fields, URLs, phone/country selectors, work location, referral source, availability, and other non-sensitive recurring fields.
- Auto-fill safe only:
  - Fill learned memories automatically only when sensitivity is `LOW`, reuse policy is `AUTO_USE`, host/ATS or label match is strong, and confidence is high.
  - Otherwise show the learned answer as a suggestion or leave it for review.
- Approval-gate high-risk fields:
  - Salary, sponsorship, work authorization, legal attestations, demographic fields, disability, veteran status, race, gender, and open-ended custom questions default to `ASK_FIRST` or review-needed.
  - Existing explicit profile demographic settings remain the only source for automatic demographic fills.
- Manual observation:
  - A field counts as user-filled only if it was empty or different after assistant fill, then changed during the manual review window.
  - Do not learn from values the assistant filled itself unless the user edits or confirms them.
- Safety:
  - Do not submit applications because of learned fields.
  - Do not bypass CAPTCHA or login.
  - Do not store passwords, auth tokens, payment values, hidden fields, or file input values.

## Test Plan

- Unit test field sensitivity classification for safe, custom, salary, sponsorship, demographic, password, hidden, and legal-attestation fields.
- Unit test manual-observation diffing: before snapshot, assistant-filled snapshot, user-edited snapshot, and learned candidates.
- Unit test learned-memory matching by host, ATS provider, selector, label similarity, category, and confidence.
- Unit test assistant package includes only active memories safe for the current application context.
- Unit test API persistence:
  - safe observed fields auto-save with `AUTO_USE`;
  - sensitive/custom observed fields save as review-needed or `ASK_FIRST`;
  - blocked fields are ignored.
- Update existing automation-run tests to verify manual observations are attached to run logs/events.
- Run `npm test` and `npm run build`.

## Assumptions

- "All" field learning means all observable non-blocked fields, with sensitive categories approval-gated rather than silently auto-saved.
- The browser assistant remains local-only and Playwright-based.
- Learned answers are local database records, not model fine-tuning.
- The first implementation should prioritize reliable local observation and reuse over complex ML matching.
- Final employer submission remains manual or governed by the existing auto-submit policy; field learning does not expand submission authority.
