import { describe, expect, it } from "vitest";
import { parseResumeHeuristically } from "@/lib/resumes/parse";

describe("parseResumeHeuristically", () => {
  it("parses generated resume sections without treating summary or skills text as work history", () => {
    const parsed = parseResumeHeuristically(`
Carl Welch
carl@example.com | 1-805-403-4819
SUMMARY
Senior Software Engineer with 20+ years of experience building enterprise web applications, developer platforms, mobile apps, analytics tools, media systems, campaign platforms, and internal workflow automation.
Strong background in React, TypeScript, Node.js, API integrations, frontend architecture, test automation, component systems, and customer-facing product workflows.
CORE SKILLS
React, TypeScript, JavaScript, Node.js, API Design, REST APIs, Backend-for-Frontend, Material UI, Storybook, Jest, Playwright
PROFESSIONAL EXPERIENCE
Yubico - Senior Software Engineer
| Jul 2022 - Mar 2026
Skills:
React, TypeScript, Node.js, AWS, Material UI, Storybook, Jest, Playwright, API Integrations
- Built enterprise admin console features supporting YubiKey management, provisioning flows, inventory/shipping workflows, and device lifecycle management.
- Increased test automation by 50% using Jest and Playwright while reducing QA time, regressions, support issues, and release risk.
Revenue.io - Senior Software Engineer | Mar 2020 - Jul 2022
Skills: React, TypeScript, Node.js, Backend-for-Frontend, Backbone, Docker, Jest, Storybook
- Built analytics dashboards, call workflows, reporting views, admin tools, and customer-facing SaaS interfaces.
EDUCATION
Virginia Commonwealth University - Bachelor of Fine Arts
`);

    expect(parsed.professionalSummary).toContain("Senior Software Engineer with 20+ years");
    expect(parsed.professionalSummary).not.toContain("CORE SKILLS");
    expect(parsed.professionalSummary).not.toContain("PROFESSIONAL EXPERIENCE");
    expect(parsed.workExperience).toEqual(expect.arrayContaining([
      expect.objectContaining({
        company: "Yubico",
        title: "Senior Software Engineer",
        startDate: "Jul 2022",
        endDate: "Mar 2026",
        skills: expect.arrayContaining(["React", "TypeScript", "Storybook", "Playwright"]),
        achievements: expect.arrayContaining([
          expect.stringContaining("Built enterprise admin console features"),
          expect.stringContaining("Increased test automation by 50%"),
        ]),
      }),
      expect.objectContaining({
        company: "Revenue.io",
        title: "Senior Software Engineer",
        startDate: "Mar 2020",
        endDate: "Jul 2022",
        skills: expect.arrayContaining(["Backend-for-Frontend", "Docker"]),
      }),
    ]));
    expect(parsed.workExperience.map((work) => work.company)).not.toContain("Senior Software Engineer with 20+ years of experience building enterprise web applications");
    expect(parsed.workExperience.map((work) => work.company)).not.toContain("React");
    expect(parsed.experienceBullets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        company: "Yubico",
        role: "Senior Software Engineer",
        text: expect.stringContaining("Built enterprise admin console features"),
      }),
    ]));
  });
});
