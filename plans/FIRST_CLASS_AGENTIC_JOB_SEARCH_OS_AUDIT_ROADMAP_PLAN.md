# First-Class Agentic Job Search OS Audit And Roadmap

## Status

- Owner: Carl with Codex implementation support.
- Status: active; first foundation tranche implemented in this branch.
- Product posture: protected single-user production app.
- Target horizon: 4-8 weeks.
- Current release tranche: foundation hardening plus product-operating clarity.

## Current-State Review

Job Search OS is already a real operating system, not a prototype. The repo contains search profiles, job ingestion, Apply Sprint, application packets, Jolene Chief of Staff, Jolene Operating Loop, Email Operations, LinkedIn content and analytics, agent quality loops, LangGraph-backed agency workflows, ADK metadata, MCP tools, Prisma/Postgres persistence, Docker/Vercel support, and broad service/route tests.

The core gap is not missing agent surface area. The main risks are:

- Safety boundaries are inconsistent across Jolene chat, ADK operator actions, skill execution, cron routes, and external integrations.
- Production hardening is behind product ambition: cron secrets were optional, CI was not a full release gate, and protected single-user identity was implicit.
- The product experience is broad enough that users need a clear lifecycle operating loop instead of many powerful but scattered surfaces.
- Evidence, claim provenance, and agent evaluations are now moving into release-grade gates before generated materials and public content can be treated as first-class output.
- Plans are plentiful, but they need owner/status/risk/acceptance metadata to function as a managed roadmap.

## Product Wedge And ICP

The first-class wedge is: **a protected personal job-search operating system that turns career evidence, job discovery, application preparation, browser-assisted apply, follow-up, interview prep, and outcome learning into one governed loop.**

Primary ICP:

- A serious job seeker applying to high-value roles where quality and truth matter more than application volume.
- A technical or product-oriented candidate with enough evidence and project history that generic AI writing undersells them.
- A user who wants local control and manual final authority over submissions, outreach, calendar, and public posts.

Hard non-goals for the current horizon:

- No mass-apply bot.
- No LinkedIn scraping or treating LinkedIn job pages as apply targets.
- No autonomous application submission.
- No unapproved email sending, employer contact, external calendar writes, or unreviewed LinkedIn publishing.
- No premature SaaS rebuild before protected single-user production safety is solid.

## First-Class Agent Operating Model

Use the review-agent team as a standing governance model, but implement it through app-native primitives:

- Product and UX reviewers own wedge, onboarding, lifecycle clarity, and daily operating usefulness.
- Platform and data reviewers own identity, cron auth, durable background work, application state, audit, telemetry, and health.
- AI, trust, and red-team reviewers own action policy, skill contracts, evidence grounding, prompt injection, privacy leakage, and unsupported claims.
- QA, DevOps, docs, and TPM reviewers own CI, smoke, eval gates, health checks, release notes, risk register, and plan metadata.

Agent action taxonomy:

- `read_only`: reads local app state or documentation only.
- `proposal`: drafts review artifacts without changing local workflow state.
- `safe_internal`: app-local action allowed without external side effects.
- `guarded_mutation`: app-local mutation requiring explicit approval context.
- `external_blocked`: application submission, email sending, employer contact, calendar writes, and unreviewed publishing are not executable autonomously.

## Prioritized Roadmap

### P0 Foundation

- Enforce fail-closed cron and sync secrets in production-like environments.
- Add protected single-user identity helper and migrate side-effect routes to it.
- Add a blocking CI release gate: install, Prisma generate/validate, lint, tests, typecheck, build, migration/seed smoke, and page smoke.
- Add universal action-policy evaluation for skills and Jolene app-operator paths.
- Fix Apply Sprint candidate deep links.
- Keep LinkedIn lead URLs out of `applicationUrl` unless an original employer or ATS URL is available.
- Add `/api/system/health` for database, stale run, provider, worker, and secret readiness.

### P1 Product Coherence

- Add in-app lifecycle readiness on Command Center.
- Promote Jobs, Materials, Evidence, and Outcomes into primary navigation.
- Convert onboarding from documentation-only into a persisted setup/readiness checklist.
- Reconcile README and `docs/USER_GUIDE.md` with the current navigation and dashboard subroutes.
- Add value-proof metrics: duplicates suppressed, packets prepared, blockers resolved, answers reused, and outcomes learned.

### P1 Trust And Agent Control Plane

- Upgrade skill contracts with allowed tools, forbidden actions, approval requirements, side effects, and typed outputs.
- Add agent roster management: owner, tools, current status, child-run tree, blocked actions, SLA, and last eval score.
- Expand System Architecture into a governance auditor that flags route auth, policy gaps, side effects, eval coverage, and undocumented workflow ownership.
- Add claim-level provenance for resumes, cover letters, application answers, outreach, and public content.
- Reclassify hard-coded Job Search OS career evidence into proof-backed claims.

### P2 Data And Operations

- Create a canonical application transition service that updates application, match, packet, outcome, suppression, and audit state transactionally.
- Add domain audit/version log with actor, source, request id, idempotency key, before/after payload, and entity version.
- Normalize search telemetry into durable run event/source/profile/result rows; keep progress JSON as UI cache.
- Add durable background job leases for search, agency, email, analytics, market intelligence, and long-running agents.
- Encrypt OAuth tokens and define retention/deletion policy for raw email and sensitive career data.

## Risk Register

| Risk | Severity | Mitigation | Owner Area |
|---|---:|---|---|
| Cron/sync endpoints run without secrets in production | P0 | Shared bearer-secret helper fails closed in production-like environments | Platform |
| Jolene or skills mutate state without an enforceable policy | P0 | Shared action taxonomy and runtime policy checks | AI/Trust |
| Multiple local users make first-user routes unsafe | P0 | Protected single-user helper and route migration | Platform |
| LinkedIn leads become false application targets | P0 | Store LinkedIn URL as metadata; only non-LinkedIn employer/ATS URLs become `applicationUrl` | Product/Trust |
| Generated materials include unsupported claims | P1 | Claim-level provenance, approval blocking, and generated-material evals | AI/Trust |
| Product surfaces feel scattered | P1 | Lifecycle Command Center, onboarding checklist, navigation reconciliation | Product/UX |
| Plans do not operate like a roadmap | P2 | Plan metadata standard with status, owner, risk, acceptance criteria, release, and PR | TPM |

## Implementation Backlog

| ID | Priority | Title | Owner Area | Status | Acceptance Criteria |
|---|---:|---|---|---|---|
| REL-001 | P0 | Blocking CI release gate | DevOps | Implemented in branch | CI runs install, Prisma, lint, tests, typecheck, build, migration/seed, and smoke pages |
| SEC-001 | P0 | Fail-closed production secrets | Platform | Implemented in branch | Cron/sync endpoints reject missing secrets in production-like environments |
| TRUST-001 | P0 | Protected single-user route guard | Platform | Implemented in branch | Side-effect routes use one request-scoped single-user helper |
| AGENT-001 | P0 | Universal action policy gate | AI/Trust | Implemented in branch | Skills and Jolene operator paths classify and enforce action policy |
| JSOS-005 | P0 | Apply Sprint candidate deep link | Product | Implemented in branch | Candidate rows link to `/jobs/[id]` or a supported focused route |
| PLATFORM-009 | P0 | LinkedIn lead URL separation | Platform/Product | Implemented in branch | LinkedIn job URLs remain metadata unless an original employer/ATS apply URL is present |
| OBS-001 | P0 | System health endpoint | DevOps | Implemented in branch | `/api/system/health` reports DB, stale work, secrets, provider, and worker readiness |
| UX-001 | P1 | Lifecycle readiness Command Center | Product/UX | Implemented in branch | Overview shows setup-search-review-packet-apply-follow-up-interview-outcome states |
| EVID-001 | P1 | Claim-level provenance | AI/Trust | Implemented in Phase 2 branch | Unsupported claims block approval of generated materials and public content |
| AGENT-002 | P1 | Agent roster control plane | AI/Platform | Implemented in Phase 2 branch | `/agents` shows owner, tools, status, child runs, blocked actions, side effects, and latest eval score |
| QA-002 | P1 | Red-team trust fixtures | QA/Trust | Implemented in Phase 2 branch | Prompt injection, unsupported claims, private leakage, unauthorized external actions, LinkedIn misuse, and ungrounded public content have deterministic fixtures |
| PLATFORM-004 | P1 | Canonical application transition service | Platform | Planned | Status changes become transactional and audit-backed |
| QA-001 | P1 | Playwright critical-path suite | QA | Planned | Dashboard, search, Apply Sprint, LinkedIn drafts, and Jolene approval flow have browser coverage |
| TPM-001 | P2 | Plan metadata standard | TPM | Planned | New plans include owner, status, risk, acceptance criteria, target release, and linked PR |

## Acceptance Checks

- Existing manual-submit and approval-gated external action constraints remain intact.
- LinkedIn remains a lead and public-content channel, not a scrape/apply target.
- New side-effect guards are covered by focused tests.
- CI is additive and does not remove React Doctor.
- README and user guide mention the audit roadmap, health endpoint, protected single-user posture, and lifecycle readiness.
