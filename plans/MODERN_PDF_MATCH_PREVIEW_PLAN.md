# Make Modern PDF Match The Preview

## Summary
Update the `modern_two_column` PDF renderer so it follows the in-app resume preview: compact header, dominant Experience column, tight gutter, section rhythm, subtle role separators, real bullets, and sidebar skills rendered as chips/pills. Keep generated resume text unchanged and keep the exported PDF selectable/searchable.

## Key Changes
- Treat `ResumePreview` as the visual source of truth for modern PDF exports.
- Align PDF layout tokens with the preview: compact header, tighter columns, black section rules, subtle experience separators, and circular profile badge.
- Render sidebar skills as light-gray chip rows with bold labels.
- Improve Experience rendering with filled bullet dots and wider text wrapping.
- Preserve existing legacy PDF formats and plain text/markdown content.

## Test Plan
- Extend modern PDF tests for chip drawing, real bullet markers, section separators, contact/profile links, and no overlay branding.
- Export the Renofi generated resume, render page 1 to PNG, and visually compare it against the in-app preview.
- Run focused PDF tests, TypeScript, clean production build, PDF text extraction, and local route smoke checks.
