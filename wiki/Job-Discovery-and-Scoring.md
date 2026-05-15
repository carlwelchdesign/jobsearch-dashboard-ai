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
- manual capture
- selected job boards where appropriate

The source configuration can store company slugs and adapter settings.

## Manual Job Capture

Jobs can be added manually through the app or through the Chrome extension. Captured jobs are normalized, deduped, saved, and then scored when possible.

## Duplicate and Stale Detection

The Duplicate/Stale Job Detector looks for:

- same company and title
- same source job ID
- same application URL
- stale or old job data
- duplicate groups

Duplicates and stale roles are down-ranked or grouped so the user does not waste review time.

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
