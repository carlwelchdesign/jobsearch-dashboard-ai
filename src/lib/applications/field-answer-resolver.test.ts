import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerApplicationQuestion } from "@/lib/ai/application-question";
import { findReusableAnswerMemories } from "@/lib/application-answer-memory";
import { findActiveFieldMemories } from "@/lib/applications/field-learning";
import { prisma } from "@/lib/prisma";
import { resolveApplicationFieldAnswer } from "./field-answer-resolver";

vi.mock("@/lib/ai/application-question", () => ({
  answerApplicationQuestion: vi.fn(),
}));

vi.mock("@/lib/application-answer-memory", () => ({
  findReusableAnswerMemories: vi.fn(),
}));

vi.mock("@/lib/applications/field-learning", () => ({
  findActiveFieldMemories: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: { findUnique: vi.fn() },
    userProfile: { findFirst: vi.fn() },
  },
}));

const answerQuestionMock = vi.mocked(answerApplicationQuestion);
const answerMemoryMock = vi.mocked(findReusableAnswerMemories);
const fieldMemoryMock = vi.mocked(findActiveFieldMemories);
const applicationMock = vi.mocked(prisma.application.findUnique);
const profileMock = vi.mocked(prisma.userProfile.findFirst);

describe("resolveApplicationFieldAnswer", () => {
  beforeEach(() => {
    answerQuestionMock.mockReset();
    answerMemoryMock.mockReset();
    fieldMemoryMock.mockReset();
    applicationMock.mockReset();
    profileMock.mockReset();
    answerMemoryMock.mockResolvedValue([]);
    fieldMemoryMock.mockResolvedValue([]);
    applicationMock.mockResolvedValue(application() as unknown as Awaited<ReturnType<typeof prisma.application.findUnique>>);
    profileMock.mockResolvedValue(profile() as unknown as Awaited<ReturnType<typeof prisma.userProfile.findFirst>>);
    answerQuestionMock.mockResolvedValue({
      generatedBy: "openai_structured_outputs",
      options: [
        { title: "Generated", answer: "I build focused React and TypeScript workflows for complex product teams.", evidence: [], tone: "Direct", cautions: [] },
        { title: "Other", answer: "Other answer.", evidence: [], tone: "Direct", cautions: [] },
        { title: "Other 2", answer: "Other answer 2.", evidence: [], tone: "Direct", cautions: [] },
      ],
    });
  });

  it("uses active field memory before generating", async () => {
    fieldMemoryMock.mockResolvedValue([
      {
        id: "memory_1",
        label: "Describe a complex frontend project.",
        answer: "A saved project answer.",
        sensitivity: "MEDIUM",
        confidence: 91,
        category: "custom",
        selector: "textarea#project",
      },
    ] as Awaited<ReturnType<typeof findActiveFieldMemories>>);

    const result = await resolveApplicationFieldAnswer({
      applicationId: "app_1",
      field: { label: "Describe a complex frontend project.", inputType: "textarea", selector: "textarea#project" },
    });

    expect(result).toMatchObject({
      answer: "A saved project answer.",
      source: "field_memory",
      autoFillAllowed: true,
      memoryMatchId: "memory_1",
    });
    expect(answerQuestionMock).not.toHaveBeenCalled();
  });

  it("generates high-confidence safe answers from application context", async () => {
    const result = await resolveApplicationFieldAnswer({
      applicationId: "app_1",
      field: { label: "Describe a complex frontend project.", inputType: "textarea", category: "custom" },
    });

    expect(answerQuestionMock).toHaveBeenCalled();
    expect(result).toMatchObject({
      answer: "I build focused React and TypeScript workflows for complex product teams.",
      source: "generated",
      confidence: 88,
      sensitivity: "MEDIUM",
      autoFillAllowed: true,
    });
  });

  it("blocks OTP and CAPTCHA-style fields", async () => {
    const result = await resolveApplicationFieldAnswer({
      applicationId: "app_1",
      field: { label: "please enter otp character 1", inputType: "text" },
    });

    expect(result).toMatchObject({ source: "blocked", autoFillAllowed: false });
    expect(applicationMock).not.toHaveBeenCalled();
  });

  it("uses explicit protected-veteran profile settings instead of generating", async () => {
    const result = await resolveApplicationFieldAnswer({
      applicationId: "app_1",
      field: { label: "I identify as one or more of the classifications of protected veteran listed above", inputType: "radio" },
    });

    expect(result).toMatchObject({
      answer: "I identify as one or more of the classifications of protected veteran listed above",
      source: "profile",
      sensitivity: "HIGH",
      autoFillAllowed: true,
    });
    expect(answerQuestionMock).not.toHaveBeenCalled();
  });
});

function application() {
  return {
    id: "app_1",
    userId: "user_1",
    applicationPackets: [],
    coverLetter: null,
    jobPosting: {
      id: "job_1",
      atsProvider: "ashby",
      applicationUrl: "https://jobs.example.com/apply",
      title: "Frontend Engineer",
      company: "Acme",
      description: "Build React and TypeScript workflows.",
    },
    user: {
      id: "user_1",
      email: "carl@example.com",
      profile: {
        veteranStatusAnswer: "I identify as one or more of the classifications of protected veteran listed above",
        raceAnswer: "",
        genderAnswer: "",
        disabilityAnswer: "",
      },
    },
  };
}

function profile() {
  return {
    id: "profile_1",
    userId: "user_1",
    fullName: "Carl Welch",
    professionalSummary: "Senior frontend engineer.",
    masterSummary: "Senior frontend engineer.",
    yearsExperience: 20,
    primaryRoles: ["Frontend Engineer"],
    coreSkills: ["React", "TypeScript"],
    technicalSkills: ["React", "TypeScript"],
    industries: [],
    domainExpertise: [],
    experienceBullets: [],
    workExperiences: [],
    projects: [],
    githubRepositories: [],
  };
}
