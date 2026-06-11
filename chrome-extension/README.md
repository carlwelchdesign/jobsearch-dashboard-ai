# Job Search OS Capture Extension

Local Chrome extension for saving job pages into the app and filling ready application forms from prepared Job Search OS packages.

## Install Locally

1. Start the app on `http://localhost:3000`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Choose Load unpacked.
5. Select this `chrome-extension` folder.

Open a job page, click the extension, review the extracted fields, and save. The extension posts to `POST /api/jobs/capture`, which runs the same dedupe and scoring path as manual job paste.

If the saved job has zero matching search profiles, the app creates an enabled captured-intent profile for similar roles, scores the captured job against it immediately, and reports that profile name in the popup status. The default lane is `AI-Native Enterprise Product Frontend`.

After a successful save, the popup shows **Apply Now** and remembers the last saved job. If the actual application form is on another page, navigate there, reopen the extension, and click **Apply Now**. The extension sends the current tab URL to `POST /api/jobs/:id/apply-now`; the app updates the job's application URL, prepares or reuses the custom resume and cover letter, creates the ready application, and launches the local assistant.

If the app is running on a different local port, open **Local settings** in the extension popup and set **App URL** to that address, for example `http://localhost:3001`.

## Assisted Apply

On a ready application page, click **Fill from Job Search OS**. The extension looks up the ready application by the current URL through `GET /api/applications/assistant-package/by-url`, then fills safe known fields such as name, email, phone, links, location, selected application-answer text, and obvious cover-letter fields.

If the current page does not match the stored application URL, use the **Ready applications** dropdown instead. Select the prepared job, click **Fill selected ready job**, and the extension loads that application's package directly. The app also saves the current tab URL as the job's application URL so future URL-matched fills work from the same page.

The extension runs in your regular Chrome profile and does not solve CAPTCHA, use stealth settings, or rotate networks. **Apply Now** launches the local assistant and preserves its manual-submit safety gates. **Fill from Job Search OS** never clicks submit. It attempts to attach the generated resume and cover-letter PDFs to matching file inputs; fields that cannot accept an attachment are highlighted for manual selection. After you complete missed non-sensitive fields, click **Save learned fields** so the app can reuse safe repeated answers on future applications.

## Package

Run this from the repo root:

```bash
npm run chrome-extension:package
```

The script validates Manifest V3 metadata and writes a versioned ZIP to `dist/chrome-extension/`.

## Optional Local Token

Set `BROWSER_EXTENSION_TOKEN` in the app environment to require a local token for capture requests. Enter the same token in the extension popup under Local settings. The token is stored in Chrome local extension storage.
