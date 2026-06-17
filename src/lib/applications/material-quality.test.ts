import { describe, expect, it } from "vitest";
import { buildApplicationMaterialQuality } from "@/lib/applications/material-quality";

const linearFallbackLetter = `Dear Linear hiring team,

I am interested in the Product Engineer role. My background is strongest in React, TypeScript, JavaScript, Node.js, React Native, Redux, Redux-Saga, Material UI, with a focus on building practical product interfaces that are maintainable, testable, and useful for experienced users.

Relevant examples from my approved profile include: Built proof-of-concept AR applications enabling subject matter experts to view field engineers' AR content and provide real-time feedback Developed conceptual augmented reality applications for interactive remove-and-replace instructions and distance maintenance support using specialized diagnostic equipment Received over $300K in funding from General Motors Defense Systems for VR and AR R&D projects

One relevant example is my Agentic job search assistant, which uses agentic workflows, RAG, MCP, LangGraph, LangSmith-style observability, browser automation, email outcome tracking, application state reconciliation, duplicate detection, and learned feedback loops to review jobs against my actual experience, prepare tailored materials, track decisions, and surface better-fit opportunities over time.

I would welcome a conversation about how this experience maps to Linear's needs for this role.

Best,
Carl Welch`;

describe("application material quality", () => {
  it("blocks the Linear deterministic fallback cover letter", () => {
    const quality = buildApplicationMaterialQuality({
      body: linearFallbackLetter,
      generatedBy: "deterministic_fallback",
      hiringManagerReview: {
        status: "BLOCKED",
        score: 36,
        strengths: [],
        concerns: ["Generic and off-target."],
        missingSignals: ["GraphQL", "PostgreSQL"],
        unsupportedClaims: [],
        genericSignals: ["fallback_approved_profile_examples"],
        rewriteRecommended: false,
        reasoningSummary: "Fallback letter is not role-specific.",
        confidence: 0.9,
      },
      applicationQa: { status: "NEEDS_REVIEW", score: 74, evidenceRefs: [] },
    });

    expect(quality.launchable).toBe(false);
    expect(quality.status).toBe("BLOCKED");
    expect(quality.reasons).toEqual(expect.arrayContaining([
      "deterministic_fallback",
      "fallback_approved_profile_examples",
      "forced_agentic_job_search_paragraph",
    ]));
  });

  it("allows a specific reviewed Linear Product Engineer cover letter", () => {
    const body = [
      "Dear Linear hiring team,",
      "",
      "Linear's Product Engineer role matches my recent work building full-stack TypeScript product systems where speed, UX, and clear ownership mattered. I have built React interfaces, Node and PostgreSQL-backed workflows, and reviewable AI-assisted product features that keep human control visible.",
      "",
      "At Yubico, I built customer-facing React and TypeScript workflows for security products, partnered across product and backend teams on API contracts, and helped improve component quality through Storybook and testable UI patterns. In Job Search OS, I have been building agentic workflows with RAG, browser automation, application-state reconciliation, and observable review gates, which maps directly to Linear's interest in AI-powered product development systems.",
      "",
      "I would bring a product-engineering bias toward fast, polished interfaces, careful async collaboration, and ownership from problem shape through shipped behavior.",
      "",
      "Best,",
      "Carl Welch",
    ].join("\n");

    const quality = buildApplicationMaterialQuality({
      body,
      generatedBy: "openai_structured_outputs",
      evidencePlan: {
        status: "READY",
        jobSignals: ["react", "typescript", "full stack", "product", "ai"],
        proofPoints: [],
        evidenceRefs: ["ev_yubico", "ev_job_search_os"],
        avoidedSignals: [],
        warnings: [],
        rationale: "Use product engineering proof points.",
        confidence: 0.86,
      },
      hiringManagerReview: {
        status: "PASS",
        score: 92,
        strengths: ["Specific product engineering proof."],
        concerns: [],
        missingSignals: [],
        unsupportedClaims: [],
        genericSignals: [],
        rewriteRecommended: false,
        reasoningSummary: "Specific and evidence-backed.",
        confidence: 0.86,
      },
      applicationQa: { status: "PASS", score: 94, evidenceRefs: ["ev_yubico", "ev_job_search_os"] },
    });

    expect(quality.launchable).toBe(true);
    expect(quality.status).toBe("PASS");
  });

  it("allows reviewed OpenAI cover letters that pass QA above the review floor", () => {
    const body = [
      "Dear Zettabyte hiring team,",
      "",
      "The Frontend Engineer role matches my verified React and TypeScript work on product workflows that need clear UX judgment and reliable implementation.",
      "I have built customer-facing interfaces, improved component quality, and partnered across product and engineering to make complex workflows easier to use.",
      "That background maps well to the role's focus on frontend execution, UI quality, and practical product collaboration.",
      "My recent work has centered on translating ambiguous user needs into concrete product flows, building the interfaces behind those flows, and keeping the implementation maintainable enough for fast iteration.",
      "I would bring that same mix of product judgment, frontend craft, and steady engineering collaboration to the team.",
      "I am especially effective in product environments where the interface has to make complex data, workflows, and edge cases understandable without burying users in unnecessary process.",
      "That is the same judgment I would apply here: ship useful frontend work quickly, keep the experience clear, and make the technical choices durable enough for the next iteration.",
      "",
      "Best,",
      "Carl Welch",
    ].join("\n");

    const quality = buildApplicationMaterialQuality({
      body,
      generatedBy: "openai_structured_outputs",
      evidencePlan: {
        status: "READY",
        jobSignals: ["react", "typescript", "product", "ux"],
        proofPoints: [],
        evidenceRefs: ["ev_product_workflows"],
        avoidedSignals: [],
        warnings: [],
        rationale: "Use verified frontend product workflow evidence.",
        confidence: 0.86,
      },
      hiringManagerReview: {
        status: "PASS",
        score: 88,
        strengths: ["Specific and relevant."],
        concerns: [],
        missingSignals: [],
        unsupportedClaims: [],
        genericSignals: [],
        rewriteRecommended: false,
        reasoningSummary: "Specific and evidence-backed.",
        confidence: 0.86,
      },
      applicationQa: {
        status: "PASS",
        score: 82,
        warnings: [],
        unsupportedClaims: [],
        styleViolations: [],
        evidenceRefs: ["ev_product_workflows"],
      },
    });

    expect(quality.launchable).toBe(true);
    expect(quality.status).toBe("PASS");
    expect(quality.reasons).not.toContain("application_qa_score_below_pass");
  });

  it("treats style-only QA findings as advisory when the reviewed letter is otherwise launchable", () => {
    const body = [
      "Dear Notion hiring team,",
      "",
      "The Developer Advocate role matches my verified work building developer-facing product workflows, explaining technical systems, and turning complex implementation details into usable guidance.",
      "I have built React and TypeScript interfaces, documented agentic workflows, and partnered across product and engineering to make sophisticated tools easier for users to adopt.",
      "That background maps directly to developer advocacy work that needs credibility with engineers, strong product judgment, and practical examples from shipped systems.",
      "I would bring a builder's perspective to the team, with enough communication range to explain tradeoffs clearly and enough implementation depth to stay grounded in real usage.",
      "My goal would be to help developers understand what the product can do, where it fits in their workflow, and how to get from exploration to reliable adoption.",
      "",
      "Best,",
      "Carl Welch",
    ].join("\n");

    const quality = buildApplicationMaterialQuality({
      body,
      generatedBy: "openai_structured_outputs",
      evidencePlan: {
        status: "READY",
        jobSignals: ["developer", "product", "typescript"],
        proofPoints: [],
        evidenceRefs: ["ev_developer_workflows"],
        avoidedSignals: [],
        warnings: [],
        rationale: "Use verified developer workflow evidence.",
        confidence: 0.86,
      },
      hiringManagerReview: {
        status: "PASS",
        score: 92,
        strengths: ["Specific developer-facing evidence."],
        concerns: [],
        missingSignals: [],
        unsupportedClaims: [],
        genericSignals: [],
        rewriteRecommended: false,
        reasoningSummary: "Specific and evidence-backed.",
        confidence: 0.86,
      },
      applicationQa: {
        status: "NEEDS_REVIEW",
        score: 90,
        warnings: [],
        unsupportedClaims: [],
        styleViolations: ["Uses em dash or en dash punctuation."],
        evidenceRefs: ["ev_developer_workflows"],
      },
    });

    expect(quality.launchable).toBe(true);
    expect(quality.reasons).not.toContain("style_violations_detected");
    expect(quality.reasons).not.toContain("application_qa_needs_review");
  });

  it("blocks deterministic material with an explicit OpenAI quota failure reason", () => {
    const quality = buildApplicationMaterialQuality({
      body: "Dear Linear hiring team,\n\nThis fallback draft is saved for review only because the structured cover-letter writer was unavailable.\n\nBest,\nCarl Welch",
      generatedBy: "deterministic_fallback",
      generationFailure: {
        provider: "openai",
        code: "openai_insufficient_quota",
        message: "OpenAI quota is exhausted; structured cover-letter generation could not run.",
        retryable: false,
      },
      hiringManagerReview: {
        status: "BLOCKED",
        score: 32,
        strengths: [],
        concerns: ["Generated by deterministic fallback instead of structured cover-letter writer."],
        missingSignals: ["React"],
        unsupportedClaims: [],
        genericSignals: [],
        rewriteRecommended: false,
        reasoningSummary: "Fallback letter is not launchable.",
        confidence: 0.9,
      },
    });

    expect(quality.launchable).toBe(false);
    expect(quality.reasons).toEqual(expect.arrayContaining(["deterministic_fallback", "openai_insufficient_quota"]));
    expect(quality.reason).toContain("OpenAI quota is exhausted");
    expect(quality.generationFailure?.retryable).toBe(false);
  });
});
