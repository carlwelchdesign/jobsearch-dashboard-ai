import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ApplicationPacketPage", () => {
  const pagePath = "src/app/(workspace)/applications/[id]/page.tsx";

  it("renders the saved job description on the application detail page", () => {
    const source = readFileSync(resolve(process.cwd(), pagePath), "utf8");

    expect(source).toContain("title=\"Job description\"");
    expect(source).toContain("body={application.jobPosting.description}");
    expect(source).toContain("format=\"description\"");
    expect(source).toContain("FormattedJobDescription");
    expect(source).toContain("formattedDescriptionBlocks");
    expect(source).toContain("No job description saved");
    expect(source).toContain("application.jobPosting.source?.baseUrl");
  });

  it("offers a regenerate materials control for reviewing fresh CV and cover letter output", () => {
    const source = readFileSync(resolve(process.cwd(), pagePath), "utf8");

    expect(source).toContain("Material repair");
    expect(source).toContain("Fix material issues");
    expect(source).toContain("/material-review/repair");
    expect(source).toContain("Agents fix blocked resume and cover-letter issues before this application enters Apply Sprint.");
    expect(source).toContain("Regenerate materials");
    expect(source).toContain("RefreshOutlinedIcon");
    expect(source).toContain("/regenerate-materials");
  });

  it("shows ATS resume review output on the application detail page", () => {
    const source = readFileSync(resolve(process.cwd(), pagePath), "utf8");

    expect(source).toContain("AtsResumeReviewCard");
    expect(source).toContain("ATS resume review");
    expect(source).toContain("Missing important keywords");
    expect(source).toContain("Recruiter red flags");
    expect(source).toContain("Format warnings");
  });

  it("renders generated resumes through the selected resume preview format", () => {
    const source = readFileSync(resolve(process.cwd(), pagePath), "utf8");

    expect(source).toContain("ResumePreview");
    expect(source).toContain("format={application.user.profile?.resumeFormat}");
    expect(source).toContain("application.resume.plainText ?? application.resume.markdown");
  });

  it("renders the action-first Apply Workspace shell", () => {
    const source = readFileSync(resolve(process.cwd(), pagePath), "utf8");

    expect(source).toContain("eyebrow=\"Apply Workspace\"");
    expect(source).toContain("getApplyWorkspacePrimaryAction");
    expect(source).toContain("postTo={action.postTo}");
    expect(source).toContain("loadingLabel=\"Preparing...\"");
    expect(source).toContain("Recommended next step");
    expect(source).toContain("Assistant can fill fields, upload materials, and stop at the final review screen. You submit manually.");
    expect(source).toContain("WorkspaceNav");
    expect(source).toContain('["#material-repair", "Material repair"]');
    expect(source).toContain('["#materials", "Materials"]');
    expect(source).toContain('["#history", "History"]');
  });
});
