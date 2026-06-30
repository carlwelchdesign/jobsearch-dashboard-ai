import { beforeEach, describe, expect, it, vi } from "vitest";
import { upsertEvidence } from "@/lib/evidence/ingest";
import { parseLinkedInRecommendations } from "@/lib/evidence/linkedin-recommendations";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/evidence/ingest", () => ({
  upsertEvidence: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
    candidateEvidence: {
      findMany: vi.fn(),
    },
    experienceBullet: {
      create: vi.fn(),
    },
  },
}));

const findUserMock = vi.mocked(prisma.user.findFirst);
const findEvidenceMock = vi.mocked(prisma.candidateEvidence.findMany);
const createBulletMock = vi.mocked(prisma.experienceBullet.create);
const upsertEvidenceMock = vi.mocked(upsertEvidence);

const grindrRecommendation = `
Corbett Trubey

Creative Director | Copywriter | Cookie Eater

September 15, 2017, Corbett worked with Carl on the same team

Carl and I had the great opportunity of building Grindr's first ever marketing team. During this wild ride, Carl worked tirelessly to lay the foundation of Grindr's revamped digital presence and create rad new ways to make the brand stand out more than ever before. He brought to the table mad skills, a laid-back positive attitude, and a willingness to do whatever it takes to get the job done right.
`;

describe("POST /api/evidence/linkedin-recommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUserMock.mockResolvedValue({
      id: "user_1",
      profile: { id: "profile_1" },
    } as unknown as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    findEvidenceMock.mockResolvedValue([]);
    createBulletMock.mockResolvedValue({ id: "bullet_1" } as Awaited<ReturnType<typeof prisma.experienceBullet.create>>);
    upsertEvidenceMock.mockResolvedValue({ id: "evidence_1" } as Awaited<ReturnType<typeof upsertEvidence>>);
  });

  it("previews parsed recommendations without importing evidence", async () => {
    const response = await POST(new Request("http://localhost/api/evidence/linkedin-recommendations", {
      method: "POST",
      body: JSON.stringify({ rawText: grindrRecommendation, mode: "preview" }),
    }));

    expect(response.status).toBe(200);
    expect(upsertEvidenceMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      createdEvidenceCount: 0,
      duplicateCount: 0,
      proposedBulletCount: 0,
      entries: [expect.objectContaining({
        recommenderName: "Corbett Trubey",
        sourceRef: expect.stringMatching(/^linkedin-recommendation:/),
        duplicate: false,
      })],
    });
  });

  it("imports new recommendations as review-gated LinkedIn evidence and optional proposed bullets", async () => {
    const response = await POST(new Request("http://localhost/api/evidence/linkedin-recommendations", {
      method: "POST",
      body: JSON.stringify({
        rawText: grindrRecommendation,
        mode: "import",
        createProposedBullets: true,
      }),
    }));

    expect(response.status).toBe(200);
    expect(upsertEvidenceMock).toHaveBeenCalledWith(expect.objectContaining({
      candidateProfileId: "profile_1",
      sourceType: "LINKEDIN",
      confidence: "NEEDS_REVIEW",
      usableInResume: false,
      usableInCoverLetter: false,
      usableInRecruiterMessage: false,
    }));
    expect(createBulletMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userProfileId: "profile_1",
        company: "Grindr",
        truthLevel: "needs_review",
      }),
    }));
    await expect(response.json()).resolves.toMatchObject({
      createdEvidenceCount: 1,
      proposedBulletCount: expect.any(Number),
    });
  });

  it("does not re-import duplicate recommendations", async () => {
    const [entry] = parseLinkedInRecommendations(grindrRecommendation);
    findEvidenceMock.mockResolvedValue([{ id: "evidence_existing", sourceRef: entry.sourceRef }] as unknown as Awaited<ReturnType<typeof prisma.candidateEvidence.findMany>>);

    const response = await POST(new Request("http://localhost/api/evidence/linkedin-recommendations", {
      method: "POST",
      body: JSON.stringify({ rawText: grindrRecommendation, mode: "import" }),
    }));

    expect(response.status).toBe(200);
    expect(upsertEvidenceMock).not.toHaveBeenCalled();
    expect(createBulletMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      createdEvidenceCount: 0,
      duplicateCount: 1,
    });
  });

  it("requires an existing candidate profile", async () => {
    findUserMock.mockResolvedValue({ id: "user_1", profile: null } as unknown as Awaited<ReturnType<typeof prisma.user.findFirst>>);

    const response = await POST(new Request("http://localhost/api/evidence/linkedin-recommendations", {
      method: "POST",
      body: JSON.stringify({ rawText: grindrRecommendation, mode: "import" }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "A candidate profile is required before importing LinkedIn recommendations.",
    });
  });

  it("rejects paste text that does not contain recommendations", async () => {
    const response = await POST(new Request("http://localhost/api/evidence/linkedin-recommendations", {
      method: "POST",
      body: JSON.stringify({ rawText: "This is not a LinkedIn recommendation block with enough structure.", mode: "preview" }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("No LinkedIn recommendations were found"),
    });
  });
});
