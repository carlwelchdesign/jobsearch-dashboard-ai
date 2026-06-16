import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { DELETE, PATCH } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    experienceBullet: {
      update: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const updateMock = vi.mocked(prisma.experienceBullet.update);
const findUniqueMock = vi.mocked(prisma.experienceBullet.findUnique);
const deleteMock = vi.mocked(prisma.experienceBullet.delete);

describe("/api/resumes/bullets/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue({ id: "bullet_1", truthLevel: "verified" } as Awaited<ReturnType<typeof prisma.experienceBullet.update>>);
    deleteMock.mockResolvedValue({ id: "bullet_1" } as Awaited<ReturnType<typeof prisma.experienceBullet.delete>>);
  });

  it("approves a proposed bullet for resume generation", async () => {
    const response = await PATCH(new Request("http://localhost/api/resumes/bullets/bullet_1", {
      method: "PATCH",
      body: JSON.stringify({ truthLevel: "verified" }),
    }), { params: { id: "bullet_1" } });

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "bullet_1" },
      data: expect.objectContaining({ truthLevel: "verified" }),
    }));
  });

  it("updates editable bullet fields", async () => {
    const response = await PATCH(new Request("http://localhost/api/resumes/bullets/bullet_1", {
      method: "PATCH",
      body: JSON.stringify({
        workExperienceId: "work_1",
        company: "Revenue.io",
        role: "Senior Software Engineer",
        category: "fullstack",
        text: "Built React and TypeScript interfaces for guided selling workflows.",
        keywords: "React, TypeScript",
        sourceText: "Developed React/TypeScript interfaces for sales engagement workflows.",
      }),
    }), { params: { id: "bullet_1" } });

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        workExperienceId: "work_1",
        company: "Revenue.io",
        role: "Senior Software Engineer",
        category: "fullstack",
        keywords: ["React", "TypeScript"],
      }),
    }));
  });

  it("deletes proposed bullets when rejected", async () => {
    findUniqueMock.mockResolvedValue({ id: "bullet_1", truthLevel: "needs_review" } as Awaited<ReturnType<typeof prisma.experienceBullet.findUnique>>);

    const response = await DELETE(new Request("http://localhost/api/resumes/bullets/bullet_1"), { params: { id: "bullet_1" } });

    expect(response.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: "bullet_1" } });
  });

  it("does not delete verified bullets", async () => {
    findUniqueMock.mockResolvedValue({ id: "bullet_1", truthLevel: "verified" } as Awaited<ReturnType<typeof prisma.experienceBullet.findUnique>>);

    const response = await DELETE(new Request("http://localhost/api/resumes/bullets/bullet_1"), { params: { id: "bullet_1" } });

    expect(response.status).toBe(400);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
