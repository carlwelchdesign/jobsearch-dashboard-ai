# Job Discovery and Scoring

## Search Profiles

Search profiles are reusable job-search strategies. They define:

- target titles
- included and excluded keywords
- industries
- locations
- remote preference
- compensation floor
- seniority
- schedule settings
- minimum score threshold
- profile health and notes

Profiles can be active, paused, or archived.

## Company Source List

The company source list is a target source list, not a claim that each company is currently hiring.

Companies can be added from `/sources` with a simple form: company name, priority, categories, and optional Greenhouse, Lever, or Ashby slugs. If slugs are omitted, the app generates common compact and dashed ATS slug variants. Search terms and the careers query are generated from the selected categories.

The app prioritizes companies and roles around:

- React
- TypeScript
- Next.js
- full-stack product engineering
- design systems
- security and identity
- AI tooling
- developer platforms
- internal tools
- data-rich UIs
- defense tech
- geospatial
- visualization
- SaaS admin consoles
- enterprise dashboards

## Source Adapters

The app supports job ingestion from:

- company sites
- Greenhouse
- Lever
- Ashby
- Brave Search-backed search queries
- JobFront-powered niche boards
- Eightfold-powered company career pages such as Netflix Careers
- manual capture
- selected job boards where appropriate

The source configuration can store company slugs and adapter settings.

The `/sources` roadmap labels are operational metadata, not all runtime toggles. `Implemented` entries have working adapters, search-query coverage, or manual workflows; `enabled` database sources are included in search runs; `planned` entries are future connector candidates; `manual` entries require human/account handling; and `P1` indicates priority-one coverage regardless of implementation status.

The Search Query Backlog stores targeted open-web searches such as ATS-specific React/TypeScript remote queries. It now covers the prior planned roadmap sources, including Workday, SmartRecruiters, iCIMS, Jobvite, BambooHR, Workable, Recruitee, Teamtailor, Personio, Remote.co, NoDesk, Himalayas, Working Nomads, Wellfound, YC, Built In, Levels.fyi, TrueUp, Dice, Hacker News, VC portfolio boards, and USAJOBS. It runs through Brave Search only when `BRAVE_SEARCH_API_KEY` is configured and the `Search Query Backlog` source is enabled; otherwise it remains visible as provider-missing. Remotive is excluded because current listings are paywall-gated.

Search-query results are conservatively screened for list/search pages before they enter scoring. Known expandable pages, such as Built In job lists, are parsed into individual job postings. Strong listing signals, such as filtered job-board URLs with `page`, `sort`, `jobTitle`, or similar query parameters, are never saved as ordinary jobs when they cannot be expanded; they are recorded in search-run progress for review.

JobFront board sources can be added from `/sources` with a board URL such as `https://jobs.frontdoordefense.com/`. The connector uses the board's public job-card endpoint and treats the result as a lower-friction niche-board source, not as a final employer ATS source.

Eightfold career sources read the public jobs endpoint when a domain is configured, with embedded `smartApplyData` as a fallback. Netflix Careers is seeded as an enabled source at `https://explore.jobs.netflix.net/careers`, so search runs can ingest its public postings without relying on Brave Search.

## Manual Job Capture

Jobs can be added manually through the app or through the Chrome extension. Captured jobs are normalized, deduped, saved, and then scored when possible.

Chrome capture also learns from selection intent. When a captured job produces zero matching profiles, the system creates an enabled captured-intent profile and scores the captured job against it immediately. The first generated lane is `AI-Native Enterprise Product Frontend`, combining the preferred career direction of AI-native product/frontend work with broader senior frontend/product engineering defaults for urgent search coverage.

After a Chrome save, the extension stores the last saved job id locally and exposes **Apply Now**. The user can navigate to a different ATS/application page, reopen the extension, and launch from the current tab URL. The app updates the saved job application URL before preparing materials, so job-description pages and final application forms can be different URLs.

## Market Intelligence

The Profiles page includes a weekly market intelligence brief. The `MARKET_INTELLIGENCE` agent compares recent matched jobs, profile health, application outcomes, skill mentions, and company patterns against curated external labor-market sources.

The research layer fetches trusted source/index pages, discovers recent relevant articles, extracts readable text, and stores only metadata, claims, summaries, short excerpts, implications, and synthesis in the `AgentRun` output. When OpenAI is configured, it produces a structured cross-source synthesis; otherwise it falls back to deterministic synthesis from the same article summaries and local pipeline data.

The report is advisory. It shows lane demand, skill-signal charts, research synthesis, cited article cards, data freshness, confidence, and review-only actions for profile tuning, positioning, company targeting, and outreach. It does not automatically create, edit, pause, or delete search profiles.

## Duplicate and Stale Detection

The Duplicate/Stale Job Detector looks for:

- same company and title
- same source job ID
- same application URL
- stale or old job data
- duplicate groups

Duplicates and stale roles are down-ranked or grouped so the user does not waste review time.

Active job queues also use strict suppression. Jobs that are already applied, rejected, archived, or represented by a ready-to-apply application are blocked from active search results, recruiting-agency promotion, bulk packet preparation, manual capture scoring, and Apply Sprint. The suppression gate matches canonical company/title/location keys, normalized ATS wrapper names, `Title @ Company` captures, duplicate-group siblings, and application URL variants across Greenhouse, Lever, Ashby, and company-site sources. Historical records remain available in rejected, archived, and all views for audit or manual recovery.

The Jobs page **Check duplicates** action is also a cleanup action. It first refreshes duplicate groups and stale scores, then scans submitted/application history, rejected matches, archived matches, ready-to-apply matches, existing suppressions, duplicate groups, and canonical keys. Active duplicate matches are repaired by mirroring the strongest source state: submitted history takes precedence, then rejected, then archived, then ready-to-apply sibling cleanup. Ready-to-apply canonical records are preserved; only duplicate active siblings are archived.

## Scoring

The scoring model separates three ideas:

### Fit Score

How well the candidate matches the role.

Signals include:

- title fit
- required skills
- preferred skills
- seniority
- SaaS/frontend/full-stack fit
- industry relevance
- project relevance
- evidence strength

### Opportunity Score

Whether the role is worth time.

Signals include:

- compensation
- remote/location fit
- job freshness
- company/source quality
- strategic career value
- likely callback value
- duplicate/stale status

### Confidence Score

How confident the system is in the evaluation.

Signals include:

- completeness of the job description
- amount and quality of candidate evidence
- salary/location clarity
- ambiguity in title or requirements
- source reliability

## Recommended Actions

Possible recommendations:

- `APPLY_NOW`
- `MAYBE_APPLY`
- `SAVE_FOR_LATER`
- `REJECT`
- `NEEDS_REVIEW`

Every score should include rationale, strengths, risks, missing keywords, and evidence references where applicable.
