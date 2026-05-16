import type { JobSearchProfile } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { scoreJobForProfile } from "@/lib/job-search/scoring";

describe("scoreJobForProfile", () => {
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
