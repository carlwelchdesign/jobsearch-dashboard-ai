import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AssistantWorkbench run feedback panel", () => {
  const assistantPagePath = "src/app/(workspace)/applications/assistant/page.tsx";
  const assistantWorkbenchPath = "src/app/(workspace)/applications/assistant/assistant-workbench.tsx";

  it("renders structured diagnostics, timeline, and raw log fallback", () => {
    const source = readFileSync(resolve(process.cwd(), assistantWorkbenchPath), "utf8");

    expect(source).toContain("AssistantRunPanel");
    expect(source).toContain("Event timeline");
    expect(source).toContain("Raw log");
    expect(source).toContain("diagnostics");
    expect(source).toContain("timeline");
    expect(source).toContain("setInterval");
    expect(source).toContain("Copy raw log");
    expect(source).toContain("Review learned fields");
    expect(source).toContain("activeForAutofill");
    expect(source).toContain("needsReview");
    expect(source).toContain("Ignored");
  });

  it("advances the ready application selection after marking applied", () => {
    const source = readFileSync(resolve(process.cwd(), assistantWorkbenchPath), "utf8");

    expect(source).toContain("const [appliedIds, setAppliedIds]");
    expect(source).toContain("!appliedIds.includes(application.id)");
    expect(source).toContain("setSelectedId(nextApplication?.id ?? \"\")");
    expect(source).toContain("I applied");
    expect(source).not.toContain("I already applied");
  });

  it("uses smart job summaries for ready application detail text", () => {
    const pageSource = readFileSync(resolve(process.cwd(), assistantPagePath), "utf8");
    const workbenchSource = readFileSync(resolve(process.cwd(), assistantWorkbenchPath), "utf8");

    expect(pageSource).toContain("description: application.jobPosting.description");
    expect(workbenchSource).toContain("description: string | null");
    expect(workbenchSource).toContain("summarizeReadyJobDescription");
    expect(workbenchSource).toContain("summarizeApplicationJobDescription");
    expect(workbenchSource).toContain("detail: summarizeReadyJobDescription(application)");
    expect(workbenchSource).not.toContain("Materials are ready. Launch the assistant when you are ready to work this item.");
  });

  it("keeps the next application first and moves visibility diagnostics into details", () => {
    const pageSource = readFileSync(resolve(process.cwd(), assistantPagePath), "utf8");
    const workbenchSource = readFileSync(resolve(process.cwd(), assistantWorkbenchPath), "utf8");

    expect(pageSource).toContain("buildApplySprintTrustFunnel");
    expect(pageSource).toContain("trustFunnel={trustFunnel}");
    expect(workbenchSource).toContain("Next application");
    expect(workbenchSource).toContain("Complete the selected application");
    expect(workbenchSource).toContain("Details and recovery");
    expect(workbenchSource).toContain("QueueProgressTable");
    expect(workbenchSource).toContain("Autocomplete");
    expect(workbenchSource).toContain("Queue progress table");
    expect(workbenchSource).toContain("Search queue");
    expect(workbenchSource).toContain("Show full queue");
    expect(workbenchSource).toContain("TableContainer");
    expect(workbenchSource).toContain("Assistant run details");
    expect(workbenchSource).toContain("Search-to-Apply visibility");
    expect(workbenchSource).toContain("Search-to-Apply Sprint funnel");
    expect(workbenchSource).toContain("Ready (");
    expect(workbenchSource).toContain("Candidates (");
    expect(workbenchSource).toContain("Agency Results (");
    expect(workbenchSource).toContain("Search agency results");
    expect(workbenchSource).toContain("Agency results table");
    expect(workbenchSource).toContain("Show all agency results");
    expect(workbenchSource).toContain("Hidden / Suppressed (");
    expect(workbenchSource).toContain("Prepare selected");
    expect(workbenchSource).toContain("Run agency for visible candidates");
    expect(workbenchSource).toContain("/api/applications/assistant/prepare-candidates");
    expect(workbenchSource).toContain("packet generation failed");
  });

  it("keeps all ready applications visible and explains non-launchable items", () => {
    const pageSource = readFileSync(resolve(process.cwd(), assistantPagePath), "utf8");
    const workbenchSource = readFileSync(resolve(process.cwd(), assistantWorkbenchPath), "utf8");

    expect(pageSource).toContain('status: "ready_to_apply"');
    expect(pageSource).not.toContain("resumeId: { not: null }");
    expect(pageSource).not.toContain("coverLetterId: { not: null }");
    expect(pageSource).not.toContain('applicationUrl: { not: null }');
    expect(pageSource).not.toContain("submittedApplicationJobKeySet");
    expect(pageSource).not.toContain("!hasApplicationForJob");
    expect(pageSource).not.toContain("applicationMaterialQualityDetail(application.coverLetter?.generationNotes).launchable");
    expect(workbenchSource).toContain("Add application URL");
    expect(workbenchSource).toContain("Review packet");
    expect(workbenchSource).toContain("Open manually");
    expect(workbenchSource).toContain("isUnsupportedAssistantUrl");
  });
});
