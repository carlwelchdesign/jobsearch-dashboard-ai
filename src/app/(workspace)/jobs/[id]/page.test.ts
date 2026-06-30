import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("JobDetailPage", () => {
  const pagePath = "src/app/(workspace)/jobs/[id]/page.tsx";

  it("hands off to the canonical application workspace when a tracker exists", () => {
    const source = readFileSync(resolve(process.cwd(), pagePath), "utf8");

    expect(source).toContain("selectCanonicalApplicationForJob");
    expect(source).toContain("redirect(`/applications/${canonicalApplication.id}`)");
    expect(source).not.toContain('where: { status: "ready_to_apply" }');
  });
});
