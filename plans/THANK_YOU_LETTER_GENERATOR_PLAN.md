# Thank-You Letter Generator for Application Pages

## Summary

Add a structured thank-you draft generator to application detail pages like `/applications/cmp7ghpr2007uf5ibvtnxcco3`. It will support common interview stages, save each draft as its own record, and generate both a full email and a short LinkedIn message. Nothing is sent automatically, and generating a draft will not update interview outcomes or application status.

## Key Changes

- Add a dedicated `ThankYouDraft` Prisma model linked to `Application`, `JobPosting`, and `User`.
  - Store: stage, interviewer name/title/company, LinkedIn URL, interview date, user notes, tone, email subject, email body, LinkedIn body, evidence refs, quality review JSON, status `DRAFT`, timestamps.
  - Use a string stage field with allowed UI values: recruiter screen, hiring manager, technical, panel/onsite, final, informational, custom.
- Add `POST /api/applications/[id]/thank-you-drafts`.
  - Accept structured form input.
  - Load application, job, candidate profile, latest packet/research/prep context, and approved evidence.
  - Generate deterministic template-based drafts enriched with role/company/interview notes/evidence.
  - Return the saved draft JSON.
- Add a client form on the application detail page.
  - Fields: stage, interviewer name, interviewer title, LinkedIn URL, interview date, notes, tone.
  - Default date to today when opened.
  - Generate button posts to the API and refreshes the page.
- Add a "Thank-you drafts" section on the application detail page.
  - Show latest drafts with chips for stage/status/interviewer/date.
  - Render email subject/body and LinkedIn message in copyable text blocks.
  - Empty state explains that drafts are manual-send only.

## Generator Behavior

- For the Amplitude example, the form should support:
  - Stage: recruiter screen
  - Interviewer: Lavanya Shahani
  - Title: Principal Technical Recruiter / Talent Advisor
  - LinkedIn: `https://www.linkedin.com/in/lavanyashahani/`
  - Company: inferred from the application as Amplitude
  - Role: inferred as Senior Software Engineer, Product Adoption
- Email style:
  - Concise, specific, professional, no hype language.
  - Thank the interviewer for their time.
  - Reference the stage and one or two user-entered conversation notes when provided.
  - Include one relevant candidate-fit sentence using approved evidence when available.
  - Close with continued interest and availability for next steps.
- LinkedIn style:
  - Shorter than the email.
  - Usable when no email address is known.
  - No claim that the message was sent.

## Test Plan

- Unit tests for the generator:
  - Recruiter-screen draft includes interviewer first name, company, role, and stage-appropriate language.
  - LinkedIn draft is shorter than the email and omits email-only formatting.
  - Quality review flags empty evidence, overlong messages, em dashes, and hype language.
  - Custom stage falls back cleanly.
- API route tests:
  - Creates a draft for a valid application.
  - Rejects missing interviewer name, invalid stage, and nonexistent application ID.
  - Does not create an `ApplicationOutcome`, change `Application.status`, or send anything externally.
- Page/UI test coverage:
  - Application page renders the form and existing saved drafts.
  - Generated drafts appear after refresh with email and LinkedIn text.

## Assumptions

- The missing `node_modules/next/dist/docs/` guide noted by `AGENTS.md` is unavailable in this install, so implementation should follow the existing Next 13 app-router patterns already used in this repo.
- v1 will not scrape LinkedIn or send email/LinkedIn messages.
- v1 will not create or update `Contact` records automatically; it stores interviewer details on the draft snapshot only.
- The existing local app data for `cmp7ghpr2007uf5ibvtnxcco3` is in the local Postgres on `5432`, while Docker Postgres on `5433` does not currently contain that record.
