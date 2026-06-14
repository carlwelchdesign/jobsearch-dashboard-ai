# Jolene Email Operations Agent Team

## Summary
Upgrade the weak email sync into a mostly autonomous Jolene Email Operations workflow. A specialist team scans recent job-search email, classifies updates, matches them to applications, records high-confidence outcomes, drafts calendar actions, and reports an executive summary back to Jolene, Chief of Staff. Jolene remains the main surface on `/dashboard`, with drill-down into Email Ops when details or approvals are needed.

## Key Changes
- Add an email agent team under Jolene:
  - `Email Inbox Scout`: scans Gmail/IMAP/Outlook-capable sources using broad recent-job-response queries plus application watchlists.
  - `Application Matcher`: links emails to applications/jobs using threads, sender domains, ATS domains, company/title aliases, and prior email history.
  - `Outcome Classifier`: identifies rejections, confirmations, interview invites, scheduling requests, assessments, offers, recruiter follow-ups, and ambiguous messages.
  - `Scheduling Coordinator`: extracts proposed times, deadlines, scheduling links, interview type, contacts, and prep needs.
  - `Action Drafter`: prepares response/thank-you/availability drafts when useful, but does not send externally.
  - `Privacy & Confidence Reviewer`: blocks low-confidence or sensitive updates from automatic mutation.
  - `Email Ops Reporter`: writes the summary, risks, and recommended actions back into Jolene's Chief of Staff brief.
- Add durable Email Ops state:
  - New agent types for the email team plus a parent `JOLENE_EMAIL_OPERATIONS` run.
  - Child agent runs report through `parentRunId`; if triggered by Jolene, the Email Ops run is linked back to the Jolene Chief run.
  - Store extracted email intelligence separately from raw email records: classification, confidence, matched application/job, extracted next steps, evidence snippets, suggested mutations, action status, and review reasons.
  - Add calendar proposal records for interview invites, deadlines, assessments, and scheduling holds.
- Make automation mostly autonomous:
  - Auto-apply high-confidence low-risk updates: clear rejections, application confirmations, obvious stage changes, and duplicate-safe application events.
  - Create Jolene approval cards for ambiguous matches, offers, external replies, final calendar writes, employer/recruiter contact, and anything below confidence threshold.
  - Preserve raw email provenance so every app update can be traced to message id, provider, subject, sender, and received time.
- Add calendar workflow:
  - V1 creates in-app calendar drafts first, not direct external writes.
  - Calendar drafts include title, company, role, proposed time, timezone, location/link, attendees if available, deadline, source email, confidence, and approval state.
  - Future Google/Outlook Calendar write support can approve drafts into real calendar events once calendar OAuth is added.
- Update Jolene surfaces:
  - `/dashboard` shows a quiet "Email Operations" section inside Jolene's Chief of Staff card: new outcomes, interview/scheduling items, blockers, calendar drafts, and last scan freshness.
  - Add an Email Ops drill-down route or dashboard panel showing recent scans, agent findings, auto-applied updates, skipped/blocked items, and approval cards.
  - Jolene chat can answer "what changed in my inbox?" from Email Ops findings instead of forcing the user to babysit sync output.
- Add APIs:
  - `POST /api/jolene/email-ops/run`: start an Email Ops run.
  - `GET /api/jolene/email-ops`: latest summary, findings, scan freshness, and pending approvals.
  - `POST /api/jolene/email-ops/findings/:id/approve`: approve a blocked mutation or calendar draft.
  - `POST /api/jolene/email-ops/findings/:id/dismiss`: dismiss false positives.
  - Keep existing email message ingestion routes, but route new scans through the Email Ops service.

## Test Plan
- Unit tests:
  - Email team creates parent/child agent runs and links back to Jolene when triggered by Chief of Staff.
  - Classifier detects rejection, confirmation, interview invite, scheduling request, assessment, offer, recruiter follow-up, and ambiguous mail.
  - Matcher uses thread history, sender/company/title evidence, and avoids unsafe matches.
  - High-confidence outcomes auto-update applications while preserving provenance.
  - Calendar proposals are drafted, not written externally.
  - Low-confidence, offer, reply/send, and external calendar actions require approval.
- Route tests:
  - Run Email Ops.
  - Fetch latest Email Ops summary.
  - Approve a suggested application update.
  - Approve/dismiss a calendar proposal.
  - Reject unsafe or stale approval attempts.
- UI tests:
  - Jolene dashboard brief includes Email Ops summary, freshness, evidence, and approval-needed actions.
  - Email Ops drill-down shows findings, confidence, source email metadata, auto-applied updates, and calendar drafts.
  - Empty, no-provider, disconnected-provider, and error states are readable.
- Verification:
  - Read relevant Next.js docs under `node_modules/next/dist/docs/` before implementation when present.
  - Run Prisma migration/generate.
  - Run targeted Vitest tests for email, Jolene, routes, and UI source tests.
  - Run `npx tsc --noEmit --pretty false`, `npx react-doctor@latest --verbose --diff`, and `npm run build`.
  - Restart dev and smoke-check `/dashboard`, Email Ops route/panel, `/agents`, and Jolene APIs.

## Assumptions
- Default automation is mostly autonomous for high-confidence internal updates.
- Calendar v1 drafts events for approval before external calendar writes.
- Jolene dashboard brief is the primary surface; Email Ops detail view is secondary.
- No emails are sent, employers contacted, LinkedIn posts published, or external calendars mutated without explicit approval.
- Gmail and IMAP stay supported; Outlook sync can be strengthened if Graph mail support is incomplete.
