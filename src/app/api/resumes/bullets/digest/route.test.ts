import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { digestRoleDescriptionToBullets, inferRoleDescriptionMetadata } from "@/lib/resumes/bullet-digest";
import { POST } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    experienceBullet: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    workExperience: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((operations) => Promise.all(operations)),
  },
}));

vi.mock("@/lib/resumes/bullet-digest", () => ({
  digestRoleDescriptionToBullets: vi.fn(),
  inferRoleDescriptionMetadata: vi.fn(),
}));

const findUniqueMock = vi.mocked(prisma.userProfile.findUnique);
const findFirstMock = vi.mocked(prisma.userProfile.findFirst);
const findExistingBulletsMock = vi.mocked(prisma.experienceBullet.findMany);
const createMock = vi.mocked(prisma.experienceBullet.create);
const findWorkExperienceMock = vi.mocked(prisma.workExperience.findFirst);
const createWorkExperienceMock = vi.mocked(prisma.workExperience.create);
const updateWorkExperienceMock = vi.mocked(prisma.workExperience.update);
const digestMock = vi.mocked(digestRoleDescriptionToBullets);
const inferMetadataMock = vi.mocked(inferRoleDescriptionMetadata);

describe("POST /api/resumes/bullets/digest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue({ id: "profile_1" } as Awaited<ReturnType<typeof prisma.userProfile.findUnique>>);
    findExistingBulletsMock.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.experienceBullet.findMany>>);
    findWorkExperienceMock.mockResolvedValue(null);
    createWorkExperienceMock.mockResolvedValue({ id: "work_1", company: "Acme", title: "Senior Frontend Engineer" } as Awaited<ReturnType<typeof prisma.workExperience.create>>);
    updateWorkExperienceMock.mockResolvedValue({ id: "work_1", company: "Acme", title: "Senior Frontend Engineer" } as Awaited<ReturnType<typeof prisma.workExperience.update>>);
    inferMetadataMock.mockReturnValue({
      company: "Acme",
      role: "Senior Frontend Engineer",
      category: "frontend",
      location: null,
      startDate: null,
      endDate: null,
      isCurrent: false,
      summary: null,
      skills: ["React", "TypeScript"],
      achievements: ["Built React and TypeScript dashboards for workflow automation."],
    });
    digestMock.mockResolvedValue({
      bullets: [{
        text: "Built React and TypeScript dashboards for workflow automation",
        keywords: ["React", "TypeScript"],
        sourceExcerpt: "Built React and TypeScript dashboards for workflow automation.",
        confidenceNotes: "Directly supported.",
      }],
      warnings: ["No explicit metrics were found; proposed bullets avoid invented numbers."],
    });
    createMock.mockImplementation((async (input: unknown) => ({
      id: "bullet_1",
      ...(input as { data: Record<string, unknown> }).data,
    })) as never);
  });

  it("creates needs-review proposed bullets from a pasted role description", async () => {
    const response = await POST(new Request("http://localhost/api/resumes/bullets/digest", {
      method: "POST",
      body: JSON.stringify({
        userProfileId: "profile_1",
        company: "Acme",
        role: "Senior Frontend Engineer",
        category: "frontend",
        focusAreas: "React",
        description: "Built React and TypeScript dashboards for workflow automation. Partnered with design and product teams on accessible enterprise workflows.",
      }),
    }));

    expect(response.status).toBe(201);
    expect(digestMock).toHaveBeenCalledWith(expect.objectContaining({
      company: "Acme",
      role: "Senior Frontend Engineer",
    }));
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userProfileId: "profile_1",
        workExperienceId: "work_1",
        company: "Acme",
        role: "Senior Frontend Engineer",
        truthLevel: "needs_review",
        text: "Built React and TypeScript dashboards for workflow automation",
      }),
    }));
    await expect(response.json()).resolves.toMatchObject({
      message: "Created 1 proposed bullet for review.",
      bullets: [expect.objectContaining({ truthLevel: "needs_review" })],
    });
  });

  it("rejects too-short pasted text", async () => {
    const response = await POST(new Request("http://localhost/api/resumes/bullets/digest", {
      method: "POST",
      body: JSON.stringify({
        userProfileId: "profile_1",
        company: "Acme",
        role: "Engineer",
        category: "frontend",
        description: "Too short.",
      }),
    }));

    expect(response.status).toBe(400);
    expect(digestMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects when no candidate profile exists", async () => {
    findUniqueMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/resumes/bullets/digest", {
      method: "POST",
      body: JSON.stringify({
        userProfileId: "missing",
        company: "Acme",
        role: "Engineer",
        category: "frontend",
        description: "Built React and TypeScript dashboards for workflow automation. Partnered with design and product teams on accessible enterprise workflows.",
      }),
    }));

    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("uses the first profile when no profile id is supplied", async () => {
    findFirstMock.mockResolvedValue({ id: "profile_1" } as Awaited<ReturnType<typeof prisma.userProfile.findFirst>>);

    const response = await POST(new Request("http://localhost/api/resumes/bullets/digest", {
      method: "POST",
      body: JSON.stringify({
        company: "Acme",
        role: "Engineer",
        category: "frontend",
        description: "Built React and TypeScript dashboards for workflow automation. Partnered with design and product teams on accessible enterprise workflows.",
      }),
    }));

    expect(response.status).toBe(201);
    expect(findFirstMock).toHaveBeenCalled();
  });

  it("infers company and role from a pasted LinkedIn-style block", async () => {
    inferMetadataMock.mockReturnValue({
      company: "Revenue.io",
      role: "Senior Software Engineer",
      category: "ai",
      location: "Los Angeles Metropolitan Area",
      startDate: "Mar 2020",
      endDate: "Sep 2022",
      isCurrent: false,
      summary: "Built frontend features for Revenue.io's AI-driven sales engagement and guided selling platform.",
      skills: ["React", "TypeScript", "Node.js"],
      achievements: ["Built frontend features for Revenue.io's AI-driven sales engagement and guided selling platform."],
    });
    createWorkExperienceMock.mockResolvedValue({ id: "work_revenue", company: "Revenue.io", title: "Senior Software Engineer" } as Awaited<ReturnType<typeof prisma.workExperience.create>>);

    const response = await POST(new Request("http://localhost/api/resumes/bullets/digest", {
      method: "POST",
      body: JSON.stringify({
        userProfileId: "profile_1",
        description: [
          "Senior Software Engineer",
          "Revenue.io · Full-time",
          "Mar 2020 - Sep 2022 · 2 yrs 7 mos",
          "Los Angeles Metropolitan Area",
          "Built frontend features for Revenue.io's AI-driven sales engagement and guided selling platform, supporting sales teams with responsive workflows, analytics, and productivity tools connected to enterprise sales operations.",
          "Worked across React, TypeScript, Backbone.js, Node.js, Hapi, AWS Lambda, and MySQL, contributing to both modern frontend development and legacy application support.",
        ].join("\n"),
      }),
    }));

    expect(response.status).toBe(201);
    expect(digestMock).toHaveBeenCalledWith(expect.objectContaining({
      company: "Revenue.io",
      role: "Senior Software Engineer",
      category: "ai",
    }));
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company: "Revenue.io",
        role: "Senior Software Engineer",
      }),
    }));
    await expect(response.json()).resolves.toMatchObject({
      metadata: {
        company: "Revenue.io",
        role: "Senior Software Engineer",
      },
    });
  });

  it("updates existing work experience and skips duplicate bullet proposals", async () => {
    findWorkExperienceMock.mockResolvedValue({
      id: "work_existing",
      skills: ["React"],
      achievements: ["Existing achievement"],
      location: null,
      startDate: null,
      endDate: null,
      isCurrent: false,
      summary: null,
    } as Awaited<ReturnType<typeof prisma.workExperience.findFirst>>);
    updateWorkExperienceMock.mockResolvedValue({ id: "work_existing" } as Awaited<ReturnType<typeof prisma.workExperience.update>>);
    findExistingBulletsMock.mockResolvedValue([
      { text: "Built React and TypeScript dashboards for workflow automation" },
    ] as Awaited<ReturnType<typeof prisma.experienceBullet.findMany>>);

    const response = await POST(new Request("http://localhost/api/resumes/bullets/digest", {
      method: "POST",
      body: JSON.stringify({
        userProfileId: "profile_1",
        company: "Acme",
        role: "Senior Frontend Engineer",
        category: "frontend",
        description: "Built React and TypeScript dashboards for workflow automation. Partnered with design and product teams on accessible enterprise workflows.",
      }),
    }));

    expect(response.status).toBe(200);
    expect(updateWorkExperienceMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "work_existing" },
    }));
    expect(createMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      skippedDuplicates: 1,
      message: "No new bullets created; matching proposals already exist.",
    });
  });
});
