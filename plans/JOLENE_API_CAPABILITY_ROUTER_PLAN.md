# Jolene API Capability Router

## Summary
Give Jolene a first-class capability registry for understanding the whole Job Search OS surface. Jolene should route natural language to app capabilities, compose read-only context across domains, and execute only safe internal workflows directly. Guarded or external behavior remains behind existing confirmation and manual-review boundaries.

## Implementation Shape
- Add a Jolene capability registry with:
  - stable capability ids
  - natural-language examples and synonyms
  - app domains
  - API/page surfaces
  - risk level
  - execution handler
- Route Jolene messages through this registry before fallback coaching or generic chat.
- Let read-only capability matches compose state from multiple domains.
- Keep safe workflow starts on the existing ADK/operator path.
- Keep guarded mutations on existing Jolene confirmation plans.
- Keep external actions blocked.

## Safety Policy
- `read_only`: answer directly from local app state.
- `safe_internal`: execute only existing internal run services.
- `guarded_mutation`: plan and require in-app confirmation.
- `external_blocked`: explain the boundary and point to manual confirmation surfaces.

## Initial Capability Coverage
- Dashboard / Command Center
- Apply Sprint and application packets
- Applications and follow-ups
- Jobs, search, duplicate/stale, suppressions
- Profiles and profile health
- Agent runs and failures
- Email Ops
- Market Intelligence
- Evidence and career profile context
- Generated materials retrieval
- Safe internal workflow starts
- Guarded workflow planning

## Acceptance
- Jolene answers broad natural-language app questions through capability routing.
- Multi-domain questions gather context across multiple capabilities.
- Slack Jolene uses the same path as in-app Jolene.
- Tests cover registry matching, cross-domain routing, safe execution routing, and external boundary preservation.
