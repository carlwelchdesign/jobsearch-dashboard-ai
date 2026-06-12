# LinkedIn-Safe Profile Connection And Job Lead Enrichment

## Summary
Add LinkedIn capabilities that are realistically available without scraping or partner-only job access: Sign in with LinkedIn OIDC for identity/profile basics, plus stronger handling for user-supplied LinkedIn job leads so the app can find original employer/ATS postings and feed them into the existing search/apply pipeline.

## Key Changes
- Add optional LinkedIn OIDC connection with `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and optional `LINKEDIN_OIDC_REDIRECT_URI`.
- Add `/api/auth/linkedin/start` and `/api/auth/linkedin/callback`.
- Request only `openid profile email`, call LinkedIn userinfo, validate state, and store durable metadata without long-lived LinkedIn tokens.
- Add nullable LinkedIn metadata fields to `UserProfile`.
- Update Settings with Connect LinkedIn status and clear copy that this does not grant LinkedIn job-search access.
- Treat `linkedin.com/jobs/view/...` URLs as LinkedIn leads, not scrape targets.
- Capture rich LinkedIn leads through the normal manual capture, scoring, and approval behavior.
- Save bare LinkedIn job URLs as review-only leads with guidance to paste selected job text or provide the original employer/ATS link.
- Generate original-posting open-web queries from captured company/title/location, excluding LinkedIn pages, and merge them into Search Query Backlog without removing user custom queries.
- Keep Apply with LinkedIn, Apply Connect, and LinkedIn Job Posting APIs documented as blocked or partner-only for this app.

## Verification
- LinkedIn OIDC route/helper tests.
- LinkedIn lead capture and query-generation tests.
- TypeScript, diff whitespace checks, and production build.
