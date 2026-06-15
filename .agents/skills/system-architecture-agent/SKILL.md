---
name: system-architecture-agent
description: Use when reviewing or changing Job Search OS architecture, adding AgentType values, modifying Prisma models, changing workflow boundaries, adding routes/API surfaces, or updating the system architecture report.
version: "1.0.0"
---

# System Architecture Agent

Use this skill for architecture review and system-map work in Job Search OS.

## Workflow

1. Read `AGENTS.md`; if the referenced Next.js docs are unavailable, follow existing App Router patterns in the repo.
2. Inspect the actual repo before proposing architecture: routes, API handlers, Prisma schema, agent services, skill registry, ADK registry, LangGraph workflows, README, wiki, and `/plans`.
3. Treat `AgentRun` and `AgentRunEvent` as the default observability layer for agents.
4. When adding an `AgentType`, also add Prisma migration, skill registry coverage, focused tests, README/wiki documentation, and UI visibility if the user needs to inspect it.
5. Keep risky external behavior gated. Architecture agents should report, map, and recommend by default; they should not silently mutate applications, email, calendar, or third-party systems.
6. Surface weak connections clearly: missing skill policies, undocumented API routes, unclear workflow ownership, stale docs, and ambiguous data boundaries.

## Acceptance Checks

- `src/lib/skills/registry.test.ts` still proves `AgentType` coverage.
- Architecture reports cite repo evidence and persist as `SYSTEM_ARCHITECTURE` runs.
- Docs explain runtime source boundaries: standard service, ADK control plane, and LangGraph state machine.
- Verification includes focused tests, TypeScript, build, diff check, and dev-server route validation.
