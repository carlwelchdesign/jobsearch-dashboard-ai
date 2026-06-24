import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("/applications page agency workflow", () => {
  it("uses the recruiting agency flow instead of the manual add-application dropdown", () => {
    const pageSource = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8");

    expect(pageSource).toContain("Agency command center");
    expect(pageSource).toContain("Primary workflow");
    expect(pageSource).toContain("Application operations");
    expect(pageSource).toContain("Recover approved applications into Apply Sprint");
    expect(pageSource).toContain("Prepare eligible saved matches directly for Apply Sprint.");
    expect(pageSource).toContain("/api/applications/agency/run");
    expect(pageSource).toContain("minimumScore: 0");
    expect(pageSource).toContain("/api/applications/next-ready/launch-assistant");
    expect(pageSource).toContain("/applications/assistant");
    expect(pageSource).toContain("These applications are already in Apply Sprint.");
    expect(pageSource).toContain("Open {items.length} in Apply Sprint");
    expect(pageSource).toContain("No applications are currently in Apply Sprint.");
    expect(pageSource).not.toContain("Review jobs first");
    expect(pageSource).not.toContain("ApplicationCreateForm");
  });

  it("prompts for rejection feedback from the applications board", () => {
    const buttonSource = readFileSync(fileURLToPath(new URL("./application-delete-button.tsx", import.meta.url)), "utf8");

    expect(buttonSource).toContain("RejectionReasonDialog");
    expect(buttonSource).toContain("applications_rejection_reason_prompt");
    expect(buttonSource).toContain("onSkip={() => remove([], \"\")}");
    expect(buttonSource).not.toContain("window.confirm");
  });

  it("offers job unavailable as a structured rejection reason", () => {
    const dialogSource = readFileSync(resolve(process.cwd(), "src/components/job-reject-button.tsx"), "utf8");

    expect(dialogSource).toContain('"job_unavailable"');
    expect(dialogSource).toContain('label: "Job unavailable"');
  });
});
