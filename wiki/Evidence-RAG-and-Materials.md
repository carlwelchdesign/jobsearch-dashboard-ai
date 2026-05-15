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
