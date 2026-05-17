const DEFAULT_APP_URL = "http://localhost:3000";
const fields = {
  title: document.querySelector("#title"),
  company: document.querySelector("#company"),
  location: document.querySelector("#location"),
  description: document.querySelector("#description"),
  apiUrl: document.querySelector("#apiUrl"),
  token: document.querySelector("#token"),
};
const statusElement = document.querySelector("#status");
const captureButton = document.querySelector("#capture");
const openJobLink = document.querySelector("#openJob");
let capturedPayload = null;

function setStatus(message) {
  statusElement.textContent = message;
}

function normalizeAppUrl(value) {
  return (value || DEFAULT_APP_URL).trim().replace(/\/+$/, "");
}

function captureEndpoint() {
  return `${normalizeAppUrl(fields.apiUrl.value)}/api/jobs/capture`;
}

function setOpenJobLink(jobUrl) {
  if (!jobUrl) {
    openJobLink.hidden = true;
    openJobLink.href = "#";
    return;
  }
  openJobLink.href = `${normalizeAppUrl(fields.apiUrl.value)}${jobUrl}`;
  openJobLink.hidden = false;
}

function currentPayload() {
  return {
    ...capturedPayload,
    title: fields.title.value.trim(),
    company: fields.company.value.trim(),
    location: fields.location.value.trim(),
    description: fields.description.value.trim(),
    sourceName: "Chrome Capture",
  };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadCapture() {
  try {
    const stored = await chrome.storage.local.get(["jobSearchOsToken", "jobSearchOsAppUrl"]);
    fields.apiUrl.value = stored.jobSearchOsAppUrl || DEFAULT_APP_URL;
    fields.token.value = stored.jobSearchOsToken || "";
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("No active tab found.");
    const payload = await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_JOB_PAGE" });
    capturedPayload = payload;
    fields.title.value = payload.title || "";
    fields.company.value = payload.company || "";
    fields.location.value = payload.location || "";
    fields.description.value = payload.description || "";
    setOpenJobLink(null);
    setStatus("Review fields before saving.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to inspect this tab.");
  }
}

async function saveCapture() {
  captureButton.disabled = true;
  setStatus("Saving...");
  try {
    const token = fields.token.value.trim();
    const appUrl = normalizeAppUrl(fields.apiUrl.value);
    await chrome.storage.local.set({ jobSearchOsToken: token, jobSearchOsAppUrl: appUrl });
    const response = await fetch(captureEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-job-search-os-token": token } : {}),
      },
      body: JSON.stringify(currentPayload()),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to save job.");
    setOpenJobLink(payload.jobUrl);
    const displayedMatchCount = Number.isFinite(payload.initialMatchCount) ? payload.initialMatchCount : payload.matchCount;
    const matchText = Number.isFinite(displayedMatchCount) ? ` ${displayedMatchCount} matching profiles.` : "";
    const profileText = payload.profileCreated && payload.profileName ? ` Created search profile: ${payload.profileName}.` : "";
    setStatus(`${payload.message || "Saved."}${matchText}${profileText}`);
  } catch (error) {
    setOpenJobLink(null);
    setStatus(error instanceof Error ? error.message : "Unable to save job.");
  } finally {
    captureButton.disabled = false;
  }
}

captureButton.addEventListener("click", () => {
  void saveCapture();
});

void loadCapture();
