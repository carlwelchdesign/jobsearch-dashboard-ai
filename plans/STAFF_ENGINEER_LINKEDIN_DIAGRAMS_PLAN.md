# Staff-Engineer Diagram and Visual Documentation Upgrade

## Summary
Upgrade the LinkedIn content team’s diagram workflow from rough template visuals into a staff-engineer documentation pipeline. Use AI for architecture reasoning, diagram planning, critique, and optional non-text visual polish, but keep final text-heavy technical diagrams rendered deterministically so labels, typography, spacing, and layout are reliable.

## Key Changes
- Add specialist content-team roles:
  - `Technical Documentation Architect`: turns the prompt, memory pack, repo context, and plans into a diagram brief.
  - `Diagram Systems Designer`: produces structured diagram specs for system architecture, data flow, agent workflow, approval gates, and technical explainers.
  - `Visual Design Reviewer`: enforces typography, spacing, hierarchy, palette, and LinkedIn readability.
  - `Diagram QA Reviewer`: blocks diagrams with overflowing text, cramped cards, excessive bold weight, weak contrast, or missing provenance.
  - `AI Visual Polish Producer`: optionally generates a non-authoritative image-model variant for social polish, never the only source of truth for text-heavy diagrams.

- Replace the current fixed SVG diagram renderer with a deterministic diagram renderer:
  - Generate structured diagram specs first: title, subtitle, diagram type, nodes, groups, relationships, callouts, footer, provenance, and design intent.
  - Render SVG/HTML to PNG with Playwright using fixed 16:9 social-safe dimensions, responsive text wrapping, measured text boxes, reserved gutters, and restrained type scale.
  - Use normal font weights for body labels, limited bold only for headings, and enforce no text overflow before marking an asset publishable.
  - Store rendered PNGs under `public/generated/linkedin-content` with metadata for diagram kind, renderer version, quality score, source spec, warnings, and provenance.

- Add optional OpenAI image generation support:
  - Add a LinkedIn visual image model setting under Settings -> System -> AI provider, defaulting to `gpt-image-2`.
  - Add an OpenAI image helper that can create optional polished cover/visual variants from the diagram brief, with size/quality configurable internally.
  - Do not use image generation as the primary renderer for exact architecture diagrams because OpenAI’s image docs note text placement and layout-sensitive composition limitations.
  - If image generation fails, is unavailable, times out, or produces unsafe metadata, keep the deterministic diagram and show a review warning instead of blocking draft creation.

- Update `/linkedin-content` review UI:
  - Split visuals into `Technical diagrams`, `AI polish variants`, and `App screenshots`.
  - Show diagram quality review: readability, overflow status, contrast, typography notes, source provenance, and selected visual rationale.
  - Let the selected publish visual default to the highest-scoring deterministic technical diagram.
  - Keep approval and publishing gates unchanged: privacy, provenance, grounded claims, and user approval are still required.

- Keep scope focused:
  - V1 upgrades LinkedIn draft visuals only.
  - No standalone docs library yet.
  - No automatic repo documentation writes.
  - No image-model-only architecture diagrams for text-heavy system documentation.

## Public Interfaces
- Extend persisted AI settings with `linkedinDiagramImageModel`, default `gpt-image-2`, exposed through the existing `/api/settings/ai` flow.
- Extend LinkedIn visual asset metadata to include `assetType`, `diagramKind`, `renderEngine`, `qualityReview`, `imageModel`, `sourceSpec`, `provenance`, and `warnings`.
- Keep `POST /api/linkedin-content/drafts` request shape unchanged; diagram behavior is inferred from prompt intent and visual direction.
- Continue saving all visual assets under `public/generated/linkedin-content`.

## Test Plan
- Unit/source tests:
  - Architecture and technical prompts create structured diagram specs before rendering.
  - Renderer wraps labels and rejects overflow, cramped layout, all-bold body text, weak contrast, and missing provenance.
  - Deterministic diagram remains selected when image generation is unavailable or fails.
  - OpenAI image helper records model, size, quality, and failure reasons without blocking deterministic draft generation.
  - Privacy review treats AI variants and deterministic diagrams as visual assets and blocks unsafe metadata.

- Route tests:
  - Draft generation for “system architecture diagram” returns technical diagram metadata, QA review, and selected deterministic visual.
  - Draft generation with image generation mocked returns both deterministic and optional AI polish assets.
  - Failed image generation preserves the draft and exposes a non-blocking warning.
  - Approval still rejects drafts with failed privacy, provenance, or diagram QA gates.

- UI tests:
  - `/linkedin-content` shows separate technical diagram, AI polish, and screenshot sections.
  - Visual cards show quality score, warnings, provenance, and selected/publishable state.
  - Long labels do not overflow visual cards or preview containers.

- Verification:
  - Read local Next.js docs if available, otherwise follow existing App Router patterns.
  - Run Prisma migration/generate.
  - Run targeted LinkedIn content, OpenAI helper, Settings AI, route, and UI tests.
  - Run `npx tsc --noEmit --pretty false`, `npx react-doctor@latest --verbose --diff`, and `npm run build`.
  - Generate one local architecture draft and visually inspect the deterministic PNG for typography, spacing, and readability.

## Assumptions
- Use the hybrid renderer strategy: AI plans and critiques, deterministic rendering owns exact text and layout.
- Default visual style is technical editorial: quiet, readable, documentation-quality, and staff-engineer credible.
- Image generation is an optional polish pass, not the primary source for precise technical diagrams.
- OpenAI image generation guidance used for this plan: https://developers.openai.com/api/docs/guides/image-generation.
