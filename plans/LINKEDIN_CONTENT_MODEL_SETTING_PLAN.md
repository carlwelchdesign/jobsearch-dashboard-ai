# Dedicated LinkedIn Content Model Setting

## Summary
Add a runtime-editable, LinkedIn-specific OpenAI model setting so `/linkedin-content` can use a higher-quality model than the app-wide `OPENAI_MODEL`. Default it to `gpt-5.5`, which OpenAI currently lists as the flagship model in its official model docs: https://platform.openai.com/docs/models.

## Key Changes
- Add a persisted user-level AI settings record for LinkedIn content generation.
  - Store `linkedinContentModel`, defaulting to `gpt-5.5`.
  - Keep `OPENAI_MODEL` as the fallback only if no saved LinkedIn setting exists.
  - Do not change embedding, resume, cover-letter, scoring, Jolene, or other agent model behavior.

- Update OpenAI helper usage.
  - Extend `parseStructuredOutput` to accept an optional `model`.
  - LinkedIn content generation passes the saved `linkedinContentModel`.
  - LangSmith/OpenAI trace metadata records the actual model used.
  - Deterministic fallback remains unchanged when OpenAI is unavailable or generation fails.

- Update Settings UI.
  - In `/settings/system#settings-ai`, show:
    - app-wide model from `OPENAI_MODEL`, read-only
    - editable “LinkedIn content model” text field
    - helper copy that this is for public LinkedIn draft quality only
  - Saving Settings persists the LinkedIn content model through a new or extended settings API.
  - Use `gpt-5.5` as the initial displayed value for users with no saved setting.

- Update LinkedIn content draft behavior.
  - `POST /api/linkedin-content/drafts` does not need a public contract change.
  - Agent input/run metadata should include the resolved model so `/agents` and run inspection can explain which model generated the draft.
  - Existing drafts remain unchanged; only new generations use the new setting.

## Public Interfaces
- Prisma migration:
  - Add a user-scoped AI settings table or equivalent persisted settings model with `linkedinContentModel String @default("gpt-5.5")`.
  - Add relation from `User` to the new settings model.
- API:
  - Add `GET/PATCH /api/settings/ai` or extend the existing Settings save flow with `linkedinContentModel`.
  - Validate model as a trimmed non-empty string with a reasonable max length, e.g. 100 chars.
- UI:
  - Add editable LinkedIn model field to Settings System AI card.

## Test Plan
- Unit/source tests:
  - `parseStructuredOutput` uses the explicit model when provided.
  - LinkedIn content agent resolves model from saved settings before falling back to `OPENAI_MODEL`.
  - Default LinkedIn content model is `gpt-5.5`.
  - Non-LinkedIn generation paths still use `OPENAI_MODEL`.

- Route tests:
  - Settings AI API returns default `gpt-5.5` when no record exists.
  - Settings AI API saves a custom LinkedIn content model.
  - LinkedIn draft route calls the content agent without requiring request payload changes.

- UI/source tests:
  - Settings System page shows app-wide model and editable LinkedIn content model.
  - Save flow includes `linkedinContentModel`.
  - LinkedIn content tests assert the selected model is represented in run input or observability metadata.

- Verification:
  - `npx prisma migrate dev` or repo-standard migration flow, then `npx prisma generate`.
  - Targeted Vitest for OpenAI helper, LinkedIn content, Settings AI route, and Settings UI source tests.
  - `npx tsc --noEmit --pretty false`.
  - `npx react-doctor@latest --verbose --diff`.
  - `npm run build`.

## Assumptions
- The setting should be editable in the app UI, not only `.env`.
- The default higher-quality LinkedIn model is `gpt-5.5`.
- `OPENAI_MODEL` remains the app-wide default for every other feature.
- No per-draft model picker in v1; Settings controls the model used for all future LinkedIn content drafts.
- If the configured model is invalid or unavailable at runtime, generation fails into the existing deterministic fallback path rather than blocking the draft route completely.
