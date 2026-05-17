# Job Search OS Wiki

Job Search OS is a local-first AI-powered job search operating system. It helps a candidate discover better-fit roles, score them against approved evidence, generate truthful application materials, run controlled application workflows, learn from outcomes, and keep the user in control of final decisions.

The product is not a blind mass-apply bot. It is designed around verified candidate evidence, explainable scoring, human approval gates, and local automation that stops when the system lacks enough information or confidence.

## Primary Surfaces

- **Command Center**: daily operating view with live search updates, blockers, pipeline state, and prioritized actions.
- **Needs Me**: questions and blockers agents cannot safely resolve alone.
- **Jobs**: scored role review queue with signals, fit, status, and approval/rejection flows.
- **Apply Sprint**: controlled browser-assistant launch surface for approved applications.
- **Applications**: application tracker, packets, outcomes, prep, and automation state.
- **Settings**: provider config, cron, email, automation gates, company policies, sources, and admin links.
- **Jolene**: persistent context-aware assistant available on every screen with text and voice interaction.

## Core Capabilities

- Search profiles for different positioning tracks such as senior frontend, full-stack product, AI product, security/identity, internal tools, design systems, and mission software UI.
- Company source list and ATS discovery for target companies.
- Duplicate and stale job detection.
- Explainable job scoring with fit, opportunity, confidence, strengths, risks, missing keywords, and evidence references.
- Candidate evidence library with confidence labels and source references.
- RAG retrieval over approved evidence using Postgres, pgvector, chunking, metadata, and embeddings.
- Resume profiles and generated application packets.
- Cover letters, recruiter messages, hiring manager messages, company briefs, and application answers.
- QA checks for unsupported claims, generic writing, fake metrics, style issues, and missing evidence.
- Email response ingestion through IMAP and OAuth foundation for Gmail/Outlook.
- Outcome tracking and outcome-learning recommendations.
- Local Playwright application assistant with LangGraph-backed durable workflow state and safety gates.
- MCP server exposing app tools to local agents.
- Chrome extension for capturing externally found jobs into the system.

## Wiki Pages

- [Getting Started](https://github.com/carlwelchdesign/jobsearch-dashboard-ai/wiki/Getting-Started)
- [Command Center and Jolene](https://github.com/carlwelchdesign/jobsearch-dashboard-ai/wiki/Command-Center-and-Jolene)
- [Agents and Workflows](https://github.com/carlwelchdesign/jobsearch-dashboard-ai/wiki/Agents-and-Workflows)
- [Evidence, RAG, and Materials](https://github.com/carlwelchdesign/jobsearch-dashboard-ai/wiki/Evidence-RAG-and-Materials)
- [Job Discovery and Scoring](https://github.com/carlwelchdesign/jobsearch-dashboard-ai/wiki/Job-Discovery-and-Scoring)
- [Application Automation](https://github.com/carlwelchdesign/jobsearch-dashboard-ai/wiki/Application-Automation)
- [Email, Outcomes, and Interview Prep](https://github.com/carlwelchdesign/jobsearch-dashboard-ai/wiki/Email-Outcomes-and-Interview-Prep)
- [MCP and Integrations](https://github.com/carlwelchdesign/jobsearch-dashboard-ai/wiki/MCP-and-Integrations)
- [Operations and Configuration](https://github.com/carlwelchdesign/jobsearch-dashboard-ai/wiki/Operations-and-Configuration)

## Safety Model

The system can find jobs, score jobs, generate materials, prepare application packets, draft messages, monitor responses, and launch local automation. It must not silently invent career claims or submit/send externally without the configured approval rules and safety gates.

LangGraph is used for the application assistant state machine where durable interrupt/resume behavior matters. It tracks browser launch, field inspection, pending field commands, user pauses, resumes, and ready-to-submit state. It does not remove the manual final-submit gate.

Hard rules:

- Generated materials must be grounded in approved candidate evidence.
- `NEEDS_REVIEW` evidence can be shown to the user but is not silently used in final materials.
- No fake metrics, employment history, tools, titles, degrees, certifications, or hands-on claims.
- Agent reasoning is stored as concise user-visible rationale, not private chain-of-thought.
- Destructive profile changes, message sending, and application submission require explicit controls and policy gates.
