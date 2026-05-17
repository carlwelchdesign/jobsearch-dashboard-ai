import { describe, expect, it } from "vitest";
import { createCanonicalJobKeys, createCanonicalJobParts } from "@/lib/job-search/dedupe";
import { isJobSuppressed, jobSuppressionStateFromKeys } from "@/lib/jobs/suppression";

describe("job suppression", () => {
  it("suppresses a rejected job across title and location variants", () => {
    const state = jobSuppressionStateFromKeys(new Set(createCanonicalJobKeys({
      company: "1Password Inc.",
      title: "Senior Developer, Growth",
      location: "Remote (United States | Canada)",
    })));

    expect(isJobSuppressed({
      company: "1password",
      title: "Sr Developer Growth",
      location: "United States",
    }, state)).toBe(true);
  });

  it("suppresses same company and title family during a cooldown", () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const parts = createCanonicalJobParts({
      company: "Airbnb",
      title: "Senior Software Engineer, Payments",
      location: "Remote - US",
    });
    const state = {
      canonicalKeys: new Set<string>(),
      cooldowns: [{
        companyKey: parts.companyKey,
        titleFamilyKey: parts.titleFamilyKey,
        expiresAt,
      }],
    };

    expect(isJobSuppressed({
      company: "Airbnb",
      title: "Senior Software Engineer, Payments",
      location: "Remote - US",
    }, state)).toBe(true);
    expect(isJobSuppressed({
      company: "Airbnb",
      title: "Staff Software Engineer, Build",
      location: "Remote - US",
    }, state)).toBe(false);
  });

  it("suppresses all roles at a company during a company-wide cooldown", () => {
    const state = {
      canonicalKeys: new Set<string>(),
      cooldowns: [{
        companyKey: "mistral",
        titleFamilyKey: "*",
        expiresAt: new Date(Date.now() + 60_000),
      }],
    };

    expect(isJobSuppressed({
      company: "Mistral",
      title: "Software Engineer, DevEx",
      location: "Paris",
    }, state)).toBe(true);
  });
});
