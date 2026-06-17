import type { ExperienceBullet, JobPosting, Project } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildApplicationEvidencePlan } from "@/lib/agents/application-evidence-curator";
import { reviewCoverLetterForHiringManager } from "@/lib/agents/hiring-manager-reviewer";

describe("application evidence curator", () => {
  it("avoids unrelated AR and defense bullets for product engineering roles", () => {
    const plan = buildApplicationEvidencePlan({
      job: {
        company: "Linear",
        title: "Product Engineer",
        description: "Build React, TypeScript, GraphQL, PostgreSQL, AI-powered product workflows, and polished UX.",
        requirements: [],
        niceToHaves: [],
      } as unknown as JobPosting,
      bullets: [
        {
          id: "defense_1",
          company: "General Dynamics",
          role: "R&D Lead",
          text: "Built augmented reality maintenance tools for military vehicle training.",
          keywords: ["AR", "VR", "defense"],
        },
        {
          id: "product_1",
          company: "Yubico",
          role: "Senior Software Engineer",
          text: "Built customer-facing React and TypeScript workflows with API integrations, product UX polish, and component quality.",
          keywords: ["React", "TypeScript", "UX", "API"],
        },
      ] as ExperienceBullet[],
      projects: [
        {
          id: "job_search_os",
          name: "Job Search OS",
          description: "Full-stack TypeScript product with AI agent workflows, RAG, PostgreSQL, browser automation, and review gates.",
          technologies: ["React", "TypeScript", "PostgreSQL", "AI"],
          highlights: [],
        },
      ] as unknown as Project[],
    });

    expect(plan.status).toBe("READY");
    expect(plan.proofPoints.map((point) => point.sourceId)).toContain("product_1");
    expect(plan.proofPoints.map((point) => point.sourceId)).not.toContain("defense_1");
    expect(plan.avoidedSignals).toContain("General Dynamics - R&D Lead");
  });
});

describe("hiring manager reviewer", () => {
  it("passes a specific product-engineering letter with supported signals", () => {
    const review = reviewCoverLetterForHiringManager({
      job: {
        company: "Linear",
        title: "Product Engineer",
        description: "Build React, TypeScript, GraphQL, PostgreSQL, AI-powered functionality, UX polish, and performance.",
        requirements: [],
        niceToHaves: [],
      } as unknown as JobPosting,
      generatedBy: "openai_structured_outputs",
      evidencePlan: {
        status: "READY",
        jobSignals: ["react", "typescript", "graphql", "postgresql", "product", "ux", "ai"],
        proofPoints: [
          {
            sourceType: "experience_bullet",
            sourceId: "product_1",
            title: "Yubico - Senior Software Engineer",
            summary: "Built customer-facing React and TypeScript workflows with API integrations and UX polish.",
            relevance: 54,
            keywords: ["react", "typescript", "product", "ux"],
          },
          {
            sourceType: "project",
            sourceId: "job_search_os",
            title: "Job Search OS",
            summary: "Built full-stack AI product workflows using TypeScript, PostgreSQL, RAG, and review gates.",
            relevance: 48,
            keywords: ["typescript", "postgresql", "ai", "product"],
          },
        ],
        evidenceRefs: ["product_1", "job_search_os"],
        avoidedSignals: [],
        warnings: [],
        rationale: "Use product evidence.",
        confidence: 0.86,
      },
      coverLetterBody: [
        "Dear Linear hiring team,",
        "",
        "Linear's Product Engineer role matches my recent work building React and TypeScript product systems with full stack ownership. I have shipped customer-facing workflows, collaborated on API contracts, and focused on UX polish, performance, and maintainable components.",
        "",
        "At Yubico, I built product interfaces for security workflows while partnering with product and backend teams. In Job Search OS, I built AI-powered agent workflows with PostgreSQL-backed state, RAG, and review gates, which maps to Linear's work on product development systems for teams and agents.",
        "",
        "That combination gives me a practical base for shaping features without heavy PM overhead, keeping implementation details close to user experience, and improving performance and reliability while still moving quickly in an async startup environment.",
        "",
        "I have also worked across remote product teams where written context, ownership, and pragmatic tradeoffs mattered. That is the operating style I would bring to Linear: shape the problem, build the interface and supporting data flow, keep the product fast, and make the result feel carefully finished for demanding users.",
        "",
        "Best,",
        "Carl Welch",
      ].join("\n"),
      applicationQa: { status: "PASS", score: 94, evidenceRefs: ["product_1", "job_search_os"] },
    });

    expect(review.status).toBe("PASS");
    expect(review.score).toBeGreaterThanOrEqual(85);
    expect(review.genericSignals).toEqual([]);
  });
});
