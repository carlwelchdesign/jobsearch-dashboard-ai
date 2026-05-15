import { describe, expect, it } from "vitest";
import { classifyConfidence, classifyEvidenceType } from "@/lib/agents/candidate-intelligence";
import { confidenceMeetsMinimum, truthLevelToEvidenceConfidence } from "@/lib/evidence/confidence";
import { createEvidenceChunks } from "@/lib/evidence/chunking";
import { buildApprovedApplicationPacketEvidenceDraft, buildGithubRepositoryEvidenceDraft, createResumeEvidenceChunks } from "@/lib/evidence/ingest";
import { dedupeRetrievedEvidence, scoreEvidenceText } from "@/lib/evidence/retrieval";
import { inferEvidenceTags } from "@/lib/evidence/tags";

describe("evidence confidence rules", () => {
  it("maps existing truth levels to evidence confidence", () => {
    expect(truthLevelToEvidenceConfidence("verified")).toBe("VERIFIED");
    expect(truthLevelToEvidenceConfidence("inferred")).toBe("INFERRED");
    expect(truthLevelToEvidenceConfidence("estimated")).toBe("INFERRED");
    expect(truthLevelToEvidenceConfidence("needs_review")).toBe("NEEDS_REVIEW");
  });

  it("does not allow needs review evidence when inferred or better is required", () => {
    expect(confidenceMeetsMinimum("VERIFIED", "INFERRED")).toBe(true);
    expect(confidenceMeetsMinimum("INFERRED", "INFERRED")).toBe(true);
    expect(confidenceMeetsMinimum("NEEDS_REVIEW", "INFERRED")).toBe(false);
    expect(confidenceMeetsMinimum("REJECTED", "NEEDS_REVIEW")).toBe(false);
  });
});

describe("candidate intelligence helpers", () => {
  it("does not verify uncertain user input", () => {
    expect(classifyConfidence("USER_INPUT", "I might have led the migration")).toBe("NEEDS_REVIEW");
    expect(classifyConfidence("USER_INPUT", "Built a React dashboard for admin workflows")).toBe("INFERRED");
    expect(classifyConfidence("RESUME_UPLOAD", "Built a React dashboard for admin workflows")).toBe("VERIFIED");
  });

  it("classifies project and skill evidence", () => {
    expect(classifyEvidenceType("Progression Lab AI", "AI-assisted project built with Next.js")).toBe("PROJECT");
    expect(classifyEvidenceType("Core skills", "React TypeScript Storybook Playwright")).toBe("SKILL");
  });
});

describe("evidence retrieval scoring", () => {
  it("requires all requested tags", () => {
    const evidence = {
      title: "WebAuthn Core",
      content: "Reusable authentication package with passkeys",
      tags: ["identity", "webauthn", "security"],
      confidence: "VERIFIED" as const,
    };
    expect(scoreEvidenceText(evidence, "authentication", ["identity"])).toBeGreaterThan(0);
    expect(scoreEvidenceText(evidence, "authentication", ["defense-tech"])).toBe(0);
  });

  it("deduplicates broad resume snapshots", () => {
    const now = new Date();
    const duplicateResume = "Senior frontend engineer with React TypeScript authentication dashboard experience.".repeat(30);
    const evidence = dedupeRetrievedEvidence([
      {
        id: "ev1",
        title: "Approved resume: Carl-Welch-CV-2026.pdf",
        content: duplicateResume,
        sourceType: "RESUME_UPLOAD" as const,
        sourceRef: "upload-1",
        updatedAt: now,
        relevanceScore: 30,
      },
      {
        id: "ev2",
        title: "Approved resume: Carl-Welch-CV-2026-copy.pdf",
        content: duplicateResume,
        sourceType: "RESUME_UPLOAD" as const,
        sourceRef: "upload-2",
        updatedAt: now,
        relevanceScore: 29,
      },
    ]);

    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.id).toBe("ev1");
  });

  it("chunks resume uploads into focused evidence instead of one resume blob", () => {
    const chunks = createResumeEvidenceChunks(`
SUMMARY
Senior frontend engineer focused on React and TypeScript product workflows.

PROJECTS
Progression Lab AI uses Next.js, OpenAI structured outputs, Prisma, and Stripe.
WebAuthn Core provides reusable passkey orchestration.

SKILLS
React TypeScript Next.js Storybook Playwright
`, "resume.pdf");

    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.some((chunk) => chunk.type === "PROJECT" && chunk.content.includes("Progression Lab AI"))).toBe(true);
    expect(chunks.every((chunk) => chunk.title.startsWith("Resume evidence:"))).toBe(true);
  });

  it("creates bounded chunks below each evidence item", () => {
    const chunks = createEvidenceChunks({
      id: "ev_1",
      title: "Progression Lab AI",
      content: "AI-assisted music SaaS with React and TypeScript. ".repeat(80),
      type: "PROJECT",
      sourceType: "USER_INPUT",
      sourceRef: "project_1",
      tags: ["ai", "react", "typescript"],
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(8);
    expect(chunks.every((chunk) => chunk.content.length <= 900)).toBe(true);
    expect(chunks[0]?.metadata).toMatchObject({ title: "Progression Lab AI", type: "PROJECT" });
  });

  it("infers profile-relevant tags", () => {
    expect(inferEvidenceTags("React TypeScript passkeys dashboard")).toEqual(expect.arrayContaining(["react", "typescript", "webauthn", "data-visualization"]));
  });

  it("turns GitHub repository metadata into inferred project evidence", () => {
    const draft = buildGithubRepositoryEvidenceDraft("profile_1", {
      id: "repo_1",
      name: "webauthn-core",
      description: "Reusable server-side WebAuthn orchestration package with passkey adapters.",
      htmlUrl: "https://github.com/carl/webauthn-core",
      homepage: null,
      language: "TypeScript",
      topics: ["webauthn", "passkeys", "auth"],
      stars: 4,
      forks: 1,
      isFork: false,
      isArchived: false,
      pushedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(draft.type).toBe("PROJECT");
    expect(draft.sourceType).toBe("GITHUB_REPO");
    expect(draft.sourceRef).toBe("repo_1");
    expect(draft.confidence).toBe("INFERRED");
    expect(draft.content).toContain("Repository: https://github.com/carl/webauthn-core");
    expect(draft.tags).toEqual(expect.arrayContaining(["typescript", "webauthn", "security"]));
  });

  it("stores approved generated packets as writing-style evidence, not resume fact evidence", () => {
    const draft = buildApprovedApplicationPacketEvidenceDraft("profile_1", {
      id: "packet_1",
      applicationId: "app_1",
      jobPostingId: "job_1",
      company: "Linear",
      title: "Senior Frontend Engineer",
      tailoredResumeContent: "Senior frontend positioning with React and TypeScript.",
      coverLetterContent: "I have built focused SaaS UI systems with TypeScript and React.",
      recruiterMessage: "I saw the frontend platform role and wanted to share a concise fit note.",
      evidenceRefs: ["ev_1", "ev_2"],
      status: "SUBMITTED",
    });

    expect(draft.type).toBe("WRITING_STYLE");
    expect(draft.sourceType).toBe("GENERATED_BUT_APPROVED");
    expect(draft.confidence).toBe("INFERRED");
    expect(draft.usableInResume).toBe(false);
    expect(draft.usableInCoverLetter).toBe(true);
    expect(draft.usableInRecruiterMessage).toBe(true);
    expect(draft.metadata).toMatchObject({
      applicationPacketId: "packet_1",
      generatedMaterialStyleReference: true,
      sourcePacketStatus: "SUBMITTED",
      evidenceRefs: ["ev_1", "ev_2"],
    });
  });
});
