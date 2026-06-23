# Modern Resume PDF Proportion Fix

## Summary
Make the `modern_two_column` PDF match the in-app preview numerically instead of approximating it by eye. The PDF should use the preview column ratio, tighter measured wrapping, smaller body rhythm, and smaller skill chips so the exported PDF no longer looks like a separate layout.

## Key Changes
- Recalibrate the PDF page layout to the preview proportions:
  - Use about 24pt page padding.
  - Use the preview column ratio: Experience about 60%, sidebar about 40%.
  - Use a fixed narrow column gap around 18pt.
  - Target layout: left margin 24pt, Experience width about 330pt, sidebar x about 372pt, sidebar width about 216pt.
- Replace fixed character-count wrapping with width-aware wrapping:
  - Wrap text based on available column width and font size.
  - Experience bullets use the full Experience column minus bullet indent.
  - Sidebar summary, education, skills, and projects wrap to the actual sidebar width.
- Reduce PDF typography to better match the preview:
  - Slightly smaller name/header sizing.
  - Body text closer to preview scale.
  - Sidebar skill chips reduced further because the preview chip text is still a bit large.
- Keep the preview behavior intact:
  - Two-column structure.
  - Real bullet dots.
  - Role separators.
  - Section underlines.
  - Sidebar skills as gray pills/chips.
  - Circular profile image or initials badge.
  - Selectable/searchable PDF text.

## Test Plan
- Add or update focused PDF renderer tests for:
  - Modern PDF still includes LinkedIn/GitHub/contact text.
  - Skills render as chip labels.
  - Experience, Summary, Skills, Education, and Projects still appear as selectable text.
  - Overlay/branding text is absent.
- Add focused tests for the new width-aware wrapping helper so long bullets and sidebar text wrap by column width instead of arbitrary character counts.
- Export the same Renofi resume PDF and render page 1 to PNG.
- Compare visually against the in-app preview for:
  - Experience/sidebar proportions.
  - Column gap.
  - Header spacing.
  - Skill chip size.
  - Bullet wrapping width.
- Run focused PDF tests, TypeScript, and production build.

## Assumptions
- The in-app preview is the source of truth for the modern format.
- This fix only changes the modern PDF renderer; generated resume markdown/plain text remains unchanged.
- Legacy formats stay unchanged.
- The profile image/initials badge behavior remains as currently implemented.
