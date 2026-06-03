import type { CandidateEvidence, JobPosting, UserProfile } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildThankYouDraft, reviewThankYouDraft, thankYouStageLabel } from "@/lib/applications/thank-you-drafts";

describe("thank-you drafts", () => {
  it("builds recruiter-screen email and LinkedIn drafts from interview context", () => {
    const draft = buildThankYouDraft({
      job: {
        company: "Amplitude",
        title: "Senior Software Engineer, Product Adoption",
        description: "Product adoption role using React and analytics workflows.",
      } as JobPosting,
      profile: {
        fullName: "Carl Welch",
        githubUrl: "https://github.com/carl",
        linkedinUrl: "https://linkedin.com/in/carl",
        portfolioUrl: null,
      } as UserProfile,
      stage: "recruiter_screen",
      interviewerName: "Lavanya Shahani",
      interviewerTitle: "Principal Technical Recruiter / Talent Advisor",
      interviewDate: new Date("2026-06-03T12:00:00.000Z"),
      notes: "I appreciated the overview of the Product Adoption team.\nThe role sounds focused on activation and customer-facing workflows.",
      tone: "professional",
      evidence: [
        {
          id: "ev1",
          title: "Progression Lab AI",
          content: "Built a Next.js product with structured OpenAI outputs, Prisma, and user-facing workflow automation.",
          tags: ["nextjs", "product-engineering"],
          confidence: "VERIFIED",
        },
      ] as CandidateEvidence[],
    });

    expect(draft.emailSubject).toBe("Thank you - Amplitude recruiter screen");
    expect(draft.emailBody).toContain("Hi Lavanya,");
    expect(draft.emailBody).toContain("Senior Software Engineer, Product Adoption");
    expect(draft.emailBody).toContain("Amplitude");
    expect(draft.emailBody).toContain("Progression Lab AI");
    expect(draft.emailBody).not.toContain("—");
    expect(draft.linkedinBody.length).toBeLessThan(draft.emailBody.length);
    expect(draft.evidenceRefs).toEqual(["ev1"]);
    expect(reviewThankYouDraft(draft.emailBody, draft.linkedinBody, draft.evidenceRefs).status).toBe("PASS");
  });

  it("flags unsupported and over-styled drafts", () => {
    const review = reviewThankYouDraft("This was transformative — and cutting-edge.", "Thanks — cutting-edge.", []);
    expect(review.status).toBe("NEEDS_REVIEW");
    expect(review.warnings).toContain("No evidence references are attached to this thank-you draft.");
    expect(review.styleViolations).toEqual(expect.arrayContaining(["Uses an em dash.", "Uses hype language."]));
  });

  it("falls back cleanly for custom stages", () => {
    expect(thankYouStageLabel("custom")).toBe("interview");
    expect(thankYouStageLabel("unknown")).toBe("interview");
  });
});
