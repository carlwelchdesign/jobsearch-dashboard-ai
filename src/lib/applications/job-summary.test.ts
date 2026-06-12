import { describe, expect, it } from "vitest";
import { summarizeApplicationJobDescription } from "@/lib/applications/job-summary";

describe("summarizeApplicationJobDescription", () => {
  it("skips ABOUT THE COMPANY and summarizes ABOUT THE ROLE content", () => {
    const summary = summarizeApplicationJobDescription({
      company: "Braintrust",
      title: "Documentation Engineer",
      description: `
        ABOUT THE COMPANY
        Braintrust is the AI observability platform. Teams at Notion, Stripe, and Vercel use Braintrust.

        ABOUT THE ROLE
        At Braintrust, documentation is a core part of the product experience. You will build technical guides, own API reference quality, and collaborate with engineering on developer-facing workflows.
      `,
    });

    expect(summary).toContain("documentation is a core part of the product experience");
    expect(summary).not.toContain("AI observability platform");
    expect(summary).not.toContain("ABOUT THE COMPANY");
  });

  it("decodes encoded ATS HTML before choosing role sentences", () => {
    const summary = summarizeApplicationJobDescription({
      company: "Cursor",
      title: "Software Engineer, Billing",
      description: `
        &lt;p&gt;Our mission is to automate coding. We build tools for professional programmers.&lt;/p&gt;
        &lt;h3&gt;ABOUT THE ROLE&lt;/h3&gt;
        &lt;p&gt;We're hiring a Software Engineer, Billing to evolve the systems that power how Cursor charges customers and manages subscriptions.&lt;/p&gt;
      `,
    });

    expect(summary).toContain("Software Engineer, Billing");
    expect(summary).toContain("charges customers");
    expect(summary).not.toContain("&lt;");
    expect(summary).not.toContain("Our mission is to automate coding");
  });

  it("does not turn application form captures into fake job summaries", () => {
    const summary = summarizeApplicationJobDescription({
      company: "ElevenLabs",
      title: "Full-Stack Engineer",
      description: "NameEmailLocationCountry you're currently residing inResumeUpload Fileor drag and drop hereHow did you hear about ElevenLabs?",
    });

    expect(summary).toBe("Job description unavailable; saved text appears to be the application form.");
  });

  it("does not use unheaded company mission text as a job summary", () => {
    const summary = summarizeApplicationJobDescription({
      company: "Cursor",
      title: "Software Engineer, Generalist",
      description: "Our mission is to automate coding. The first step in our journey is to build the best tool for professional programmers, using inventive research, design, and engineering. Software Engineer, Generalist #LI-DNI",
    });

    expect(summary).toBe("Software Engineer, Generalist at Cursor; job description needs cleanup.");
  });
});
