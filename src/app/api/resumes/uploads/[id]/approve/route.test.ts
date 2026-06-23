import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCandidateIntelligenceAgent } from "@/lib/agents/candidate-intelligence";
import { runSearchProfileManagerAgent } from "@/lib/agents/search-profile-manager";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/agents/candidate-intelligence", () => ({
  runCandidateIntelligenceAgent: vi.fn(),
}));

vi.mock("@/lib/agents/search-profile-manager", () => ({
  runSearchProfileManagerAgent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    experienceBullet: { create: vi.fn(), deleteMany: vi.fn() },
    project: { create: vi.fn(), deleteMany: vi.fn() },
    resumeUpload: { findUnique: vi.fn(), update: vi.fn() },
    userProfile: { upsert: vi.fn() },
    workExperience: { create: vi.fn(), deleteMany: vi.fn() },
  },
}));

const candidateAgentMock = vi.mocked(runCandidateIntelligenceAgent);
const searchProfileAgentMock = vi.mocked(runSearchProfileManagerAgent);

describe("POST /api/resumes/uploads/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.userProfile.upsert).mockResolvedValue({
      id: "profile_1",
      userId: "user_1",
    } as Awaited<ReturnType<typeof prisma.userProfile.upsert>>);
    vi.mocked(prisma.resumeUpload.update).mockResolvedValue({
      id: "upload_1",
      parsingStatus: "approved",
    } as Awaited<ReturnType<typeof prisma.resumeUpload.update>>);
    vi.mocked(prisma.workExperience.create).mockResolvedValue({
      id: "work_1",
    } as Awaited<ReturnType<typeof prisma.workExperience.create>>);
    vi.mocked(prisma.experienceBullet.create).mockResolvedValue({ id: "bullet_1" } as Awaited<ReturnType<typeof prisma.experienceBullet.create>>);
    vi.mocked(prisma.project.create).mockResolvedValue({ id: "project_1" } as Awaited<ReturnType<typeof prisma.project.create>>);
    vi.mocked(prisma.experienceBullet.deleteMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.workExperience.deleteMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.project.deleteMany).mockResolvedValue({ count: 1 });
    candidateAgentMock.mockResolvedValue({
      run: { id: "run_candidate" },
      output: { evidenceItems: [], needsReviewItems: [], suggestedProfileUpdates: [], warnings: [], confidence: 0.9, reasoningSummary: "Reviewed." },
    } as unknown as Awaited<ReturnType<typeof runCandidateIntelligenceAgent>>);
    searchProfileAgentMock.mockResolvedValue({
      run: { id: "run_profiles" },
      output: {
        suggestedProfiles: [{
          name: "Frontend Platform / Design Systems",
          alreadyExists: false,
          titles: ["Staff Frontend Engineer"],
          keywordsPreferred: ["React"],
          rationale: "Strong evidence.",
        }],
      },
    } as unknown as Awaited<ReturnType<typeof runSearchProfileManagerAgent>>);
  });

  it("activates the approved upload and returns reviewable agent suggestions", async () => {
    vi.mocked(prisma.resumeUpload.findUnique).mockResolvedValue({
      id: "upload_1",
      userId: "user_1",
      parsedJson: parsedResume(),
      user: {
        id: "user_1",
        email: "carl@example.com",
        profile: { id: "profile_1", fullName: "Carl Welch", masterSummary: "Existing summary." },
      },
    } as unknown as Awaited<ReturnType<typeof prisma.resumeUpload.findUnique>>);

    const response = await POST(new Request("http://localhost/api/resumes/uploads/upload_1/approve", { method: "POST" }), {
      params: { id: "upload_1" },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.resumeUpload.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "upload_1" },
      data: { userProfileId: "profile_1", parsingStatus: "approved" },
    }));
    expect(prisma.workExperience.deleteMany).toHaveBeenCalledWith({ where: { sourceResumeUploadId: "upload_1" } });
    expect(candidateAgentMock).toHaveBeenCalledWith(expect.objectContaining({
      candidateProfileId: "profile_1",
      sourceType: "RESUME_UPLOAD",
      sourceRef: "upload_1",
      notes: expect.arrayContaining([expect.objectContaining({ title: "Yubico - Senior Software Engineer" })]),
    }));
    expect(searchProfileAgentMock).toHaveBeenCalledWith({
      userId: "user_1",
      mode: "resume_reonboarding",
      resumeUploadId: "upload_1",
      candidateProfileId: "profile_1",
    });
    expect(body).toMatchObject({
      profileId: "profile_1",
      uploadId: "upload_1",
      activeResumeUploadId: "upload_1",
      activationStatus: "active_latest_approved_upload",
      candidateReviewRunId: "run_candidate",
      searchProfileRunId: "run_profiles",
      suggestedProfiles: [expect.objectContaining({ name: "Frontend Platform / Design Systems" })],
      agentReviewErrors: [],
    });
  });
});

function parsedResume() {
  return {
    contactInfo: {
      fullName: "Carl Welch",
      email: "carl@example.com",
    },
    professionalSummary: "Senior software engineer.",
    skills: {
      coreSkills: ["React"],
      technicalSkills: ["React", "TypeScript"],
      toolsFrameworksLibraries: ["React"],
      programmingLanguages: ["TypeScript"],
    },
    workExperience: [{
      company: "Yubico",
      title: "Senior Software Engineer",
      startDate: "Jul 2022",
      endDate: "Mar 2026",
      isCurrent: false,
      skills: ["React", "TypeScript"],
      achievements: ["Built enterprise admin workflows."],
    }],
    experienceBullets: [{
      company: "Yubico",
      role: "Senior Software Engineer",
      text: "Built enterprise admin workflows.",
      category: "frontend",
      metrics: {},
      keywords: ["React"],
      sourceText: "Built enterprise admin workflows.",
      truthLevel: "verified",
    }],
    projects: [{
      name: "Job Search OS",
      technologies: ["Next.js"],
      highlights: ["Built local-first job search workflows."],
    }],
    education: [],
    certifications: [],
    inferredTags: ["React"],
    fieldsNeedingReview: [],
    confidence: 0.9,
  };
}
