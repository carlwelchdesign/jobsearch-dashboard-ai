const DEFAULT_APP_URL = "http://localhost:3000";
const STORAGE_KEYS = ["jobSearchOsToken", "jobSearchOsAppUrl", "jobSearchOsLastSavedJob", "jobSearchOsSelectedReadyApplicationId"];
const fields = {
  title: document.querySelector("#title"),
  company: document.querySelector("#company"),
  location: document.querySelector("#location"),
  description: document.querySelector("#description"),
  apiUrl: document.querySelector("#apiUrl"),
  token: document.querySelector("#token"),
  readyApplications: document.querySelector("#readyApplications"),
};
const statusElement = document.querySelector("#status");
const captureButton = document.querySelector("#capture");
const applyNowButton = document.querySelector("#applyNow");
const fillApplicationButton = document.querySelector("#fillApplication");
const fillSelectedApplicationButton = document.querySelector("#fillSelectedApplication");
const openJobLink = document.querySelector("#openJob");
const linkedinLeadResult = document.querySelector("#linkedinLeadResult");
const linkedinLeadSummary = document.querySelector("#linkedinLeadSummary");
const linkedinLeadQueries = document.querySelector("#linkedinLeadQueries");
let capturedPayload = null;
let lastSavedJob = null;
let readyApplications = [];

function setStatus(message) {
  statusElement.textContent = message;
}

function normalizeAppUrl(value) {
  return (value || DEFAULT_APP_URL).trim().replace(/\/+$/, "");
}

function captureEndpoint() {
  return `${normalizeAppUrl(fields.apiUrl.value)}/api/jobs/capture`;
}

function assistantPackageByUrlEndpoint(pageUrl) {
  return `${normalizeAppUrl(fields.apiUrl.value)}/api/applications/assistant-package/by-url?url=${encodeURIComponent(pageUrl)}`;
}

function readyApplicationsEndpoint(currentUrl = "") {
  const url = new URL(`${normalizeAppUrl(fields.apiUrl.value)}/api/applications/ready-for-extension`);
  if (currentUrl) url.searchParams.set("currentUrl", currentUrl);
  return url.toString();
}

function selectedAssistantPackageEndpoint(applicationId, currentUrl) {
  const url = new URL(`${normalizeAppUrl(fields.apiUrl.value)}/api/applications/${encodeURIComponent(applicationId)}/extension-package`);
  if (currentUrl) url.searchParams.set("currentUrl", currentUrl);
  return url.toString();
}

function applyNowEndpoint(jobId) {
  return `${normalizeAppUrl(fields.apiUrl.value)}/api/jobs/${encodeURIComponent(jobId)}/apply-now`;
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

function setLinkedInLeadResult(payload) {
  if (payload?.leadSource !== "linkedin") {
    linkedinLeadResult.hidden = true;
    linkedinLeadSummary.textContent = "";
    linkedinLeadQueries.innerHTML = "";
    return;
  }

  const queries = Array.isArray(payload.originalPostingQueries) ? payload.originalPostingQueries : [];
  const queryText = queries.length
    ? `Queued ${queries.length} original-posting search${queries.length === 1 ? "" : "es"} for employer and ATS pages.`
    : "No original-posting searches were queued yet.";
  const detailText = payload.needsManualText
    ? "This is review-only until you paste job text or capture an employer/ATS apply page."
    : "This has enough visible job detail for local scoring. The LinkedIn URL was kept as lead metadata, not the apply target.";

  linkedinLeadSummary.textContent = `${detailText} ${queryText}`;
  linkedinLeadQueries.innerHTML = "";
  for (const query of queries.slice(0, 3)) {
    const item = document.createElement("li");
    item.textContent = query;
    linkedinLeadQueries.append(item);
  }
  linkedinLeadResult.hidden = false;
}

function setApplyNowJob(job) {
  lastSavedJob = job?.jobId ? job : null;
  applyNowButton.hidden = !lastSavedJob;
  applyNowButton.textContent = lastSavedJob ? `Apply Now: ${lastSavedJob.company || "saved job"}` : "Apply Now";
}

function savedJobFromCaptureResponse(payload) {
  if (!payload?.jobId) return null;
  return {
    jobId: payload.jobId,
    jobUrl: payload.jobUrl || `/jobs/${payload.jobId}`,
    company: payload.company || payload.job?.company || "",
    title: payload.title || payload.job?.title || "",
    savedAt: new Date().toISOString(),
  };
}

function tokenHeaders() {
  const token = fields.token.value.trim();
  return token ? { "x-job-search-os-token": token } : {};
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

function formatReadyApplication(application) {
  const score = Number.isFinite(application.score) ? ` · ${application.score}` : "";
  const location = application.location ? ` · ${application.location}` : "";
  return `${application.company || "Unknown company"} — ${application.title || "Untitled role"}${location}${score}`;
}

function applyReadyApplicationToCaptureFields(application) {
  if (!application) return;
  fields.title.value = application.title || fields.title.value;
  fields.company.value = application.company || fields.company.value;
  fields.location.value = application.location || fields.location.value;
  fields.description.value = application.description || fields.description.value;
}

function normalizeUrlForMatch(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value || "").trim().replace(/\/$/, "");
  }
}

function readyApplicationForCurrentUrl(currentUrl) {
  const normalizedCurrent = normalizeUrlForMatch(currentUrl);
  if (!normalizedCurrent) return null;
  return readyApplications.find((application) => normalizeUrlForMatch(application.applicationUrl) === normalizedCurrent)
    || readyApplications.find((application) => {
      try {
        const current = new URL(normalizedCurrent);
        const stored = new URL(application.applicationUrl || "");
        return current.hostname === stored.hostname && current.pathname === stored.pathname;
      } catch {
        return false;
      }
    })
    || null;
}

function renderReadyApplications(preferredApplicationId = "") {
  const previousSelection = preferredApplicationId || fields.readyApplications.value;
  fields.readyApplications.innerHTML = "";
  if (!readyApplications.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No ready applications";
    fields.readyApplications.append(option);
    fillSelectedApplicationButton.disabled = true;
    return;
  }
  for (const application of readyApplications) {
    const option = document.createElement("option");
    option.value = application.id;
    option.textContent = formatReadyApplication(application);
    fields.readyApplications.append(option);
  }
  if (previousSelection && readyApplications.some((application) => application.id === previousSelection)) {
    fields.readyApplications.value = previousSelection;
  }
  fillSelectedApplicationButton.disabled = false;
}

async function loadReadyApplications(preferredApplicationId = "", currentUrl = "") {
  try {
    const appUrl = normalizeAppUrl(fields.apiUrl.value);
    const token = fields.token.value.trim();
    await chrome.storage.local.set({ jobSearchOsToken: token, jobSearchOsAppUrl: appUrl });
    const response = await fetch(readyApplicationsEndpoint(currentUrl), {
      headers: tokenHeaders(),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to load ready applications.");
    readyApplications = Array.isArray(payload.applications) ? payload.applications : [];
    const stored = await chrome.storage.local.get(["jobSearchOsSelectedReadyApplicationId"]);
    const currentMatch = readyApplicationForCurrentUrl(currentUrl);
    const selectedId = preferredApplicationId || currentMatch?.id || stored.jobSearchOsSelectedReadyApplicationId || "";
    renderReadyApplications(selectedId);
  } catch (error) {
    readyApplications = [];
    renderReadyApplications();
    setStatus(error instanceof Error ? error.message : "Unable to load ready applications.");
  }
}

function contentScriptError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/receiving end does not exist|could not establish connection|Cannot access/i.test(message)) {
    return "Unable to reach this tab. Reload the application page, pass any security verification manually, then reopen the extension.";
  }
  return message || "Unable to fill this application.";
}

function materialFileName(assistantPackage, kind) {
  const job = assistantPackage.job || {};
  const company = String(job.company || "Company").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const title = String(job.title || "Role").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return kind === "resume"
    ? `${company}-${title}-Resume.pdf`
    : `${company}-${title}-Cover-Letter.pdf`;
}

async function packageWithMaterialFiles(assistantPackage) {
  const materials = assistantPackage.materials || {};
  const materialFiles = [];
  if (materials.resumePdfUrl) {
    materialFiles.push(await fetchMaterialFile(materials.resumePdfUrl, "resume", materialFileName(assistantPackage, "resume")));
  }
  if (materials.coverLetterPdfUrl) {
    materialFiles.push(await fetchMaterialFile(materials.coverLetterPdfUrl, "coverLetter", materialFileName(assistantPackage, "coverLetter")));
  }
  return {
    ...assistantPackage,
    materialFiles: materialFiles.filter(Boolean),
  };
}

async function fetchMaterialFile(url, kind, fallbackName) {
  const response = await fetch(url, {
    headers: tokenHeaders(),
  });
  if (!response.ok) throw new Error(`Unable to download ${kind === "resume" ? "resume" : "cover letter"} PDF.`);
  const blob = await response.blob();
  return {
    kind,
    name: fileNameFromDisposition(response.headers.get("content-disposition")) || fallbackName,
    mimeType: blob.type || "application/pdf",
    dataUrl: await blobToDataUrl(blob),
  };
}

function fileNameFromDisposition(value) {
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i.exec(value || "");
  const fileName = match?.[1] || match?.[2] || "";
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read PDF blob."));
    reader.readAsDataURL(blob);
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadCapture() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEYS);
    fields.apiUrl.value = stored.jobSearchOsAppUrl || DEFAULT_APP_URL;
    fields.token.value = stored.jobSearchOsToken || "";
    setApplyNowJob(stored.jobSearchOsLastSavedJob || null);
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("No active tab found.");
    const payload = await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_JOB_PAGE" });
    capturedPayload = payload;
    fields.title.value = payload.title || "";
    fields.company.value = payload.company || "";
    fields.location.value = payload.location || "";
    fields.description.value = payload.description || "";
    setOpenJobLink(null);
    setLinkedInLeadResult(null);
    await loadReadyApplications("", tab.url);
    applyReadyApplicationToCaptureFields(readyApplicationForCurrentUrl(tab.url));
    const applyText = lastSavedJob ? " Apply Now is available for the last saved job." : "";
    const readyText = readyApplications.length ? ` ${readyApplications.length} ready application(s) available for selected fill.` : "";
    setStatus(`Review fields before saving.${applyText}${readyText}`);
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
    const savedJob = savedJobFromCaptureResponse(payload);
    if (savedJob) {
      await chrome.storage.local.set({ jobSearchOsLastSavedJob: savedJob });
      setApplyNowJob(savedJob);
    }
    setLinkedInLeadResult(payload);
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

async function applyNow() {
  if (!lastSavedJob?.jobId) {
    setStatus("Save a job first, then navigate to the application page and click Apply Now.");
    return;
  }
  applyNowButton.disabled = true;
  setStatus("Preparing resume and cover letter, then launching assistant...");
  try {
    const token = fields.token.value.trim();
    const appUrl = normalizeAppUrl(fields.apiUrl.value);
    await chrome.storage.local.set({ jobSearchOsToken: token, jobSearchOsAppUrl: appUrl });
    const tab = await getActiveTab();
    if (!tab?.url) throw new Error("No active application tab URL found.");
    const response = await fetch(applyNowEndpoint(lastSavedJob.jobId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-job-search-os-token": token } : {}),
      },
      body: JSON.stringify({
        applicationUrl: tab.url,
        pageUrl: tab.url,
        atsProvider: capturedPayload?.atsProvider,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to launch Apply Now.");
    setStatus(payload.message || "Assistant launched. Review the browser and submit manually.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to launch Apply Now.");
  } finally {
    applyNowButton.disabled = false;
  }
}

async function fillApplicationFromPackage() {
  fillApplicationButton.disabled = true;
  setStatus("Loading application package...");
  try {
    const token = fields.token.value.trim();
    const appUrl = normalizeAppUrl(fields.apiUrl.value);
    await chrome.storage.local.set({ jobSearchOsToken: token, jobSearchOsAppUrl: appUrl });
    const tab = await getActiveTab();
    if (!tab?.id || !tab.url) throw new Error("No active application tab found.");
    const response = await fetch(assistantPackageByUrlEndpoint(tab.url), {
      headers: tokenHeaders(),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to load an application package for this page.");
    const packagePayload = await packageWithMaterialFiles(payload);
    const result = await chrome.tabs.sendMessage(tab.id, { type: "FILL_APPLICATION_FROM_PACKAGE", package: packagePayload, auth: { token } });
    const filled = Number(result?.filled || 0);
    const skipped = Number(result?.skipped || 0);
    const uploads = Number(result?.uploads || 0);
    const uploadNeedsManual = Number(result?.uploadNeedsManual || 0);
    const generated = Number(result?.generated || 0);
    const uploadText = uploads ? ` Uploaded ${uploads} file(s).` : "";
    const generatedText = generated ? ` Generated ${generated} safe answer(s).` : "";
    const warning = uploadNeedsManual ? ` ${uploadNeedsManual} upload field(s) still need manual file selection.` : "";
    setStatus(`Filled ${filled} field(s).${generatedText}${uploadText} Skipped ${skipped}.${warning} Review missed fields before submitting manually.`);
  } catch (error) {
    setStatus(contentScriptError(error));
  } finally {
    fillApplicationButton.disabled = false;
  }
}

async function fillSelectedApplication() {
  const applicationId = fields.readyApplications.value;
  if (!applicationId) {
    setStatus("Select a ready application first.");
    return;
  }
  fillSelectedApplicationButton.disabled = true;
  setStatus("Loading selected application package...");
  try {
    const token = fields.token.value.trim();
    const appUrl = normalizeAppUrl(fields.apiUrl.value);
    await chrome.storage.local.set({ jobSearchOsToken: token, jobSearchOsAppUrl: appUrl, jobSearchOsSelectedReadyApplicationId: applicationId });
    const tab = await getActiveTab();
    if (!tab?.id || !tab.url) throw new Error("No active application tab found.");
    const response = await fetch(selectedAssistantPackageEndpoint(applicationId, tab.url), {
      headers: tokenHeaders(),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to load the selected application package.");
    const packagePayload = await packageWithMaterialFiles(payload);
    const result = await chrome.tabs.sendMessage(tab.id, { type: "FILL_APPLICATION_FROM_PACKAGE", package: packagePayload, auth: { token } });
    const filled = Number(result?.filled || 0);
    const skipped = Number(result?.skipped || 0);
    const uploads = Number(result?.uploads || 0);
    const uploadNeedsManual = Number(result?.uploadNeedsManual || 0);
    const generated = Number(result?.generated || 0);
    const uploadText = uploads ? ` Uploaded ${uploads} file(s).` : "";
    const generatedText = generated ? ` Generated ${generated} safe answer(s).` : "";
    const warning = uploadNeedsManual ? ` ${uploadNeedsManual} upload field(s) still need manual file selection.` : "";
    setStatus(`Filled ${filled} field(s) for ${payload.job?.company || "selected job"}.${generatedText}${uploadText} Skipped ${skipped}.${warning} Review missed fields before submitting manually.`);
    await loadReadyApplications(applicationId, tab.url);
  } catch (error) {
    setStatus(contentScriptError(error));
  } finally {
    fillSelectedApplicationButton.disabled = readyApplications.length === 0;
  }
}

captureButton.addEventListener("click", () => {
  void saveCapture();
});

applyNowButton.addEventListener("click", () => {
  void applyNow();
});

fillApplicationButton.addEventListener("click", () => {
  void fillApplicationFromPackage();
});

fillSelectedApplicationButton.addEventListener("click", () => {
  void fillSelectedApplication();
});

fields.apiUrl.addEventListener("change", () => {
  void loadReadyApplications();
});

fields.token.addEventListener("change", () => {
  void loadReadyApplications();
});

fields.readyApplications.addEventListener("change", () => {
  void chrome.storage.local.set({ jobSearchOsSelectedReadyApplicationId: fields.readyApplications.value });
});

void loadCapture();
