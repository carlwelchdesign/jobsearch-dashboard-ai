import { describe, expect, it } from "vitest";
import { classifyObservedField } from "@/lib/applications/field-learning";

describe("application field learning", () => {
  it("auto-saves low-sensitivity reusable fields", () => {
    expect(classifyObservedField({
      label: "How did you hear about this role?",
      category: "referral_source",
      inputType: "select",
      selector: "select#source",
      answer: "Company careers page",
    })).toMatchObject({
      blocked: false,
      sensitivity: "LOW",
      reusePolicy: "AUTO_USE",
      status: "ACTIVE",
    });
  });

  it("approval-gates compensation and sponsorship fields", () => {
    expect(classifyObservedField({
      label: "What are your salary expectations?",
      inputType: "input",
      answer: "$150,000",
    })).toMatchObject({
      blocked: false,
      sensitivity: "HIGH",
      reusePolicy: "ASK_FIRST",
      status: "NEEDS_REVIEW",
    });

    expect(classifyObservedField({
      label: "Will you require visa sponsorship?",
      inputType: "radio",
      answer: "No",
    })).toMatchObject({
      blocked: false,
      sensitivity: "HIGH",
      reusePolicy: "ASK_FIRST",
      status: "NEEDS_REVIEW",
    });
  });

  it("keeps long custom application questions in review even when labels contain low-risk words", () => {
    expect(classifyObservedField({
      label: "Describe an interesting software abstraction you have built in a professional context.",
      category: "location",
      inputType: "textarea",
      answer: "A detailed project answer.",
    })).toMatchObject({
      blocked: false,
      sensitivity: "MEDIUM",
      reusePolicy: "ASK_FIRST",
      status: "NEEDS_REVIEW",
    });
  });

  it("blocks secrets and file fields", () => {
    expect(classifyObservedField({
      label: "Password",
      inputType: "password",
      answer: "secret",
    })).toMatchObject({ blocked: true });

    expect(classifyObservedField({
      label: "Resume upload",
      inputType: "file",
      answer: "resume.pdf",
    })).toMatchObject({ blocked: true });
  });

  it("blocks Netflix-style OTP, CAPTCHA, and cookie controls", () => {
    for (const label of [
      "please enter otp character 1",
      "g-recaptcha-response g-recaptcha-response-100000",
      "cf-turnstile-response",
      "advertising cookies ot-group-id-c0004",
      "vendor-search-handler cookie list search",
    ]) {
      expect(classifyObservedField({
        label,
        inputType: "text",
        answer: "checked",
      })).toMatchObject({ blocked: true });
    }
  });

  it("keeps demographic and legal fields review-gated", () => {
    expect(classifyObservedField({
      label: "I identify as one or more of the classifications of protected veteran listed above",
      inputType: "radio",
      answer: "I am a US veteran in a protected status",
    })).toMatchObject({
      blocked: false,
      sensitivity: "HIGH",
      reusePolicy: "ASK_FIRST",
      status: "NEEDS_REVIEW",
    });
  });
});
