import { describe, expect, it } from "vitest";
import { buildEmailApplicationEventPayload, classifyJobEmail, scoreEmailApplicationMatch } from "@/lib/email-response-agent";

describe("email response agent", () => {
  it("classifies rejection emails without requiring user action", () => {
    const result = classifyJobEmail({
      subject: "Update on your application",
      snippet: "Unfortunately, we are not moving forward.",
      bodyText: null,
    });

    expect(result).toMatchObject({
      classification: "REJECTION",
      actionRequired: false,
      recommendedOutcome: "REJECTED",
    });
  });

  it("classifies explicit not moving forward language as rejection even when the email thanks the applicant", () => {
    const result = classifyJobEmail({
      subject: "Linear application update",
      snippet: "Thanks for your interest in Linear and for taking the time to apply.",
      bodyText: "We reviewed your application and, for this role, decided not to move forward at this time. We encourage you to keep an eye on future roles.",
    });

    expect(result).toMatchObject({
      classification: "REJECTION",
      actionRequired: false,
      recommendedOutcome: "REJECTED",
    });
  });

  it("does not classify generic future-role rejection language as an offer", () => {
    const result = classifyJobEmail({
      subject: "Application status",
      snippet: "While we're unable to proceed here, future roles may be a better fit.",
      bodyText: null,
    });

    expect(result.classification).toBe("REJECTION");
    expect(result.recommendedOutcome).toBe("REJECTED");
  });

  it("records application received confirmations as applied outcomes", () => {
    const result = classifyJobEmail({
      subject: "Application received",
      snippet: "Thanks for applying. We have received your application.",
      bodyText: null,
    });

    expect(result).toMatchObject({
      classification: "AUTOMATED_CONFIRMATION",
      actionRequired: false,
      recommendedOutcome: "APPLIED",
    });
  });

  it("does not treat thank-you-for-interest receipt language as a rejection by itself", () => {
    const result = classifyJobEmail({
      subject: "Thank you for Applying to Amplitude",
      snippet: "Thank you for your interest in Amplitude. We received your application for the Senior Software Engineer, Product Adoption role.",
      bodyText: null,
    });

    expect(result).toMatchObject({
      classification: "AUTOMATED_CONFIRMATION",
      actionRequired: false,
      recommendedOutcome: "APPLIED",
    });
  });

  it("only classifies offers when the message contains explicit offer intent", () => {
    const result = classifyJobEmail({
      subject: "Your offer letter",
      snippet: "We are pleased to extend you an offer.",
      bodyText: null,
    });

    expect(result).toMatchObject({
      classification: "OFFER",
      actionRequired: true,
      recommendedOutcome: "OFFER",
    });
  });

  it("does not match unrelated marketing email to a company just because the body contains the company name", () => {
    const score = scoreEmailApplicationMatch(
      {
        company: "Linear",
        title: "Senior / Staff Product Engineer",
        applicationUrl: "https://jobs.ashbyhq.com/linear/example",
      },
      {
        from: "Affirm <email@e.affirm.com>",
        subject: "Last chance for longer 0% APR options",
        snippet: "A financing offer for your next purchase.",
        bodyText: "Flexible linear payment examples and promotional terms.",
      },
    );

    expect(score).toBeLessThan(2);
  });

  it("matches a real ATS application response by subject and sender context", () => {
    const score = scoreEmailApplicationMatch(
      {
        company: "Linear",
        title: "Senior / Staff Product Engineer",
        applicationUrl: "https://jobs.ashbyhq.com/linear/example",
      },
      {
        from: "Talent at Linear <no-reply@ashbyhq.com>",
        subject: "Thanks for your interest in Linear",
        snippet: "We reviewed your application for the Senior / Staff Product Engineer role.",
        bodyText: null,
      },
    );

    expect(score).toBeGreaterThanOrEqual(2);
  });

  it("classifies scheduling emails as actionable interview prep", () => {
    const result = classifyJobEmail({
      subject: "Next step with Acme",
      snippet: "Can you share availability to schedule a call?",
      bodyText: null,
    });

    expect(result).toMatchObject({
      classification: "SCHEDULING_REQUEST",
      actionRequired: true,
      recommendedOutcome: "RECRUITER_SCREEN",
    });
  });

  it("classifies technical assessments separately from generic interviews", () => {
    const result = classifyJobEmail({
      subject: "CodeSignal assessment",
      snippet: "Please complete the technical assessment.",
      bodyText: null,
    });

    expect(result).toMatchObject({
      classification: "CODING_ASSESSMENT",
      actionRequired: true,
      recommendedOutcome: "TECH_SCREEN",
    });
  });

  it("classifies recruiter follow-ups as approval-gated recruiter responses", () => {
    const result = classifyJobEmail({
      subject: "Following up on next steps",
      snippet: "The hiring team asked me to follow up about next steps.",
      bodyText: null,
    });

    expect(result).toMatchObject({
      classification: "RECRUITER_RESPONSE",
      actionRequired: true,
      recommendedOutcome: "RECRUITER_SCREEN",
    });
  });

  it("builds a compact application timeline payload for matched emails", () => {
    const classification = classifyJobEmail({
      subject: "Next step with Acme",
      snippet: "Can you share availability to schedule a call?",
      bodyText: null,
    });

    expect(buildEmailApplicationEventPayload({
      emailMessageId: "email_1",
      from: "recruiter@acme.example",
      subject: "Next step with Acme",
      receivedAt: new Date("2026-05-15T12:00:00.000Z"),
      classification,
    })).toEqual({
      source: "email_response_agent",
      emailMessageId: "email_1",
      from: "recruiter@acme.example",
      subject: "Next step with Acme",
      receivedAt: "2026-05-15T12:00:00.000Z",
      classification: "SCHEDULING_REQUEST",
      confidenceScore: 84,
      actionRequired: true,
      recommendedOutcome: "RECRUITER_SCREEN",
      rationale: "Detected interview or scheduling language.",
    });
  });
});
