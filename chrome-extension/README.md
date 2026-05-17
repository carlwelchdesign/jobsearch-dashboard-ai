# Job Search OS Capture Extension

Local Chrome extension for saving job pages into the app.

## Install Locally

1. Start the app on `http://localhost:3000`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Choose Load unpacked.
5. Select this `chrome-extension` folder.

Open a job page, click the extension, review the extracted fields, and save. The extension posts to `POST /api/jobs/capture`, which runs the same dedupe and scoring path as manual job paste.

If the saved job has zero matching search profiles, the app creates an enabled captured-intent profile for similar roles, scores the captured job against it immediately, and reports that profile name in the popup status. The default lane is `AI-Native Enterprise Product Frontend`.

If the app is running on a different local port, open **Local settings** in the extension popup and set **App URL** to that address, for example `http://localhost:3001`.

## Package

Run this from the repo root:

```bash
npm run chrome-extension:package
```

The script validates Manifest V3 metadata and writes a versioned ZIP to `dist/chrome-extension/`.

## Optional Local Token

Set `BROWSER_EXTENSION_TOKEN` in the app environment to require a local token for capture requests. Enter the same token in the extension popup under Local settings. The token is stored in Chrome local extension storage.
