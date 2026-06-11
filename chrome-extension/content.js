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
  if (message?.type === "FILL_APPLICATION_FROM_PACKAGE") {
    sendResponse(fillApplicationFromPackage(message.package || {}));
    return true;
  }

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

function fillApplicationFromPackage(assistantPackage) {
  const values = packageValues(assistantPackage);
  const materialFiles = packageMaterialFiles(assistantPackage);
  const result = { filled: 0, skipped: 0, uploads: 0, uploadNeedsManual: 0 };
  const fields = Array.from(document.querySelectorAll("input:not([type=hidden]), textarea, select"));
  for (const field of fields) {
    if (!isFillable(field)) {
      result.skipped += 1;
      continue;
    }
    if (field.type === "file") {
      const descriptor = fieldDescriptor(field);
      const files = filesForUploadField(descriptor, field, materialFiles);
      if (files.length && attachFiles(field, files)) {
        result.uploads += files.length;
      } else {
        highlightUpload(field);
        result.uploadNeedsManual += 1;
      }
      continue;
    }
    const descriptor = fieldDescriptor(field);
    const value = valueForDescriptor(descriptor, values, field);
    if (!value) {
      result.skipped += 1;
      continue;
    }
    if (fillField(field, value)) result.filled += 1;
  }
  return result;
}

function packageMaterialFiles(assistantPackage) {
  const files = Array.isArray(assistantPackage.materialFiles) ? assistantPackage.materialFiles : [];
  return files.map((file) => materialFileFromPayload(file)).filter(Boolean);
}

function materialFileFromPayload(file) {
  const dataUrl = String(file?.dataUrl || "");
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl);
  if (!match) return null;
  const mimeType = String(file?.mimeType || match[1] || "application/pdf");
  const name = String(file?.name || `${file?.kind || "material"}.pdf`);
  const bytes = match[2] ? bytesFromBase64(match[3]) : new TextEncoder().encode(decodeURIComponent(match[3]));
  return {
    kind: file?.kind === "coverLetter" ? "coverLetter" : "resume",
    file: new File([bytes], name, { type: mimeType }),
  };
}

function bytesFromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function filesForUploadField(descriptor, field, materialFiles) {
  const resume = materialFiles.find((item) => item.kind === "resume");
  const coverLetter = materialFiles.find((item) => item.kind === "coverLetter");
  if (/\bcover\b|\bletter\b/.test(descriptor) && coverLetter) return [coverLetter.file];
  if (/\bcv\b|\br[eé]sum[eé]\b|\bresume\b/.test(descriptor) && resume) return [resume.file];
  if (field.multiple) return materialFiles.map((item) => item.file);
  return resume ? [resume.file] : [];
}

function attachFiles(field, files) {
  try {
    const transfer = new DataTransfer();
    const accepted = files.filter((file) => uploadAcceptsFile(field, file));
    for (const file of accepted) transfer.items.add(file);
    if (!transfer.files.length) return false;
    field.files = transfer.files;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.style.outline = "3px solid #0f6b4f";
    field.title = `${transfer.files.length} prepared Job Search OS file(s) attached. Review before submitting.`;
    return true;
  } catch {
    return false;
  }
}

function uploadAcceptsFile(field, file) {
  const accept = String(field.accept || "").trim();
  if (!accept) return true;
  const entries = accept.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return entries.some((entry) => {
    if (entry === "*/*") return true;
    if (entry.endsWith("/*")) return type.startsWith(entry.slice(0, -1));
    if (entry.startsWith(".")) return name.endsWith(entry);
    return type === entry;
  });
}

function packageValues(assistantPackage) {
  const candidate = assistantPackage.candidate || {};
  const materials = assistantPackage.materials || {};
  return {
    fullName: candidate.fullName || "",
    firstName: candidate.firstName || "",
    lastName: candidate.lastName || "",
    email: candidate.email || "",
    phone: candidate.phone || "",
    location: candidate.location || "",
    linkedinUrl: candidate.linkedinUrl || "",
    githubUrl: candidate.githubUrl || "",
    portfolioUrl: candidate.portfolioUrl || "",
    coverLetter: materials.coverLetterBody || "",
    selectedAnswers: Array.isArray(materials.selectedApplicationAnswers) ? materials.selectedApplicationAnswers : []
  };
}

function isFillable(field) {
  if (field.disabled || field.readOnly) return false;
  const type = String(field.type || "").toLowerCase();
  return !["password", "submit", "button", "reset", "checkbox", "radio"].includes(type);
}

function fieldDescriptor(field) {
  const parts = [
    field.id,
    field.name,
    field.placeholder,
    field.getAttribute("aria-label"),
    field.closest("label")?.textContent,
    labelFor(field),
    field.closest("fieldset")?.textContent?.slice(0, 500)
  ];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim().toLowerCase();
}

function labelFor(field) {
  if (!field.id) return "";
  return document.querySelector(`label[for="${CSS.escape(field.id)}"]`)?.textContent || "";
}

function valueForDescriptor(descriptor, values, field) {
  const selected = answerForSelectedQuestion(descriptor, values.selectedAnswers);
  if (selected) return selected;
  if (/\bfirst\b.*\bname\b|\bgiven\b.*\bname\b/.test(descriptor)) return values.firstName;
  if (/\blast\b.*\bname\b|\bfamily\b.*\bname\b|\bsurname\b/.test(descriptor)) return values.lastName;
  if (/\bfull\b.*\bname\b|^name\b|\bname$/.test(descriptor)) return values.fullName;
  if (/\bemail\b/.test(descriptor)) return values.email;
  if (/\bphone\b|\bmobile\b|\btel\b/.test(descriptor)) return values.phone;
  if (/\blinkedin\b/.test(descriptor)) return values.linkedinUrl;
  if (/\bgithub\b/.test(descriptor)) return values.githubUrl;
  if (/\bportfolio\b|\bwebsite\b|\bpersonal site\b/.test(descriptor)) return values.portfolioUrl;
  if (/\blocation\b|\bcity\b|\baddress\b/.test(descriptor)) return values.location;
  if (/\bcover letter\b|why.*join|why.*team|why.*company|tell us why/.test(descriptor)) return values.coverLetter;
  if (field.tagName === "TEXTAREA" && /additional|anything else|message|note/.test(descriptor)) return "";
  return "";
}

function answerForSelectedQuestion(descriptor, selectedAnswers) {
  for (const item of selectedAnswers) {
    const question = String(item.question || "").toLowerCase();
    if (!question) continue;
    const tokens = question.split(/[^a-z0-9]+/).filter((token) => token.length > 3);
    const overlap = tokens.filter((token) => descriptor.includes(token)).length;
    if (overlap >= Math.min(3, tokens.length)) return item.answer || "";
  }
  return "";
}

function fillField(field, value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (field.tagName === "SELECT") return selectOption(field, text);
  field.focus();
  field.value = text;
  field.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function selectOption(field, value) {
  const normalized = value.toLowerCase();
  const option = Array.from(field.options || []).find((candidate) => {
    const text = `${candidate.textContent || ""} ${candidate.value || ""}`.toLowerCase();
    return text.includes(normalized) || normalized.includes(text.trim());
  });
  if (!option) return false;
  field.value = option.value;
  field.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function highlightUpload(field) {
  field.style.outline = "3px solid #946200";
  field.title = "Upload the prepared resume or cover letter from Job Search OS, then submit manually.";
}
