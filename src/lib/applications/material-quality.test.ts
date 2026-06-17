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
});
