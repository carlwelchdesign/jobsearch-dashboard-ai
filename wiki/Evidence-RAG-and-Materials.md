# Evidence, RAG, and Materials

## Candidate Evidence

Candidate evidence is the durable truth layer for the system. It prevents generated materials from becoming generic or unsupported.

Evidence includes:

- experience
- projects
- achievements
- skills
- metrics
- education
- certifications
- preferences
- writing style

Each item stores:

- title
- content
- source type
- source reference
- confidence
- tags
- usage flags for resume, cover letter, and recruiter messages

## Confidence Levels

- `VERIFIED`: supported by resume upload, approved project data, or direct user confirmation.
- `INFERRED`: plausible and useful, but should be reviewed or explicitly approved depending on context.
- `NEEDS_REVIEW`: not safe to use silently in final materials.
- `REJECTED`: not usable.

Only verified and approved inferred evidence should be used in final generated materials by default.

## Job Search OS as Candidate Evidence

The app itself is stored as approved project evidence because the user wants more work like this.

Positioning includes:

- local-first AI-powered job search operating system
- specialized recruiting agents
- evidence ingestion and truthfulness controls
- explainable job scoring
- resume and cover letter generation
- application packet QA
- recruiter outreach
- outcome learning
- Dockerized RAG with Postgres, pgvector, Redis, and worker processes
- local MCP server exposing Job Search OS tools
- local browser assistant support

Tags include:

- `ai-product`
- `ai-agents`
- `internal-tools`
- `workflow-automation`
- `rag`
- `pgvector`
- `mcp`
- `model-context-protocol`
- `nextjs`
- `typescript`
- `react`
- `prisma`
- `developer-tools`

## RAG Layer

The evidence layer supports retrieval, not generic text stuffing.

Implemented pieces:

- evidence chunking
- embedding generation
- vector storage
- metadata and tags
- source references
- confidence filtering
- retrieval by job, profile, resume profile, query, tags, and exclusions

Primary retrieval service:

```ts
retrieveCandidateEvidence({
  jobId,
  searchProfileId,
  resumeProfileId,
  query,
  requiredTags,
  excludedEvidenceIds,
  confidenceMinimum,
});
```

## Generated Materials

Generated application packets can include:

- tailored resume content
- cover letter content
- application answers
- recruiter message
- hiring manager message
- company brief
- project links
- evidence references
- QA review JSON

Writing rules:

- concise
- credible
- grounded in evidence
- no fake metrics
- no unsupported claims
- no hype
- no em dashes
- no obvious AI phrasing
- no generic "excited to apply" openings

## Job Evidence Library

The `/resumes/profile` page is organized as a Job Evidence Library. The default view is an all-jobs career timeline where each job owns its resume bullets, application/product context, confirmed tech, version suggestions, source records, and duplicate cleanup actions. This keeps the resume generator's full-employment-history requirement visible while avoiding a flat list of repeated empty role forms.

Paste source text for a specific past role from inside that job row. The scoped digest proposes resume-ready bullets, backfills role context, and saves output as `needs_review` experience bullets. Existing verified bullets are not replaced or deleted, and generated resumes continue to use verified source data by default. Resume-upload bullets are linked to matching work-history rows when approved, and older unlinked bullets can be reviewed and confirmed from the page. Duplicate work-history rows are grouped immediately but only merged after explicit user review.

## Custom Recruiter Opportunities

The `/resumes/custom-opportunity` page handles recruiter outreach that arrives as a short brief instead of a saved job posting. It extracts editable opportunity details from the pasted text, saves the brief as a `Recruiter Opportunity` job source, ensures the role has a usable profile match, and generates a resume-only tailored material.

Custom opportunity resumes use the same truthfulness path as normal job resumes: approved candidate profile data, verified experience bullets, projects, GitHub context, resume strategy, ATS checks, and application QA notes. For MCP, integration, workflow automation, and AI tooling briefs, the generator also emphasizes verified Job Search OS stack terms in Summary and Skills, including MCP, agentic workflows, RAG, Next.js, React, TypeScript, Prisma/Postgres, pgvector, LangGraph, LangSmith-style observability, browser automation, email outcome tracking, and application state reconciliation when those terms are supported by approved evidence.

Requested but unsupported systems, such as Salesforce, Gong, ZoomInfo, Ironclad, Harvey AI, SimpleLegal, Logikcull, Airtable, or Snowflake, are not added as claimed skills unless approved evidence supports them. They are recorded as warnings/metadata so the user can decide whether to edit the resume manually.

After generation, the custom opportunity page lets the user edit and save the resume content. Saved edits update the generated resume record, refresh ATS checks, and keep the standard text and PDF export URLs pointed at the edited version. Generated resumes also appear in Generated Materials.

The workflow intentionally does not create an application tracker, cover letter, or packet. If the opportunity becomes an active application, open the saved job and use the normal package workflow.

## Resume Profiles

Resume profiles are controlled variants, not random one-off resumes.

Current positioning tracks include:

- AI Product and Agents
- Full-Stack SaaS
- Defense or Mission Software UI
- Staff Frontend
- Internal Tools
- Design Systems
- Security/Identity/Auth

Resume profiles define target roles, positioning summaries, evidence tags, priority projects, and default sections.
