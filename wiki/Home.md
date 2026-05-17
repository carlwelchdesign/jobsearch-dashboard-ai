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
- LangGraph-backed recruiting agency workflow with live `AgentRun` activity, packet-preparation state, and explicit repair/retry/cancel controls.
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

LangGraph is used where durable state-machine behavior matters. The application assistant tracks browser launch, field inspection, pending field commands, user pauses, resumes, and ready-to-submit state. The recruiting agency tracks candidate discovery, approval, packet preparation, result recording, and finalization. The assistant graph does not remove the manual final-submit gate.

LangSmith is available as an optional observability layer. When configured, it traces redacted metadata for agent runs, OpenAI calls, assistant workflow steps, and recruiting agency graph runs. The app also has a local quality loop that turns application-assistant failures, recruiting agency failures, noisy search runs, rejected high-score matches, outcome calibration signals, user mistake reports, and learned-rule rollbacks into redacted examples, scores them with deterministic evaluators, and creates controlled improvement proposals without sending raw resumes, cover letters, application answers, prompts, or secrets by default. Outcome calibration refreshes automatically after high-signal job, application, email, and assistant events and shows drill-down records behind noisy signals. Accepted low-risk mapped proposals become bounded skill rules for future agent runs, and Settings shows outcome calibration, impact status, and rollback history for active/disabled rules with manual disable and manual-triggered auto rollback for repeated negative impact; high-risk or workflow changes stay review-only.

Hard rules:

- Generated materials must be grounded in approved candidate evidence.
- `NEEDS_REVIEW` evidence can be shown to the user but is not silently used in final materials.
- No fake metrics, employment history, tools, titles, degrees, certifications, or hands-on claims.
- Agent reasoning is stored as concise user-visible rationale, not private chain-of-thought.
- Destructive profile changes, message sending, and application submission require explicit controls and policy gates.
