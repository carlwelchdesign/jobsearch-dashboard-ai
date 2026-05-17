import { describe, expect, it } from "vitest";
import { chooseCanonicalApplication, duplicateApplicationCleanupIds, visibleCanonicalApplications } from "@/lib/applications/reconciliation";

describe("application reconciliation helpers", () => {
  it("archives stale approved duplicates when an applied sibling exists", () => {
    const applied = app({ id: "applied", status: "applied", updatedAt: new Date("2026-05-17T10:00:00Z") });
    const approved = app({ id: "approved", status: "approved", updatedAt: new Date("2026-05-17T11:00:00Z") });

    expect(chooseCanonicalApplication([approved, applied])?.id).toBe("applied");
    expect(duplicateApplicationCleanupIds([approved, applied])).toEqual(["approved"]);
  });

  it("collapses same-company same-title application trackers across regional postings after submission", () => {
    const applied = app({
      id: "linear_applied",
      company: "Linear",
      title: "Senior / Staff Fullstack Engineer",
      location: "North America",
      status: "applied",
      updatedAt: new Date("2026-05-17T10:00:00Z"),
    });
    const readyEurope = app({
      id: "linear_ready_europe",
      company: "Linear",
      title: "Senior / Staff Fullstack Engineer",
      location: "Europe",
      status: "ready_to_apply",
      updatedAt: new Date("2026-05-17T11:00:00Z"),
    });

    expect(visibleCanonicalApplications([readyEurope, applied]).map((item) => item.id)).toEqual(["linear_applied"]);
    expect(duplicateApplicationCleanupIds([readyEurope, applied])).toEqual(["linear_ready_europe"]);
  });

  it("keeps ready applications visible when no submitted sibling exists", () => {
    const ready = app({ id: "ready", status: "ready_to_apply" });
    const approved = app({ id: "approved", status: "approved" });

    expect(visibleCanonicalApplications([approved, ready]).map((item) => item.id)).toEqual(["ready"]);
    expect(duplicateApplicationCleanupIds([approved, ready])).toEqual([]);
  });

  it("does not merge unrelated application groups", () => {
    const first = app({ id: "first", company: "Gecko Robotics", title: "Software Engineer", status: "applied" });
    const second = app({ id: "second", company: "Acme", title: "Software Engineer", status: "approved" });

    expect(visibleCanonicalApplications([first, second]).map((item) => item.id).sort()).toEqual(["first", "second"]);
  });

  it("keeps distinct titles at the same company separate", () => {
    const fullstack = app({ id: "fullstack", company: "Linear", title: "Senior / Staff Fullstack Engineer", location: "North America", status: "applied" });
    const product = app({ id: "product", company: "Linear", title: "Senior / Staff Product Engineer", location: "Europe", status: "ready_to_apply" });

    expect(visibleCanonicalApplications([fullstack, product]).map((item) => item.id).sort()).toEqual(["fullstack", "product"]);
  });
});

function app(input: {
  id: string;
  company?: string;
  title?: string;
  location?: string;
  status?: "approved" | "ready_to_apply" | "applied";
  appliedAt?: Date | null;
  updatedAt?: Date;
  createdAt?: Date;
  lastSeenAt?: Date;
  duplicateGroupId?: string | null;
}) {
  const now = new Date("2026-05-17T00:00:00Z");
  return {
    id: input.id,
    userId: "user_1",
    jobPostingId: `${input.id}_job`,
    jobProfileMatchId: `${input.id}_match`,
    status: input.status ?? "approved",
    notes: null,
    appliedAt: input.appliedAt ?? null,
    updatedAt: input.updatedAt ?? now,
    createdAt: input.createdAt ?? now,
    jobPosting: {
      id: `${input.id}_job`,
      company: input.company ?? "Gecko Robotics",
      title: input.title ?? "Software Engineer | 3D Visualization Platform",
      location: input.location ?? "Remote",
      lastSeenAt: input.lastSeenAt ?? now,
      duplicateGroupId: input.duplicateGroupId ?? null,
    },
  };
}
