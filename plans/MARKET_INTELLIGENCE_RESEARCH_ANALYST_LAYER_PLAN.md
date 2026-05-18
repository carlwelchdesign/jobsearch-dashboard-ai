# Market Intelligence Research Analyst Layer

## Summary

Upgrade `MARKET_INTELLIGENCE` from a lightweight source checker into a real research analyst: fetch fresh articles from trusted source pages/RSS/indexes, extract readable article text, summarize key claims with citations, and synthesize those findings against the app's actual job pipeline, skills, search profiles, applications, and outcomes.

Use curated + source-index discovery, not broad crawling. Store article metadata, extracted facts, short excerpts, and synthesis in `AgentRun.outputJson`; do not store full article snapshots.

## Key Changes

- Extend the market intelligence agent with a research pipeline:
  - fetch curated source URLs and source index/RSS pages
  - discover recent relevant article links from trusted domains
  - fetch article pages with timeouts, user-agent, content-type checks, size limits, and robots-safe behavior
  - extract title, publisher, date, canonical URL, readable text, and short supporting excerpts
  - discard stale, duplicate, low-content, blocked, or irrelevant pages
- Add LLM synthesis when `OPENAI_API_KEY` is configured:
  - summarize each article into claims, evidence, implications, and confidence
  - produce a cross-source research synthesis tied to the user's lanes: AI product/frontend, design systems, enterprise SaaS, devtools, workflow/agentic apps
  - clearly separate `app-observed facts`, `source-backed claims`, and `inferred recommendations`
  - deterministic fallback remains available without OpenAI
- Expand `MarketIntelligenceOutput`:
  - add `researchDigest`: article summaries with title, publisher, date, URL, excerpts, claims, relevance score, and confidence
  - add `researchSynthesis`: cross-source narrative, contradictions, opportunities, risks, and recommended weekly moves
  - keep existing lane charts, skill signals, source digest, and review-only actions
- Update `/profiles` Market Intelligence panel:
  - show `Research synthesis` above the charts
  - show cited article cards with source links, dates, relevance, excerpts, and implications
  - show warnings when sources fail, article content is stale, or synthesis used deterministic fallback
- Keep all recommendations review-only. No automatic profile edits, source edits, outreach, or application decisions.

## Interfaces

- Keep existing route: `POST /api/market-intelligence/run`
- Accept optional body:
  - `lookbackDays`: `7-180`, default `45`
  - `researchDepth`: `"standard" | "deep"`, default `"standard"`
- Add optional env config:
  - `MARKET_INTELLIGENCE_EXTRA_SOURCES`: newline-separated URLs for trusted additional source/index pages
  - `MARKET_INTELLIGENCE_MAX_ARTICLES`: default `8`, max `20`
- No new database table in this phase; store the research brief in `AgentRun.outputJson`.

## Test Plan

- Unit test article extraction from representative HTML, RSS/XML, and blocked/low-content pages.
- Unit test relevance filtering for software, AI, frontend, design systems, devtools, and hiring-market terms.
- Unit test synthesis fallback when OpenAI is not configured.
- Unit test source-backed claims include URL and excerpt.
- API test `POST /api/market-intelligence/run` with mocked fetch and mocked OpenAI helper.
- UI smoke/type check for the expanded Profiles panel.
- Run:
  - `npx vitest run src/lib/agents/market-intelligence*.test.ts`
  - `npx tsc --noEmit --pretty false`
  - `npm run build`

## Assumptions

- Use curated + trusted-source discovery, not broad web crawling.
- Store summaries, claims, citations, and short excerpts only; do not store full article bodies.
- Respect source failures and continue with partial results.
- LLM synthesis improves quality but is optional; the app must still produce a useful deterministic brief without OpenAI.
- The feature's goal is practical weekly job-search strategy, not general news aggregation.
