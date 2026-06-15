# LinkedIn Content Visual Replacement Plan

Add visual controls to each `/linkedin-content` draft so a bad generated visual can be replaced before publishing. V1 supports uploading a local screenshot as the selected publish image and regenerating replacement visuals from a new visual direction.

Uploaded screenshots are trusted as user-approved, marked `privacyStatus: "PASS"`, saved under `public/generated/linkedin-content`, appended to visual history, and written to `selectedScreenshots` so the existing LinkedIn publisher sends the uploaded image.

Regeneration reuses the existing safe visual production path, replaces only `selectedScreenshots`, appends new visual candidates to `screenshotAssets`, and does not rewrite title, hook, body, hashtags, claims, or prompt review.
