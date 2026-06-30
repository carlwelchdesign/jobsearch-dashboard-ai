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
    expect(pageSource).toContain("Prepare approved applications for Apply");
    expect(pageSource).toContain("Approved to Ready");
    expect(pageSource).toContain("Ready to apply means it has a direct application URL plus launchable resume and cover-letter materials.");
    expect(pageSource).toContain("Prepare approved for Ready to apply");
    expect(pageSource).toContain("This also archives approved items without direct URLs.");
    expect(pageSource).toContain("material-blocked");
    expect(pageSource).toContain('"material_blocked"');
    expect(pageSource).toContain("applicationBoardColumn");
    expect(pageSource).toContain("These are approved and still eligible for packet prep.");
    expect(pageSource).toContain("These passed job review, but their generated materials failed QA or generation.");
    expect(pageSource).toContain("Fix material issue");
    expect(pageSource).toContain("View repair details");
    expect(pageSource).toContain("Fix material issues");
    expect(pageSource).toContain("/material-review/repair");
    expect(pageSource).toContain('queue="material_blocked"');
    expect(pageSource).toContain("Agents are repairing blocked resumes and cover letters.");
    expect(pageSource).toContain("Archives on prep: no direct employer/ATS URL");
    expect(pageSource).toContain("classifyApplicationPrepReadiness");
    expect(pageSource).toContain("Add direct URLs first");
    expect(pageSource).toContain("ApplicationPrepChecklist");
    expect(pageSource).toContain("Prepare eligible saved matches directly for Apply Sprint.");
    expect(pageSource).toContain("/api/applications/agency/run");
    expect(pageSource).toContain("minimumScore: 0");
    expect(pageSource).toContain("/api/applications/next-ready/launch-assistant");
    expect(pageSource).toContain("/applications/assistant");
    expect(pageSource).toContain("These applications are already in Apply Sprint.");
    expect(pageSource).toContain("Open {items.length} in Apply Sprint");
    expect(pageSource).toContain("No applications are currently in Apply Sprint.");
    expect(pageSource.indexOf("if (approvedCount > 0)")).toBeLessThan(pageSource.indexOf("if (agencyCandidateCount > 0)"));
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
