import { describe, expect, it } from "vitest";
import { eightfoldAdapter, parseEightfoldData, parseEightfoldJobs } from "@/lib/job-search/adapters/eightfold";

describe("parseEightfoldJobs", () => {
  it("extracts positions from smartApplyData", async () => {
    const payload = {
      branding: { companyName: "Netflix" },
      positions: [
        {
          id: 790316090215,
          posting_name: "Frontend Engineer, Media Infra Systems &amp; Observability - L4",
          location: "Los Gatos,California,United States of America",
          department: "Engineering",
          business_unit: "Streaming",
          ats_job_id: "JR40840",
          work_location_option: "onsite",
          canonicalPositionUrl: "https://explore.jobs.netflix.net/careers/job/790316090215",
        },
      ],
    };
    const html = `<code id="smartApplyData" style="display:none;">${encodeJsonAsHtml(payload)}</code>`;

    const jobs = parseEightfoldJobs(html, "Netflix Careers", new URL("https://explore.jobs.netflix.net/careers"));
    const normalized = await eightfoldAdapter.normalize(jobs[0]!);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      sourceJobId: "eightfold:JR40840",
      company: "Netflix",
      title: "Frontend Engineer, Media Infra Systems & Observability - L4",
      location: "Los Gatos,California,United States of America",
      applicationUrl: "https://explore.jobs.netflix.net/careers/job/790316090215",
    });
    expect(jobs[0]?.description).toContain("Department: Engineering");
    expect(normalized.remoteType).toBe("onsite");
  });

  it("extracts positions from API data", () => {
    const jobs = parseEightfoldData({
      branding: { companyName: "Netflix" },
      positions: [
        {
          posting_name: "Software Engineer 5 - Commerce Design System",
          location: "USA - Remote",
          ats_job_id: "JR40736",
          canonicalPositionUrl: "https://explore.jobs.netflix.net/careers/job/790315854858",
          work_location_option: "remote",
        },
      ],
    }, "Netflix Careers", new URL("https://explore.jobs.netflix.net/careers"));

    expect(jobs[0]).toMatchObject({
      sourceJobId: "eightfold:JR40736",
      company: "Netflix",
      title: "Software Engineer 5 - Commerce Design System",
      location: "USA - Remote",
    });
  });
});

function encodeJsonAsHtml(value: unknown) {
  return JSON.stringify(value).replace(/"/g, "&#34;");
}
