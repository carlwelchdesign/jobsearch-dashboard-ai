import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const extensionRoot = resolve(process.cwd(), "chrome-extension");

describe("Chrome extension ready application fill", () => {
  it("renders ready application selection controls", () => {
    const html = readFileSync(resolve(extensionRoot, "popup.html"), "utf8");

    expect(html).toContain('id="readyApplications"');
    expect(html).toContain('id="fillSelectedApplication"');
    expect(html).toContain('id="saveLearnedFields"');
    expect(html).toContain("Fill selected ready job");
  });

  it("loads ready applications and selected packages with extension token headers", () => {
    const script = readFileSync(resolve(extensionRoot, "popup.js"), "utf8");

    expect(script).toContain("/api/applications/ready-for-extension");
    expect(script).toContain("/extension-package");
    expect(script).toContain("currentUrl");
    expect(script).toContain("tokenHeaders()");
    expect(script).toContain("FILL_APPLICATION_FROM_PACKAGE");
    expect(script).toContain("COLLECT_APPLICATION_FIELD_LEARNING");
    expect(script).toContain("/field-learning");
    expect(script).toContain("packageWithMaterialFiles");
    expect(script).toContain("resumePdfUrl");
    expect(script).toContain("coverLetterPdfUrl");
    expect(script).toContain("pass any security verification manually");
  });

  it("attaches generated PDF files to matching upload fields", () => {
    const contentScript = readFileSync(resolve(extensionRoot, "content.js"), "utf8");

    expect(contentScript).toContain("packageMaterialFiles");
    expect(contentScript).toContain("new DataTransfer()");
    expect(contentScript).toContain("field.files = transfer.files");
    expect(contentScript).toContain("uploadNeedsManual");
    expect(contentScript).toContain("collectApplicationFieldLearning");
    expect(contentScript).toContain("sensitiveLearningDescriptor");
  });
});
