import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Resume review approval handoff", () => {
  it("shows approval completion feedback before forwarding to search profiles", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/(workspace)/resumes/review/review-client.tsx"), "utf8");

    expect(source).toContain('notice: "Approval complete. Candidate profile is active and the agent review finished."');
    expect(source).toContain('push("/profiles?resumeApproved=1")');
    expect(source).toContain('window.setTimeout(() =>');
    expect(source).toContain('disabled={approving || redirectingAfterApproval}');
    expect(source).toContain('"Opening profiles..."');
  });
});
