import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const extensionRoot = resolve(process.cwd(), "chrome-extension");

describe("Chrome extension ready application fill", () => {
  it("renders capture-first controls with collapsed application tools", () => {
    const html = readFileSync(resolve(extensionRoot, "popup.html"), "utf8");

    expect(html).toContain("Capture job");
    expect(html).toContain('id="linkedinLeadResult"');
    expect(html).toContain("Application fill tools");
    expect(html).toContain('id="readyApplications"');
    expect(html).toContain('id="fillSelectedApplication"');
    expect(html).not.toContain('id="saveLearnedFields"');
    expect(html).toContain("Fill selected ready job");
    expect(html).toContain("Fill current application");
  });

  it("loads ready applications and selected packages with extension token headers", () => {
    const script = readFileSync(resolve(extensionRoot, "popup.js"), "utf8");

    expect(script).toContain("/api/applications/ready-for-extension");
    expect(script).toContain("currentUrl");
    expect(script).toContain("/extension-package");
    expect(script).toContain("currentUrl");
    expect(script).toContain("tokenHeaders()");
    expect(script).toContain("FILL_APPLICATION_FROM_PACKAGE");
    expect(script).toContain('auth: { token }');
    expect(script).not.toContain("COLLECT_APPLICATION_FIELD_LEARNING");
    expect(script).not.toContain("/field-learning");
    expect(script).toContain("packageWithMaterialFiles");
    expect(script).toContain("resumePdfUrl");
    expect(script).toContain("coverLetterPdfUrl");
    expect(script).toContain("pass any security verification manually");
    expect(script).toContain("jobSearchOsSelectedReadyApplicationId");
    expect(script).toContain("readyApplicationForCurrentUrl");
    expect(script).toContain("loadReadyApplications(applicationId, tab.url)");
    expect(script).toContain("applyReadyApplicationToCaptureFields");
    expect(script).toContain("fields.description.value = application.description || fields.description.value");
  });

  it("explains LinkedIn lead capture results after save", () => {
    const script = readFileSync(resolve(extensionRoot, "popup.js"), "utf8");

    expect(script).toContain("setLinkedInLeadResult");
    expect(script).toContain('payload?.leadSource !== "linkedin"');
    expect(script).toContain("originalPostingQueries");
    expect(script).toContain("This is review-only until you paste job text");
    expect(script).toContain("The LinkedIn URL was kept as lead metadata");
  });

  it("attaches generated PDF files to matching upload fields", () => {
    const contentScript = readFileSync(resolve(extensionRoot, "content.js"), "utf8");

    expect(contentScript).toContain("packageMaterialFiles");
    expect(contentScript).toContain("new DataTransfer()");
    expect(contentScript).toContain("field.files = transfer.files");
    expect(contentScript).toContain("uploadNeedsManual");
    expect(contentScript).toContain("collectApplicationFieldLearning");
    expect(contentScript).toContain("sensitiveLearningDescriptor");
    expect(contentScript).toContain("valueForFieldMemory");
    expect(contentScript).toContain("memorySafeToAutofill");
    expect(contentScript).toContain("generatedFieldAnswer");
    expect(contentScript).toContain("fieldAnswerUrl");
    expect(contentScript).toContain("autoFillAllowed");
    expect(contentScript).toContain("textFromIds");
  });

  it("does not scrape full application form pages as job descriptions", () => {
    const contentScript = readFileSync(resolve(extensionRoot, "content.js"), "utf8");

    expect(contentScript).toContain("function isApplicationFormPage()");
    expect(contentScript).toContain("if (isApplicationFormPage()) return \"\"");
    expect(contentScript).toContain("description: onFormPage ? \"\"");
    expect(contentScript).toContain("function cleanPageText");
    expect(contentScript).toContain("window\\.dataLayer");
  });
});
