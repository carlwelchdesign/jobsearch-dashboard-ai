# Agents and Workflows

The app implements agents as deterministic services with typed inputs and outputs. Agents do not randomly talk to each other. Workflows orchestrate agents in a controlled order and persist `AgentRun` records for observability.

## Agent Run Observability

`AgentRun` stores:

- agent type
- input JSON
- output JSON
- status
- error
- timestamps
- user association when available

The Agent Board shows recent runs, recommendations, warnings, and review needs.

## Implemented Agent Areas

- Candidate Intelligence
- Search Profile Manager
- Job Fit Scorer
- Resume Strategy
- Cover Letter Writer
- Application QA
- Anti-Generic Writing
- Duplicate/Stale Job Detector
- Outcome Learning
- Daily Command Center
- Recruiter Intelligence
- Portfolio Match
- GitHub Portfolio Review
- Interview Prep
- Company Research
- Compensation Opportunity
- Networking Strategy
- Search Expansion

## Candidate Ingestion Workflow

1. User uploads a resume or adds a project/career note.
2. Candidate Intelligence extracts structured evidence.
3. Evidence is labeled as verified, inferred, needs review, or rejected.
4. User reviews uncertain items.
5. Approved evidence becomes available for scoring and generated materials.

## Search Profile Optimization Workflow

1. Search profiles define target roles, industries, locations, compensation, keywords, and exclusions.
2. Search Profile Manager reviews profile definitions and performance.
3. It identifies overlap, broadness, narrowness, stale profiles, and noisy searches.
4. Suggested edits are shown for user approval.
5. Destructive actions are not applied automatically.

## Job Discovery and Scoring Workflow

1. Search runs collect jobs from enabled sources.
2. Duplicate/Stale Job Detector groups likely duplicates and flags stale jobs.
3. Job Fit Scorer scores the job against a search profile and approved evidence.
4. Jobs appear in the review queue with scores, strengths, risks, and missing keywords.
5. User approves, rejects, saves, or archives.

## Application Packet Workflow

1. User approves a job.
2. The app creates or updates an application tracker.
3. Resume Strategy chooses the positioning and evidence emphasis.
4. RAG retrieves approved candidate evidence.
5. Materials are generated as a draft application packet.
6. Application QA checks unsupported claims, style violations, and weak evidence.
7. User reviews and approves before submission or outreach.

## Outcome Learning Workflow

1. User records outcomes or email sync detects them.
2. Outcome Learning reviews patterns across profiles, sources, industries, and materials.
3. It distinguishes low sample size from meaningful trends.
4. The app surfaces actionable strategy changes.

## Hands-Off Principle

The goal is to reduce physical work for the user without removing judgment. Agents can research, draft, score, prepare, and ask for help when blocked. They should not invent information or silently take high-impact external actions.
