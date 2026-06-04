import type { JobSearchProfile } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { scoreJobForProfile } from "@/lib/job-search/scoring";

describe("scoreJobForProfile", () => {
  function seniorFrontendProfile(overrides: Partial<JobSearchProfile> = {}) {
    return {
      name: "Senior Frontend IC",
      titles: ["Senior Frontend Engineer", "Senior UI Engineer", "Senior Full Stack Engineer"],
      keywordsRequired: [],
      keywordsPreferred: ["React", "TypeScript", "frontend", "UI", "web", "product UI", "dashboards", "design systems", "accessibility", "API integrations"],
      keywordsExcluded: [],
      excludedCompanies: [],
      excludedTitles: ["Staff", "Principal", "Lead", "Manager", "Director", "Architect", "Advocate", "DevRel", "Data Engineer", "Backend Engineer", "Solutions", "Transformation"],
      industries: [],
      includeUnknownSalary: true,
      minimumMatchScore: 75,
      remotePreference: "remote_us_only",
      relocationPreference: "unknown",
      countries: ["United States"],
      ...overrides,
    } as unknown as JobSearchProfile;
  }

  it("scores senior frontend IC roles as strong matches", () => {
    const profile = seniorFrontendProfile();

    const score = scoreJobForProfile({
      company: "SaaS Co",
      title: "Senior Frontend Engineer",
      location: "Remote, United States",
      description: "Build React and TypeScript product UI, dashboards, design system components, accessibility improvements, and API integrations for SaaS workflows.",
    }, profile);

    expect(score.overallScore).toBeGreaterThanOrEqual(85);
    expect(score.concerns).not.toContain("Staff, principal, lead, manager, director, or architect seniority is outside the Senior Frontend IC target.");
  });

  it("penalizes staff, principal, lead, and manager roles even when frontend-adjacent", () => {
    const profile = seniorFrontendProfile();
    const titles = [
      "Staff Engineer - Frontend",
      "Principal Software Engineer, Frontend Platform",
      "Lead Frontend Engineer",
      "Senior Manager, Engineering - Platform Security",
    ];

    const scores = titles.map((title) => scoreJobForProfile({
      company: "SaaS Co",
      title,
      location: "Remote, United States",
      description: "React TypeScript frontend UI dashboard and API integrations.",
    }, profile));

    for (const score of scores) {
      expect(score.overallScore).toBeLessThan(profile.minimumMatchScore);
      expect(score.concerns).toContain("Staff, principal, lead, manager, director, or architect seniority is outside the Senior Frontend IC target.");
    }
  });

  it("allows staff UI and accessibility roles when the profile explicitly targets staff titles", () => {
    const profile = seniorFrontendProfile({
      titles: [
        "Senior Frontend Engineer",
        "Staff UI Software Engineer",
        "Staff Software Engineer, Accessibility",
      ],
      excludedTitles: ["Principal", "Lead", "Manager", "Director", "Architect"],
    });

    const staffUi = scoreJobForProfile({
      company: "AI Co",
      title: "Staff UI Software Engineer, Claude.ai Consumer Product",
      location: "San Francisco, CA | New York City, NY | Seattle, WA",
      description: "Build React, Next.js, TypeScript, Node.js, polished user-facing product UI, accessibility, performance, responsive UI, streaming and real-time UI, and AI product experiences.",
    }, profile);
    const accessibility = scoreJobForProfile({
      company: "AI Co",
      title: "Staff Software Engineer, Accessibility",
      location: "San Francisco, CA | New York City, NY | Seattle, WA",
      description: "Build accessible shared React and TypeScript UI components, design-system abstractions, automated accessibility testing, WCAG and ARIA tooling, and CI systems for UI platform quality.",
    }, profile);

    expect(staffUi.overallScore).toBeGreaterThanOrEqual(60);
    expect(accessibility.overallScore).toBeGreaterThanOrEqual(60);
    expect(staffUi.concerns).not.toContain("Staff, principal, lead, manager, director, or architect seniority is outside the Senior Frontend IC target.");
    expect(accessibility.concerns).not.toContain("Staff, principal, lead, manager, director, or architect seniority is outside the Senior Frontend IC target.");
  });

  it("keeps backend, data, developer advocacy, and transformation roles below frontend thresholds", () => {
    const profile = seniorFrontendProfile();
    const jobs = [
      { title: "Senior Data Engineer", description: "Build analytics pipelines and warehouse models with SQL and Python." },
      { title: "Senior Software Engineer, Backend (Product Engineering)", description: "Build backend services, APIs, and distributed systems." },
      { title: "Senior Developer Advocate", description: "Create demos, write content, speak at events, and support developer community programs." },
      { title: "Applied AI Transformation Manager", description: "Lead customer AI transformation strategy and executive stakeholder workshops." },
    ];

    const scores = jobs.map((job) => scoreJobForProfile({
      company: "AI Co",
      title: job.title,
      location: "Remote, United States",
      description: job.description,
    }, profile));

    for (const score of scores) {
      expect(score.overallScore).toBeLessThan(profile.minimumMatchScore);
    }
    expect(scores.flatMap((score) => score.concerns)).toEqual(expect.arrayContaining([
      "Developer advocacy, curriculum, transformation, support, or solutions role is outside the frontend IC target.",
    ]));
  });

  it("only keeps full-stack roles when frontend evidence is present", () => {
    const profile = seniorFrontendProfile();

    const frontendFullStack = scoreJobForProfile({
      company: "SaaS Co",
      title: "Senior Full Stack Engineer",
      location: "Remote, United States",
      description: "Own React and TypeScript frontend workflows, product UI, API integrations, dashboards, and design system work.",
    }, profile);
    const backendFullStack = scoreJobForProfile({
      company: "SaaS Co",
      title: "Senior Full Stack Engineer",
      location: "Remote, United States",
      description: "Own Java backend services, Kafka pipelines, database migrations, and infrastructure automation.",
    }, profile);

    expect(frontendFullStack.overallScore).toBeGreaterThanOrEqual(profile.minimumMatchScore);
    expect(backendFullStack.overallScore).toBeLessThan(profile.minimumMatchScore);
  });

  it("keeps C++ mission autonomy roles below frontend/full-stack thresholds", () => {
    const profile = {
      name: "Senior Frontend",
      titles: ["Senior Frontend Engineer", "Senior Full Stack Engineer"],
      keywordsRequired: ["React", "TypeScript"],
      keywordsPreferred: ["Next.js", "API integrations"],
      keywordsExcluded: [],
      excludedCompanies: [],
      excludedTitles: [],
      industries: [],
      includeUnknownSalary: true,
      minimumMatchScore: 75,
      remotePreference: "remote_us_only",
      relocationPreference: "unknown",
      countries: ["United States"],
    } as unknown as JobSearchProfile;

    const score = scoreJobForProfile({
      company: "Defense Co",
      title: "C++ Mission Software Engineer, Mission Autonomy",
      location: "United States",
      description: "Build C++ autonomy software for robotics, embedded systems, and real-time mission software.",
    }, profile);

    expect(score.overallScore).toBeLessThan(profile.minimumMatchScore);
    expect(score.concerns).toContain("Low-level C++, embedded, robotics, or autonomy role does not match the target web/frontend/full-stack profile.");
  });

  it("keeps electrical engineering and flight software roles below web profile thresholds", () => {
    const profile = {
      name: "Senior Frontend",
      titles: ["Senior Software Engineer", "Senior Frontend Engineer"],
      keywordsRequired: ["React", "TypeScript", "JavaScript"],
      keywordsPreferred: ["Next.js", "API integrations"],
      keywordsExcluded: [],
      excludedCompanies: [],
      excludedTitles: [],
      industries: [],
      includeUnknownSalary: true,
      minimumMatchScore: 75,
      remotePreference: "remote_us_only",
      relocationPreference: "unknown",
      countries: ["United States"],
    } as unknown as JobSearchProfile;

    const electrical = scoreJobForProfile({
      company: "Defense Co",
      title: "Electrical Engineering Technical Lead",
      location: "United States",
      description: "Lead electrical engineering work for avionics, RF systems, hardware testing, and aerospace platforms.",
    }, profile);
    const flight = scoreJobForProfile({
      company: "Defense Co",
      title: "Flight Software Engineer, Embedded C/C++, Air Dominance & Strike - Advanced Effects",
      location: "United States",
      description: "Develop embedded C/C++ flight software, RTOS integrations, and weapons systems for advanced effects.",
    }, profile);

    expect(electrical.overallScore).toBeLessThan(profile.minimumMatchScore);
    expect(flight.overallScore).toBeLessThan(profile.minimumMatchScore);
    expect(electrical.concerns).toContain("Low-level C++, embedded, robotics, or autonomy role does not match the target web/frontend/full-stack profile.");
    expect(flight.concerns).toContain("Low-level C++, embedded, robotics, or autonomy role does not match the target web/frontend/full-stack profile.");
  });
});
