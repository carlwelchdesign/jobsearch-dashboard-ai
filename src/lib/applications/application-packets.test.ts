import { describe, expect, it } from "vitest";
import { applicationAnswerEntries, backfillApplicationPackets, buildApplicationPacketData, packetApprovalChecklist, packetApprovalState, selectApplicationPacketAnswerOption, selectedApplicationAnswers } from "@/lib/applications/application-packets";

describe("application packet aggregate", () => {
  it("stores generated resume, cover letter, QA, and evidence refs as a draft packet", () => {
    const packet = buildApplicationPacketData({
      application: { status: "ready_to_apply", resumeId: "resume_1", coverLetterId: "letter_1" },
      resume: {
        id: "resume_1",
        markdown: "# Resume",
        plainText: "Plain resume",
        generationNotes: {
          resumeStrategy: {
            evidenceRefs: ["ev_1", "ev_2"],
          },
        },
      },
      coverLetter: {
        id: "letter_1",
        body: "Cover letter",
        generationNotes: {
          applicationQa: {
            status: "PASS",
            score: 92,
            evidenceRefs: ["ev_2", "ev_3"],
          },
        },
      },
      resumeProfileId: "profile_1",
      recruiterMessage: "Recruiter note",
      companyBrief: "Company brief",
      projectLinks: [{ name: "progression-lab-ai" }],
      applicationAnswersJson: [{ id: "answer_1", question: "Why us?", options: [] }],
    });

    expect(packet.status).toBe("DRAFT");
    expect(packet.resumeProfileId).toBe("profile_1");
    expect(packet.generatedResumeId).toBe("resume_1");
    expect(packet.generatedCoverLetterId).toBe("letter_1");
    expect(packet.tailoredResumeContent).toBe("Plain resume");
    expect(packet.coverLetterContent).toBe("Cover letter");
    expect(packet.applicationAnswersJson).toEqual([{ id: "answer_1", question: "Why us?", options: [] }]);
    expect(packet.evidenceRefs).toEqual(["ev_1", "ev_2", "ev_3"]);
    expect(packet.qualityReviewJson).toMatchObject({ status: "PASS", score: 92 });
  });

  it("marks packets needing QA review as NEEDS_REVIEW", () => {
    const packet = buildApplicationPacketData({
      application: { status: "ready_to_apply", resumeId: null, coverLetterId: "letter_1" },
      resume: null,
      coverLetter: {
        id: "letter_1",
        body: "Cover letter",
        generationNotes: {
          applicationQa: {
            status: "NEEDS_REVIEW",
            score: 64,
            evidenceRefs: [],
          },
        },
      },
    });

    expect(packet.status).toBe("NEEDS_REVIEW");
  });

  it("marks packets with blocked material quality as NEEDS_REVIEW", () => {
    const packet = buildApplicationPacketData({
      application: { status: "ready_to_apply", resumeId: "resume_1", coverLetterId: "letter_1" },
      resume: null,
      coverLetter: {
        id: "letter_1",
        body: "Weak cover letter",
        generationNotes: {
          applicationQa: {
            status: "PASS",
            score: 90,
            evidenceRefs: ["ev_1"],
          },
          materialQuality: {
            status: "BLOCKED",
            launchable: false,
            reason: "Cover letter used deterministic fallback output and must be regenerated or reviewed before launch.",
            reasons: ["deterministic_fallback"],
            score: 40,
            generatedBy: "deterministic_fallback",
            evidenceRefs: [],
          },
        },
      },
    });

    expect(packet.status).toBe("NEEDS_REVIEW");
    expect(packet.qualityReviewJson).toMatchObject({
      status: "PASS",
      materialQuality: {
        launchable: false,
      },
    });
  });


  it("marks applied packets as submitted", () => {
    const packet = buildApplicationPacketData({
      application: { status: "applied", resumeId: "resume_1", coverLetterId: "letter_1" },
      resume: null,
      coverLetter: null,
    });

    expect(packet.status).toBe("SUBMITTED");
  });

  it("preserves user approval while refreshing packet materials", () => {
    const packet = buildApplicationPacketData({
      application: { status: "ready_to_apply", resumeId: "resume_1", coverLetterId: "letter_1" },
      resume: null,
      coverLetter: null,
      existingStatus: "APPROVED",
    });

    expect(packet.status).toBe("APPROVED");
  });

  it("allows approval only when generated materials are present and QA does not need review", () => {
    expect(packetApprovalState({
      status: "DRAFT",
      tailoredResumeContent: "Resume",
      coverLetterContent: "Cover letter",
      qualityReviewJson: { status: "PASS" },
    })).toMatchObject({ canApprove: true });

    expect(packetApprovalState({
      status: "NEEDS_REVIEW",
      tailoredResumeContent: "Resume",
      coverLetterContent: "Cover letter",
      qualityReviewJson: { status: "NEEDS_REVIEW" },
    })).toMatchObject({ canApprove: false });

    expect(packetApprovalState({
      status: "DRAFT",
      tailoredResumeContent: null,
      coverLetterContent: "Cover letter",
      qualityReviewJson: { status: "PASS" },
    })).toMatchObject({ canApprove: false });

    expect(packetApprovalState({
      status: "DRAFT",
      tailoredResumeContent: "Resume",
      coverLetterContent: "Cover letter",
      qualityReviewJson: { status: "PASS", materialQuality: { launchable: false } },
    })).toMatchObject({ canApprove: false });
  });

  it("explains packet approval readiness for the UI", () => {
    const checklist = packetApprovalChecklist({
      status: "NEEDS_REVIEW",
      tailoredResumeContent: "Resume",
      coverLetterContent: null,
      qualityReviewJson: { status: "NEEDS_REVIEW" },
    });

    expect(checklist).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Tailored resume", complete: true }),
      expect.objectContaining({ label: "Cover letter", complete: false }),
      expect.objectContaining({ label: "QA review", complete: false }),
    ]));
  });

  it("reads saved application answer entries defensively", () => {
    const entries = applicationAnswerEntries([
      { question: "Why this role?", selectedOptionIndex: 0, options: [{ title: "Direct", answer: "Because it fits.", evidence: [], tone: "brief", cautions: [] }] },
      { question: 42, options: [] },
      null,
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.question).toBe("Why this role?");
    expect(entries[0]?.selectedOptionIndex).toBe(0);
  });

  it("exports selection helper for saved answer options", () => {
    expect(typeof selectApplicationPacketAnswerOption).toBe("function");
  });

  it("returns only selected application answers for the assistant package", () => {
    const selected = selectedApplicationAnswers([
      {
        question: "How did you find this role?",
        selectedOptionIndex: 1,
        selectedAt: "2026-01-01T00:00:00.000Z",
        options: [
          { title: "A", answer: "First", evidence: [], tone: "brief", cautions: [] },
          { title: "B", answer: "Selected answer", evidence: ["source"], tone: "direct", cautions: ["review"] },
        ],
      },
      {
        question: "Unselected",
        options: [{ title: "C", answer: "Ignored", evidence: [], tone: "brief", cautions: [] }],
      },
    ]);

    expect(selected).toEqual([
      {
        question: "How did you find this role?",
        title: "B",
        answer: "Selected answer",
        evidence: ["source"],
        cautions: ["review"],
        selectedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("exports a backfill function for existing applications", () => {
    expect(typeof backfillApplicationPackets).toBe("function");
  });
});
