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
  });
});
