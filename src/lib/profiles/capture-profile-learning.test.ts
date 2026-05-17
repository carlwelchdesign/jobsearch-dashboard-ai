import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createProfileFromZeroMatchCapture, extractJobSignals } from "./capture-profile-learning";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
    jobSearchProfile: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const findUserMock = vi.mocked(prisma.user.findFirst);
const findProfileMock = vi.mocked(prisma.jobSearchProfile.findFirst);
const createProfileMock = vi.mocked(prisma.jobSearchProfile.create);

describe("capture profile learning", () => {
  beforeEach(() => {
    findUserMock.mockReset();
    findProfileMock.mockReset();
    createProfileMock.mockReset();
    findUserMock.mockResolvedValue({ id: "user_1" } as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    findProfileMock.mockResolvedValue(null);
    createProfileMock.mockResolvedValue({ id: "profile_1", name: "AI-Native Enterprise Product Frontend" } as Awaited<ReturnType<typeof prisma.jobSearchProfile.create>>);
  });

  it("creates a broad enabled AI-native frontend profile from a Terzo-style zero-match capture", async () => {
    const result = await createProfileFromZeroMatchCapture({
      id: "job_1",
      company: "Terzo",
      title: "Frontend Engineer",
      location: "Remote",
      description: "Build AI-native analytics, workflows, AI agents, marketplace experiences, enterprise data products, design system, component library, and frontend architecture.",
    });

    expect(result).toMatchObject({
      created: true,
      profile: { id: "profile_1", name: "AI-Native Enterprise Product Frontend" },
    });
    expect(createProfileMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user_1",
        name: "AI-Native Enterprise Product Frontend",
        enabled: true,
        remotePreference: "any",
        salaryMin: 160000,
        includeUnknownSalary: true,
        minimumMatchScore: 72,
        scheduleEnabled: true,
        keywordsRequired: [],
        titles: expect.arrayContaining(["Frontend Engineer", "AI Product Engineer", "Product Engineer"]),
        industries: expect.arrayContaining(["AI", "enterprise SaaS", "data platforms"]),
        keywordsPreferred: expect.arrayContaining(["AI-native UX", "AI agents", "analytics", "design system", "frontend architecture", "marketplace"]),
      }),
      select: { id: true, name: true },
    }));
  });

  it("does not create a duplicate captured-intent profile", async () => {
    findProfileMock.mockResolvedValue({ id: "profile_existing", name: "AI-Native Enterprise Product Frontend" } as Awaited<ReturnType<typeof prisma.jobSearchProfile.findFirst>>);

    const result = await createProfileFromZeroMatchCapture({
      id: "job_1",
      company: "Terzo",
      title: "Frontend Engineer",
      location: "Remote",
      description: "AI-native frontend work.",
    });

    expect(result).toMatchObject({
      created: false,
      profile: { id: "profile_existing", name: "AI-Native Enterprise Product Frontend" },
    });
    expect(createProfileMock).not.toHaveBeenCalled();
  });

  it("extracts job-specific signals without requiring every keyword to match", () => {
    expect(extractJobSignals({
      id: "job_1",
      company: "Terzo",
      title: "Frontend Engineer",
      location: "Remote",
      description: "AI-native intelligence products across analytics, workflows, AI agents, marketplace, and enterprise data.",
    })).toEqual(expect.arrayContaining(["AI-native", "intelligence products", "analytics", "workflows", "AI agents", "marketplace", "enterprise data"]));
  });
});
