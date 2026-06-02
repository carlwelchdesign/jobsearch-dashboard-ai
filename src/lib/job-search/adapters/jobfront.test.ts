import { describe, expect, it } from "vitest";
import { parseJobFrontJobs } from "@/lib/job-search/adapters/jobfront";

describe("parseJobFrontJobs", () => {
  it("extracts public JobFront job cards", () => {
    const html = `
      <a href="/organizations/nexla/jobs/product-manager-bay-area-J29e836ef288c410391a9df3e68f532e3_ODefenseTechJobsfMgO449pvH" id="job_J29e836ef288c410391a9df3e68f532e3_ODefenseTechJobsfMgO449pvH">
        <div id="J29e836ef288c410391a9df3e68f532e3_ODefenseTechJobsfMgO449pvH">Product Manager, Bay Area <span>Product</span></div>
        <a style="font-family: SF-UI-Display-Regular;">Lead product strategy and execution for Nexla&#39;s AI-native data integration platform</a>
        <div style="font-size:14px;line-height:20px;">$150,000 - 180,000 USD / year</div>
        <div style="color:#4b587c;">an hour ago - San Mateo, California, United States</div>
      </a>
    `;

    const jobs = parseJobFrontJobs(html, new URL("https://jobs.frontdoordefense.com"), "Defense Tech Jobs");

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      sourceJobId: "J29e836ef288c410391a9df3e68f532e3_ODefenseTechJobsfMgO449pvH",
      company: "Nexla",
      title: "Product Manager, Bay Area",
      location: "San Mateo, California, United States",
      applicationUrl: "https://jobs.frontdoordefense.com/organizations/nexla/jobs/product-manager-bay-area-J29e836ef288c410391a9df3e68f532e3_ODefenseTechJobsfMgO449pvH",
    });
    expect(jobs[0]?.description).toContain("AI-native data integration platform");
    expect(jobs[0]?.description).toContain("$150,000 - 180,000 USD / year");
  });
});
