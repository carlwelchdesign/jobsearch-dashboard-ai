import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("ResumeUploadClient", () => {
  it("redirects successful uploads to the resume review page", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/(workspace)/resumes/upload/upload-client.tsx"), "utf8");

    expect(source).toContain('router.push("/resumes/review")');
    expect(source).not.toContain("Extracted text preview");
  });
});
