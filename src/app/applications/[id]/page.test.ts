import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ApplicationPacketPage", () => {
  it("renders the saved job description on the application detail page", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/applications/[id]/page.tsx"), "utf8");

    expect(source).toContain("title=\"Job description\"");
    expect(source).toContain("body={application.jobPosting.description}");
    expect(source).toContain("format=\"description\"");
    expect(source).toContain("FormattedJobDescription");
    expect(source).toContain("formattedDescriptionBlocks");
    expect(source).toContain("No job description saved");
    expect(source).toContain("application.jobPosting.source?.baseUrl");
  });

  it("offers a regenerate materials control for reviewing fresh CV and cover letter output", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/applications/[id]/page.tsx"), "utf8");

    expect(source).toContain("Regenerate materials");
    expect(source).toContain("RefreshOutlinedIcon");
    expect(source).toContain("/regenerate-materials");
  });
});
