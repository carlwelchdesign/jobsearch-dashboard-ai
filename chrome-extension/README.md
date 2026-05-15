# Job Search OS Capture Extension

Local Chrome extension for saving job pages into the app.

## Install Locally

1. Start the app on `http://localhost:3000`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Choose Load unpacked.
5. Select this `chrome-extension` folder.

Open a job page, click the extension, review the extracted fields, and save. The extension posts to `POST /api/jobs/capture`, which runs the same dedupe and scoring path as manual job paste.

## Optional Local Token

Set `BROWSER_EXTENSION_TOKEN` in the app environment to require a local token for capture requests. Enter the same token in the extension popup under Local settings. The token is stored in Chrome local extension storage.
