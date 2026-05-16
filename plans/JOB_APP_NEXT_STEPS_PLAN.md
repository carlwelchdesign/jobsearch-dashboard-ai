# Job App Next Steps Plan

Last updated: 2026-05-15

## Product Direction

Move Job Search OS from a review-heavy dashboard toward a hands-off local-first agent system.

The desired operating model:

1. User approves intent and constraints.
2. Agents execute routine work.
3. Agents stop only for missing information, ambiguity, risk, CAPTCHA, auth, payment, or user-only decisions.
4. The app records every action and learns from outcomes.
5. The user can always inspect, override, pause, or take over.

This is still not a blind mass-apply bot. The system should prioritize better-fit roles, truthful materials, accurate records, and user control.

## Non-Negotiable Safety Rules

- Do not invent candidate claims.
- Do not send emails without explicit user permission or configured approval policy.
- Do not submit applications unless the user has enabled that behavior for the relevant workflow.
- Do not answer demographic, legal, sponsorship, disability, veteran, background-check, clearance, or compensation questions unless the answer is explicitly configured or approved.
- Do not bypass CAPTCHA, bot checks, paywalls, or authentication controls.
- Stop and ask the user when a required answer is unknown.
- Save resolved answers for future reuse only when the user approves or the answer is clearly non-sensitive.
- Log every agent action, page visited, field filled, question asked, user answer, submission attempt, and outcome update.

## Phase 1: Add Job Search OS As Candidate Evidence

Status: implemented.

Goal: Make the experience of building this app available to role scoring, resume strategy, cover letters, recruiter messages, and interview prep.

Why this matters:

The user prefers building agentic workflow tools, internal automation, AI product infrastructure, RAG/evidence systems, and hands-off operational software. The app itself is strong evidence for roles around AI tooling, agents, internal tools, developer platforms, productivity automation, recruiting tech, and workflow SaaS.

Implementation tasks:

- Add `Job Search OS` as approved candidate evidence.
- Add it as a profile project if not already present.
- Tag it with:
  - `ai-product`
  - `ai-agents`
  - `internal-tools`
  - `workflow-automation`
  - `rag`
  - `pgvector`
  - `postgres`
  - `redis`
  - `docker`
  - `nextjs`
  - `typescript`
  - `prisma`
  - `application-automation`
  - `job-search-os`
- Ensure job scoring can use this evidence.
- Ensure resume strategy can choose this project for AI tools, internal tools, developer platform, and agent workflow roles.

Suggested evidence content:

```txt
Built Job Search OS, a local-first AI-powered job search operating system that coordinates specialized agents for evidence ingestion, job scoring, search strategy, resume and cover letter generation, application packet QA, recruiter outreach, outcome learning, and Dockerized RAG retrieval with Postgres, pgvector, Redis, Prisma, Next.js, and TypeScript.
```

Acceptance criteria:

- Evidence appears in the Evidence Library as verified or approved inferred. Implemented.
- It is usable in resumes, cover letters, and recruiter messages. Implemented.
- Job fit scoring can reference it for agent/product/internal tool roles. Implemented through candidate evidence retrieval and tags.
- Application packet generation can include it only when relevant. Implemented through resume strategy and evidence retrieval.

## Phase 2: Workflow And UX Audit

Status: implemented, with continued polish expected as real usage reveals friction.

Goal: Reduce user effort across the whole app.

Current target:

The user should not need to figure out what to click next. Every page should make the next best action obvious.

Audit areas:

- `/dashboard`
- `/jobs`
- `/jobs/[id]`
- `/applications`
- `/applications/[id]`
- `/applications/assistant`
- `/evidence`
- `/profiles`
- `/resumes/generated`
- `/networking`
- `/outcomes`
- `/agents`
- `/settings`

Questions to answer for each page:

- What is the user trying to accomplish here?
- What is the highest-value next action?
- Is the primary action visually obvious?
- Are there too many choices?
- Are labels written in user intent language?
- Is the page explaining state clearly?
- Can an agent do this instead?
- If an agent cannot do it, why?
- What should happen automatically after the user approves something?

Implemented:

- Dashboard now has a top-level “Next Action” card that routes the user to the highest-priority step from agent blockers, the daily plan, ready applications, review queue, or search refresh.
- Application detail pages now show a staged progress card for review fit, packet generation, QA, approval, form fill, and outcome tracking, with one primary next action.
- Apply Sprint now surfaces the selected application's open blocker as the primary question and prevents assistant launch until it is resolved.
- Apply Sprint now shows queue-level workflow progress for each ready application: ready, launched/review, or blocked.
- Apply Sprint now uses one state-aware primary action for the selected item and moves launch-next/delete into secondary actions.
- Apply Sprint now persists visible assistant run state after navigation, including running, ready-to-submit, submitted, blocked, and failed states from `ApplicationAutomationRun`.
- Applications page now has a page-level next action card that routes users to Apply Sprint, packet preparation, application creation, or job review based on current queue state.
- Jobs page now has a page-level next action card that opens the top review match, prepares approved jobs, or runs discovery when the queue is empty.
- Search Profiles page now has a page-level next action card that recommends creating/enabling profiles, running optimizer, finding gaps, or moving to discovery.
- Evidence Library now has a page-level next action card that prioritizes uncertain evidence review, missing embeddings, or adding fresh career evidence.
- Outcome Analytics now has a page-level next action card that routes users to create applications, record outcomes, run learning, or review recommendations.
- Networking page now has a page-level next action card that prioritizes due follow-ups, draft review, strategy planning, or application-based outreach generation.
- Runs page now has a page-level next action card that surfaces running discovery, saved jobs ready for review, failed/partial runs, or the need to start discovery.
- Company Sources page now has a page-level next action card that recommends enabling sources, seeding sources, or running company-source discovery.
- Agent Review Board now has a page-level next action card that prioritizes evidence review, material QA, job recommendations, profile optimization, or the daily plan.
- Generated Materials page now has a page-level next action card that prioritizes QA review, missing cover letters, or moving clean materials into Applications.
- Needs Me page now has a page-level next action card that prioritizes the top blocker by type and age.
- Resume Workspace now has a page-level next action card that routes users through resume upload, parsed-data review, candidate profile, variants, generated materials, or jobs.

Likely improvements:

- Continue adding page-level primary actions to lower-traffic pages.
- Continue adding “agent is working” state to other background agent surfaces.
- Continue replacing scattered buttons with staged actions:
  - Review fit
  - Approve intent
  - Generate packet
  - Fill application
  - Submit or review
  - Track outcome
  - Prep interview

Acceptance criteria:

- A new user can understand the next step from the dashboard.
- Approved jobs automatically move into the next workflow stage.
- Blocked workflows show a clear reason and one primary resolution action.
- Background agent work remains visible after navigation.

## Phase 3: Email Response Agent

Status: foundation implemented.

Goal: Let the app monitor job-search email responses and update application state automatically.

Responsibilities:

- Check email for job-related messages.
- Classify messages:
  - rejection
  - recruiter response
  - interview request
  - coding assessment
  - take-home assignment
  - scheduling request
  - offer
  - automated confirmation
  - no-action notification
  - unrelated
- Match messages to existing jobs/applications by company, role, email domain, application URL, and thread history.
- Update `ApplicationOutcome`.
- Add `ApplicationEvent`.
- Create follow-up tasks.
- Notify the user when action is required.
- Preserve raw source references for audit/debugging.

Possible data model additions:

```ts
EmailMessageRecord {
  id: string;
  provider: "gmail" | "outlook" | "imap";
  providerMessageId: string;
  threadId?: string;
  from: string;
  to: string[];
  subject: string;
  receivedAt: Date;
  snippet: string;
  bodyText?: string;
  classification: string;
  confidenceScore: number;
  matchedApplicationId?: string;
  matchedJobPostingId?: string;
  actionRequired: boolean;
  rawMetadataJson: unknown;
}
```

Implemented:

- `EmailMessageRecord`, `EmailProvider`, and `EmailMessageClassification` schema/migration.
- Deterministic `classifyJobEmail` and `ingestJobEmail` service.
- Manual/connector-ready `/api/email/messages` GET/POST endpoint.
- IMAP connector endpoint at `/api/email/imap-sync` reads env-based mailbox credentials and ingests recent messages.
- Rejection emails can update matched application outcomes.
- Actionable or ambiguous emails create “Needs Me” requests.

Remaining:

- Add Gmail/Outlook OAuth providers if IMAP app-password setup is not enough.
- Continue improving company/domain heuristics as real email examples appear.

Agent output:

```ts
type EmailResponseAgentOutput = {
  classification: string;
  confidenceScore: number;
  matchedApplicationId?: string;
  recommendedOutcome?: string;
  actionRequired: boolean;
  userQuestion?: string;
  suggestedReply?: string;
  rationale: string;
};
```

Acceptance criteria:

- Rejections update application status without user effort.
- Interview requests create outcomes and prep tasks.
- Ambiguous emails are shown for review.
- User is notified only when a decision or answer is needed.
- No replies are sent automatically by default.

## Phase 4: Interview Intelligence Agent

Status: existing agent wired into email-triggered workflow.

Goal: When a company wants to move forward, prepare the user for that company’s process.

Trigger conditions:

- Email response classified as interview request.
- User records `RECRUITER_SCREEN`, `TECH_SCREEN`, `ONSITE`, or `FINAL`.
- Application status changes to interviewing.

Responsibilities:

- Research the company interview process.
- Identify likely interview stages.
- Identify likely coding tests, take-homes, system design topics, frontend exercises, product discussions, or behavioral loops.
- Prepare role-specific study plan.
- Generate project stories from approved evidence.
- Generate likely questions and concise answers.
- Prepare company-specific questions to ask interviewers.
- Track prep tasks.

Research sources:

- Company careers/interview pages.
- Candidate reports if available.
- Public engineering blogs.
- Job description requirements.
- Existing application packet.
- Candidate evidence.

Output:

```ts
type InterviewPrepPacket = {
  company: string;
  role: string;
  likelyStages: string[];
  likelyAssessments: string[];
  technicalFocusAreas: string[];
  behavioralThemes: string[];
  projectStories: Array<{
    theme: string;
    evidenceRefs: string[];
    talkingPoints: string[];
  }>;
  studyPlan: string[];
  interviewerQuestions: string[];
  risks: string[];
  confidenceScore: number;
  sources: string[];
};
```

Implemented:

- Existing `INTERVIEW_PREP` agent builds likely themes, risks, evidence stories, follow-up focus, and questions from approved evidence and the job.
- Application detail pages can generate and display interview prep.
- Email ingestion now triggers interview prep for matched interview, scheduling, coding assessment, and take-home messages.
- Interview prep generation now sends a notification when notification settings are configured.
- Interview prep generation now persists task rows for risks, evidence stories, themes, and questions, and application pages let the user mark tasks done.
- Recording recruiter screen, tech screen, onsite, or final outcomes now ensures interview prep and prep tasks exist.
- Interview prep now incorporates saved company research into likely stages, likely assessments, questions, risks, and source notes without inventing unsupported external claims.

Remaining:

- Add true live public web research for company interview processes if you want network-backed sources beyond saved company/job research.

Acceptance criteria:

- Prep is generated automatically when a company moves forward.
- Prep uses approved evidence.
- Unsupported claims are not introduced.
- User gets a short action list, not a giant research dump.

## Phase 5: Autonomous Application Execution Agent

Status: implemented as a conservative local assistant with gated submit controls.

Goal: After job approval, an agent should open the application, fill the entire application when possible, submit when allowed, and update records.

Recommended rollout:

### Phase 5A: Fill And Stop

- Open application URL.
- Fill known profile fields.
- Upload generated resume/cover letter.
- Answer known saved questions.
- Stop before submit.
- Save unknown questions to the application packet.

### Phase 5B: Ask And Learn

- When blocked, message the user with the exact question and context.
- User answers once.
- App saves the answer with sensitivity level and reuse rules.
- Agent resumes application.

### Phase 5C: Conditional Submit

Status: gated foundation implemented. Auto-submit remains off by default.

- Submit only if:
  - user enabled auto-submit for this workflow
  - all required answers are known
  - no sensitive unknowns remain
  - no CAPTCHA/bot/auth block exists
  - packet is approved
  - job is still approved
- Update `ApplicationOutcome` to `APPLIED`.
- Attach submission confirmation when available.

Implemented:

- `ApplicationAutomationSettings` stores the user-level auto-submit policy.
- Settings page exposes auto-submit and safety-gate controls.
- Applications can override global auto-submit behavior with inherit, allow, or block.
- `/api/applications/[id]/auto-submit-eligibility` explains whether an application may submit and why not.
- Assistant package now includes `autoSubmitAllowed`, `manualSubmitRequired`, and blocking reasons.
- Local Playwright assistant only attempts submit when app policy allows it and page-level checks pass.
- Assistant logs marked as submitted record an `APPLIED` outcome once.
- Gated submit captures confirmation screenshot/text paths and stores them on the automation run.
- Gated submit now requires detected confirmation text before recording a submitted run, and secondary review/confirmation steps are treated as manual checkpoints.

Remaining:

- Add per-company overrides if application-level controls are not enough.

### Phase 5D: Learn From Failures

Status: implemented.

Implemented:

- Automation runs record blocker type/message.
- ATS blocker analytics summarize recent runs by provider.
- Apply Sprint shows blocked, failed, ready, and submitted counts by ATS provider.
- `ApplicationFormPattern` stores reusable safe field patterns by user, host, ATS provider, category, label, input type, and selector.
- Playwright assistant logs stable selectors for detected fields.
- Assistant log ingestion persists safe selectors for known reusable fields and skips sensitive/custom unknown fields.

Possible data model additions:

```ts
ApplicationAutomationRun {
  id: string;
  applicationId: string;
  jobPostingId: string;
  status: "RUNNING" | "BLOCKED" | "NEEDS_USER" | "READY_TO_SUBMIT" | "SUBMITTED" | "FAILED";
  currentUrl?: string;
  blockerType?: string;
  blockerMessage?: string;
  actionsJson: unknown;
  screenshotsJson: unknown;
  startedAt: Date;
  finishedAt?: Date;
}

ApplicationAnswerMemory {
  id: string;
  questionCanonical: string;
  answer: string;
  sensitivity: "LOW" | "MEDIUM" | "HIGH";
  reusePolicy: "AUTO_USE" | "ASK_FIRST" | "NEVER_REUSE";
  sourceApplicationId?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

Acceptance criteria:

- Approved jobs can launch an application automation run.
- The agent fills known fields and uploads materials.
- Unknown required questions are captured and shown to the user.
- User answers can be saved for future reuse.
- Auto-submit is disabled by default.
- When enabled, auto-submit only happens inside configured safety rules.
- Records are updated after submission.

## Phase 6: Local Chrome Extension

Status: capture API and local extension foundation implemented.

Goal: Let the user save jobs discovered manually while browsing.

Extension actions:

- Save current job page to Job Search OS.
- Extract title, company, location, description, salary, and application URL.
- Detect ATS/provider when possible.
- Send data to local app API.
- Show whether the job already exists.
- Trigger scoring after save.

API endpoint:

```txt
POST /api/jobs/capture
```

Payload:

```ts
type BrowserJobCapturePayload = {
  sourceUrl: string;
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  salaryText?: string;
  applicationUrl?: string;
  atsProvider?: string;
  capturedHtml?: string;
};
```

Extension architecture:

- Manifest V3.
- Content script extracts page data.
- Popup confirms extracted fields.
- Background script posts to local app.
- Local app handles dedupe and scoring.

Acceptance criteria:

- User can save a job from any browser tab.
- Duplicate jobs are detected.
- Saved jobs appear in `/jobs`.
- Scoring runs or is queued after capture.

Implemented:

- Shared `captureManualJob` service used by manual paste and browser capture.
- `/api/jobs/capture` accepts page URL, selected text, parsed job fields, and metadata.
- Captured jobs reuse the existing dedupe, duplicate detection, search profile scoring, and job fit scoring pipeline.
- Optional `BROWSER_EXTENSION_TOKEN` protection is supported by the endpoint and extension popup.
- Extension content script includes Greenhouse, Lever, and Ashby page-specific extraction.
- Extension packaging is available with `npm run chrome-extension:package`.

## Phase 7: Notification And Messaging Loop

Status: foundation implemented with automatic blocker notifications.

Goal: Agents should message the user only when they need a decision, answer, or intervention.

Notification types:

- Application blocked.
- Unknown required answer.
- Interview request detected.
- Assessment received.
- Follow-up due.
- Application submitted.
- Auto-submit skipped due to risk.
- Email classification needs review.

Possible data model:

```ts
AgentUserRequest {
  id: string;
  agentRunId?: string;
  applicationId?: string;
  type: string;
  question: string;
  contextJson: unknown;
  status: "OPEN" | "ANSWERED" | "DISMISSED" | "RESOLVED";
  answer?: string;
  createdAt: Date;
  resolvedAt?: Date;
}
```

Acceptance criteria:

- User sees a central “Needs Me” queue. Implemented with `/needs-me` and dashboard surfacing.
- Agents can resume after user response. Foundation implemented with persisted request status and answer storage.
- Resolved answers can update answer memory when allowed. Foundation implemented with reusable answer memory.
- New “Needs Me” requests now send through the configured notification pipeline.
- Assistant blockers and auto-submit skips create a single open application-blocked request.
- Gated auto-submit success sends an application-submitted notification when notification settings exist.
- Settings now shows a single next setup action so missing AI, profile links, GitHub context, notifications, company sources, scheduled search, email sync, or automation gates are easier to find.
- Chrome capture now supports a configurable local app URL, returns a direct captured-job link, and shows profile-match feedback after saving.
- Application detail timelines now render readable event summaries for email classifications, assistant launches, status changes, and applied outcomes.
- Resolving a Needs Me blocker now adds a non-sensitive application timeline event showing the request type, question, status, and whether an answer was saved.
- Assistant automation run status changes now write application timeline events for blocked, ready-to-submit, submitted, and failed states without duplicating poll updates.
- Approving a job now automatically creates or updates an application tracker, so approved jobs move into the Applications workflow without a separate manual tracker step.
- Recording an applied outcome now schedules a default seven-day follow-up, ghosted outcomes become immediately due, and later recruiter/rejection/closed outcomes clear stale follow-up dates.
- Due application follow-ups can now be scanned through `/api/applications/follow-ups/scan`, creating one open Needs Me reminder per due application and using the configured notification pipeline.
- Needs Me now supports answering agent questions directly from the queue, with explicit opt-in to save unknown-answer responses as low-risk reusable answer memory.

## Suggested Implementation Order

1. Add Job Search OS as candidate evidence and project context.
2. Add workflow audit document with page-by-page improvements.
3. Add `AgentUserRequest` / “Needs Me” queue.
4. Add application answer memory. Implemented.
5. Upgrade local assistant from one-shot helper to resumable automation runs. Foundation implemented with `ApplicationAutomationRun` tracking.
6. Add email ingestion/classification. Foundation implemented with `EmailMessageRecord`, deterministic classification, and `/api/email/messages`.
7. Add interview intelligence trigger from outcomes/email. Email trigger implemented for matched actionable messages.
8. Add Chrome extension job capture API. Implemented with `/api/jobs/capture`.
9. Build local Chrome extension. Foundation implemented in `chrome-extension/`.
10. Add carefully gated conditional auto-submit. Foundation implemented with user-level policy, eligibility API, assistant package gates, and conservative local submit behavior.

## Open Decisions

- Email provider decision: IMAP foundation is implemented first. Gmail/Outlook OAuth connection foundation is implemented with start/callback routes and read-only mailbox scopes. Message sync through Gmail/Graph APIs is the next OAuth step.
- Auto-submit control decision: global default plus per-application override is implemented. Company-level overrides are implemented in policy evaluation and Settings.
- Notification channel decision: Settings supports email and Pushover. The active primary channel is whatever the user configures locally.
- Sensitive answer memory: current implementation requires explicit opt-in from Needs Me and stores opt-in queue answers as LOW/ASK_FIRST. Encryption is not planned.
- Browser automation decision: Playwright remains the filling/submission engine. The Chrome extension is capture-only and should only add applications to the system for agent/user review.

## Local Operations

Run follow-up reminder scan locally:

```bash
curl -X POST http://localhost:3000/api/applications/follow-ups/scan \
  -H "content-type: application/json" \
  -d '{"limit":50}'
```

If `FOLLOW_UP_SCAN_SECRET` is configured, include:

```bash
-H "authorization: Bearer $FOLLOW_UP_SCAN_SECRET"
```

## Completion Definition

This next stage is complete when:

- The app’s own development is part of candidate evidence. Complete.
- The dashboard tells the user what needs attention. Complete.
- Approved jobs can progress through packet generation and application filling with minimal user work. Complete.
- Unknown answers create user questions and reusable answer memory. Complete with explicit opt-in memory saving.
- Email responses update application records. Complete for IMAP/manual ingestion.
- Interview requests trigger company-specific prep. Complete for matched email/outcome triggers.
- Manually found jobs can be captured through a local Chrome extension. Complete.
- No applications are submitted unless the user has explicitly enabled that behavior. Complete.
