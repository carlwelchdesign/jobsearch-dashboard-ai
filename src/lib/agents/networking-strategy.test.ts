import { describe, expect, it } from "vitest";
import { buildNetworkingStrategy } from "@/lib/agents/networking-strategy";

describe("networking strategy agent", () => {
  it("prioritizes high-opportunity applications without outreach", () => {
    const output = buildNetworkingStrategy({
      applications: [
        application({
          id: "app_1",
          company: "Vercel",
          title: "Senior Frontend Engineer",
          opportunityScore: 88,
        }),
      ],
      outreach: [],
      contacts: [],
    });

    expect(output.actionItems[0]?.type).toBe("find_contact");
    expect(output.actionItems[0]?.priority).toBe(1);
    expect(output.contactGaps[0]?.company).toBe("Vercel");
    expect(output.messagingWarnings).toContain("No contacts are saved for active applications.");
  });

  it("surfaces due follow-ups ahead of other actions", () => {
    const output = buildNetworkingStrategy({
      applications: [
        application({
          id: "app_1",
          company: "Linear",
          title: "Product Engineer",
          opportunityScore: 70,
          sourceContactId: "contact_1",
        }),
      ],
      outreach: [
        {
          id: "outreach_1",
          status: "SENT",
          message: "Short note",
          followUpAt: new Date("2025-01-01T00:00:00.000Z"),
          qualityReview: { status: "PASS" },
          jobPostingId: "job_1",
          contactId: "contact_1",
          contact: { id: "contact_1", name: "Sam Recruiter", title: "Recruiter", company: "Linear" },
          jobPosting: { id: "job_1", company: "Linear", title: "Product Engineer" },
        },
      ],
      contacts: [{ id: "contact_1", name: "Sam Recruiter", title: "Recruiter", company: "Linear", email: null, linkedinUrl: "https://linkedin.com/in/sam" }],
    });

    expect(output.actionItems[0]?.type).toBe("follow_up");
    expect(output.followUpsDue[0]?.contactName).toBe("Sam Recruiter");
  });

  it("flags recruiter drafts that need revision", () => {
    const output = buildNetworkingStrategy({
      applications: [],
      outreach: [
        {
          id: "outreach_1",
          status: "DRAFT",
          message: "I am excited to apply for this game-changing role.",
          followUpAt: null,
          qualityReview: { status: "NEEDS_REVIEW" },
          jobPostingId: "job_1",
          contactId: null,
          contact: null,
          jobPosting: { id: "job_1", company: "OpenAI", title: "Product Engineer" },
        },
      ],
      contacts: [],
    });

    expect(output.actionItems[0]?.type).toBe("revise_message");
    expect(output.messagingWarnings).toContain("Some recruiter drafts need review before use.");
  });
});

function application({
  id,
  company,
  title,
  opportunityScore,
  sourceContactId = null,
}: {
  id: string;
  company: string;
  title: string;
  opportunityScore: number;
  sourceContactId?: string | null;
}) {
  return {
    id,
    status: "approved" as const,
    followUpAt: null,
    sourceContactId,
    jobPostingId: `job_${id}`,
    sourceContact: sourceContactId ? { id: sourceContactId, name: "Contact", title: "Recruiter", company } : null,
    jobPosting: {
      id: `job_${id}`,
      company,
      title,
      applicationUrl: null,
      evaluations: [{ opportunityScore, fitScore: opportunityScore - 5, recommendedAction: "APPLY_NOW" as const }],
    },
  };
}
