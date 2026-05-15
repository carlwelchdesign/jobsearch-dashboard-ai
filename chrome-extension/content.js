function textFrom(selector) {
  const element = document.querySelector(selector);
  return element?.textContent?.replace(/\s+/g, " ").trim() || "";
}

function meta(name) {
  const element = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
  return element?.getAttribute("content")?.trim() || "";
}

function detectAtsProvider(url) {
  const value = url.toLowerCase();
  if (value.includes("greenhouse.io")) return "greenhouse";
  if (value.includes("lever.co")) return "lever";
  if (value.includes("ashbyhq.com")) return "ashby";
  if (value.includes("myworkdayjobs.com")) return "workday";
  if (value.includes("workable.com")) return "workable";
  if (value.includes("smartrecruiters.com")) return "smartrecruiters";
  return "unknown";
}

function inferCompany() {
  const ats = atsSpecificFields();
  if (ats.company) return ats.company;

  const siteName = meta("og:site_name");
  if (siteName) return siteName.replace(/\s+careers?$/i, "").trim();

  const companySelectors = [
    "[data-testid='company-name']",
    ".company-name",
    ".posting-company",
    ".job-company",
    "[class*='company']"
  ];
  for (const selector of companySelectors) {
    const value = textFrom(selector);
    if (value && value.length < 120) return value;
  }
  return "";
}

function inferTitle() {
  const ats = atsSpecificFields();
  if (ats.title) return ats.title;

  const titleSelectors = [
    "h1",
    "[data-testid='job-title']",
    ".posting-headline h2",
    ".job-title",
    "[class*='job-title']"
  ];
  for (const selector of titleSelectors) {
    const value = textFrom(selector);
    if (value && value.length < 180) return value;
  }
  return document.title.split("|").map((part) => part.trim()).filter(Boolean)[0] || "";
}

function inferLocation() {
  const ats = atsSpecificFields();
  if (ats.location) return ats.location;

  const selectors = [
    "[data-testid='job-location']",
    ".location",
    ".posting-location",
    ".job-location",
    "[class*='location']"
  ];
  for (const selector of selectors) {
    const value = textFrom(selector);
    if (value && value.length < 180) return value;
  }
  return "";
}

function inferDescription() {
  const ats = atsSpecificFields();
  if (ats.description) return ats.description;

  const selection = window.getSelection()?.toString()?.replace(/\s+/g, " ").trim();
  if (selection && selection.length > 80) return selection;

  const selectors = [
    "[data-testid='job-description']",
    ".job-description",
    ".posting-description",
    ".description",
    "main",
    "article"
  ];
  for (const selector of selectors) {
    const value = textFrom(selector);
    if (value && value.length > 160) return value.slice(0, 50000);
  }
  return document.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 50000) || "";
}

function atsSpecificFields() {
  const provider = detectAtsProvider(window.location.href);
  if (provider === "greenhouse") return greenhouseFields();
  if (provider === "lever") return leverFields();
  if (provider === "ashby") return ashbyFields();
  return {};
}

function greenhouseFields() {
  return {
    title: textFrom(".app-title") || textFrom("h1"),
    company: textFrom(".company-name") || cleanCompanyFromTitle(document.title),
    location: textFrom(".location"),
    description: textFrom("#content") || textFrom(".job__description") || textFrom("main")
  };
}

function leverFields() {
  return {
    title: textFrom(".posting-headline h2") || textFrom("h1"),
    company: textFrom(".main-header-logo img") || cleanCompanyFromTitle(document.title),
    location: textFrom(".posting-categories .location") || textFrom(".sort-by-location"),
    description: textFrom(".posting-page") || textFrom(".section-wrapper") || textFrom("main")
  };
}

function ashbyFields() {
  return {
    title: textFrom("[data-testid='job-title']") || textFrom("h1"),
    company: meta("og:site_name") || cleanCompanyFromTitle(document.title),
    location: textFrom("[data-testid='job-location']") || textFrom("[class*='location']"),
    description: textFrom("[data-testid='job-description']") || textFrom("[class*='jobPosting']") || textFrom("main")
  };
}

function cleanCompanyFromTitle(title) {
  const parts = title.split("|").map((part) => part.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return last.replace(/\s+careers?$/i, "").trim();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CAPTURE_JOB_PAGE") return false;

  sendResponse({
    pageUrl: window.location.href,
    pageTitle: document.title,
    applicationUrl: window.location.href,
    title: inferTitle(),
    company: inferCompany(),
    location: inferLocation(),
    description: inferDescription(),
    selectedText: window.getSelection()?.toString()?.trim() || "",
    atsProvider: detectAtsProvider(window.location.href),
    metadata: {
      capturedAt: new Date().toISOString(),
      referrer: document.referrer || null
    }
  });
  return true;
});
