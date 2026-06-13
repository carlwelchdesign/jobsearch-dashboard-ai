import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("LinkedInContentClient UI contract", () => {
  const source = readFileSync("src/app/linkedin-content/linkedin-content-client.tsx", "utf8");

  it("exposes copy, download, archive, and privacy-gated screenshot controls", () => {
    expect(source).toContain("Copy post");
    expect(source).toContain("Archive");
    expect(source).toContain("Safe screenshot attachments");
    expect(source).toContain("Screenshot downloads are blocked");
    expect(source).toContain("Privacy review passed");
    expect(source).toContain("disabled={draft.privacyReview.status !== \"PASS\"}");
  });
});
