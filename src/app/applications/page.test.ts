import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("/applications page agency workflow", () => {
  it("uses the recruiting agency flow instead of the manual add-application dropdown", () => {
    const pageSource = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8");

    expect(pageSource).toContain("Agency command center");
    expect(pageSource).toContain("Primary workflow");
    expect(pageSource).toContain("Application operations");
    expect(pageSource).toContain("Move approved applications into Apply Sprint");
    expect(pageSource).toContain("Prepare high-score approved matches");
    expect(pageSource).toContain("/api/applications/agency/run");
    expect(pageSource).toContain("/api/applications/next-ready/launch-assistant");
    expect(pageSource).toContain("/applications/assistant");
    expect(pageSource).not.toContain("ApplicationCreateForm");
  });

  it("prompts for rejection feedback from the applications board", () => {
    const buttonSource = readFileSync(fileURLToPath(new URL("./application-delete-button.tsx", import.meta.url)), "utf8");

    expect(buttonSource).toContain("RejectionReasonDialog");
    expect(buttonSource).toContain("applications_rejection_reason_prompt");
    expect(buttonSource).toContain("onSkip={() => remove([], \"\")}");
    expect(buttonSource).not.toContain("window.confirm");
  });
});
