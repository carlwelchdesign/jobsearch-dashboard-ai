import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AssistantWorkbench run feedback panel", () => {
  it("renders structured diagnostics, timeline, and raw log fallback", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/applications/assistant/assistant-workbench.tsx"), "utf8");

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
    const source = readFileSync(resolve(process.cwd(), "src/app/applications/assistant/assistant-workbench.tsx"), "utf8");

    expect(source).toContain("const [appliedIds, setAppliedIds]");
    expect(source).toContain("!appliedIds.includes(application.id)");
    expect(source).toContain("setSelectedId(nextApplication?.id ?? \"\")");
    expect(source).toContain("I applied");
    expect(source).not.toContain("I already applied");
  });

  it("uses smart job summaries for ready application detail text", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/app/applications/assistant/page.tsx"), "utf8");
    const workbenchSource = readFileSync(resolve(process.cwd(), "src/app/applications/assistant/assistant-workbench.tsx"), "utf8");

    expect(pageSource).toContain("description: application.jobPosting.description");
    expect(workbenchSource).toContain("description: string | null");
    expect(workbenchSource).toContain("summarizeReadyJobDescription");
    expect(workbenchSource).toContain("summarizeApplicationJobDescription");
    expect(workbenchSource).toContain("detail: summarizeReadyJobDescription(application)");
    expect(workbenchSource).not.toContain("Materials are ready. Launch the assistant when you are ready to work this item.");
  });
});
