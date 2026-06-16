import { describe, expect, it } from "vitest";
import { assessApplicationUrlQuality, atsProviderFromApplicationUrl, isLaunchableApplicationUrl } from "@/lib/applications/application-url-quality";

describe("application URL quality", () => {
  it("accepts direct ATS and employer application URLs", () => {
    const urls = [
      "https://jobs.ashbyhq.com/acme/abc-123/application",
      "https://job-boards.greenhouse.io/acme/jobs/123",
      "https://jobs.lever.co/acme/abc-123/apply",
      "https://company.example.com/careers/frontend-engineer/apply",
      "https://careers.datadoghq.com/detail/7346437/?gh_jid=7346437",
    ];

    for (const url of urls) {
      expect(assessApplicationUrlQuality(url)).toMatchObject({
        kind: "direct",
        launchable: true,
      });
    }
  });

  it("rejects missing, invalid, and non-http URLs", () => {
    expect(assessApplicationUrlQuality(null)).toMatchObject({ kind: "missing", launchable: false });
    expect(assessApplicationUrlQuality("not a url")).toMatchObject({ kind: "invalid", launchable: false });
    expect(assessApplicationUrlQuality("javascript:alert(1)")).toMatchObject({ kind: "invalid", launchable: false });
  });

  it("rejects board, intermediary, auth, and paywall URLs", () => {
    const urls = [
      "https://builtin.com/job/frontend-engineer/8269411",
      "https://www.workingnomads.com/job/go/1641405/",
      "https://wellfound.com/jobs/3891101-frontend-engineer",
      "https://www.remoterocketship.com/company/phantom/jobs/software-engineer-frontend/",
      "https://remotive.com/remote-jobs/software-dev/senior-frontend-engineer-123",
      "https://remoteok.com/remote-jobs/123",
      "https://www.dice.com/job-detail/1c463470-ecc8-45a0-b1a7-8c72c6fcafd9",
      "https://www.indeed.com/viewjob?jk=abc123def456",
      "https://www.ziprecruiter.com/jobs/acme/frontend-engineer",
    ];

    for (const url of urls) {
      expect(isLaunchableApplicationUrl(url)).toBe(false);
    }
  });

  it("rejects generic search and listing URLs", () => {
    expect(assessApplicationUrlQuality("https://example-board.test/jobs/search?page=1&query=frontend")).toMatchObject({
      kind: "listing",
      launchable: false,
    });
    expect(assessApplicationUrlQuality("https://company.example.com/careers/search?location=remote&q=frontend")).toMatchObject({
      kind: "listing",
      launchable: false,
    });
  });

  it("rejects analytics, tracking, and static asset URLs", () => {
    expect(assessApplicationUrlQuality("https://www.googletagmanager.com/gtm.js?id=GTM-123")).toMatchObject({
      kind: "non_application",
      launchable: false,
    });
    expect(assessApplicationUrlQuality("https://www.speedtest.net/")).toMatchObject({
      kind: "non_application",
      launchable: false,
    });
    expect(assessApplicationUrlQuality("https://company.example.com/static/apply.js")).toMatchObject({
      kind: "non_application",
      launchable: false,
    });
  });

  it("detects supported ATS providers from URLs", () => {
    expect(atsProviderFromApplicationUrl("https://jobs.ashbyhq.com/acme/abc/application")).toBe("ashby");
    expect(atsProviderFromApplicationUrl("https://boards.greenhouse.io/acme/jobs/123")).toBe("greenhouse");
    expect(atsProviderFromApplicationUrl("https://jobs.lever.co/acme/abc/apply")).toBe("lever");
    expect(atsProviderFromApplicationUrl("https://company.example.com/careers/apply")).toBe("other");
    expect(atsProviderFromApplicationUrl(null)).toBe("unknown");
  });
});
