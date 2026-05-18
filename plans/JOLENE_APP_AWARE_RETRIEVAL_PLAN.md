# Jolene App-Aware Retrieval and Command Layer

## Summary

Upgrade Jolene from a page-context assistant into an app-aware operating assistant that can answer concrete requests across the whole local app database. The first required success case is: "Where is the cover letter for [company]?" Jolene should resolve the company/job, find the generated material or packet, and return direct links to the material, job, and application instead of giving a generic answer.

## Key Changes

- Add a Jolene app retrieval layer that can search across applications, jobs, generated resumes, generated cover letters, packets, email confirmations, Needs Me requests, profiles, and recent agent runs.
- Add deterministic Jolene tools for common app-data requests:
  - find cover letters by company/title
  - find resumes/material packets by company/title
  - find applications by company/title/status
  - find jobs by company/title/status
  - summarize current application state
  - route the user to the right page or API export
- Update Jolene action handling so "find/show/where is/open the cover letter for Linear" runs the retrieval tool before falling back to LLM chat.
- Return structured action results with human-readable answers plus links:
  - `/resumes/generated`
  - `/jobs/[id]`
  - `/applications/[id]`
  - `/api/cover-letters/[id]/plain-text`
  - `/api/cover-letters/[id]/pdf`
- Keep raw generated material bodies out of default Jolene responses. Jolene should show metadata, location, status, and links by default, and only quote/summarize content when the user explicitly asks.
- Improve the Jolene drawer so assistant responses can render safe app links as clickable buttons instead of plain text only.
- Extend README and wiki documentation to describe Jolene as an app-aware assistant with deterministic local retrieval tools.

## Public Interfaces and Types

- Extend the `/api/jolene` response to optionally include `resultLinks` or equivalent structured link metadata for assistant messages.
- Add a typed Jolene retrieval result shape with:
  - `kind`: `cover_letter`, `resume`, `application`, `job`, `packet`, or `mixed`
  - `label`
  - `company`
  - `title`
  - `status`
  - `createdAt` or `updatedAt`
  - `links`
- Preserve the existing `clientAction` behavior for navigation and refresh.
- No database migration is required for this first layer.

## Test Plan

- Add Jolene action tests proving these prompts resolve generated cover letters:
  - "Where is the cover letter for Linear?"
  - "Find my cover letter for Senior / Staff Fullstack Engineer at Linear"
  - "Show me application materials for Terzo"
- Add tests for duplicate or ambiguous matches: Jolene should list candidates with company/title/status rather than choosing silently.
- Add tests for no result: Jolene should say no cover letter exists and point to the job/application page if a related job exists.
- Add an API route test for `/api/jolene` verifying structured links are returned with the assistant response.
- Run `npx tsc --noEmit --pretty false`.
- Run the focused Jolene tests.
- Run `npm run build`.

## Assumptions

- Jolene should use deterministic local database retrieval before asking the LLM to reason.
- Jolene should be broad over time, but this implementation starts with high-value app-data lookup and routing rather than unrestricted arbitrary database querying.
- Jolene can return links to local API exports for generated materials, but should not dump full cover letter bodies unless explicitly requested.
- Existing generated material, application, and job schemas are sufficient; no migration is needed.
