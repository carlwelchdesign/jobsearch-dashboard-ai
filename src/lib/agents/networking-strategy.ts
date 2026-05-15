import type { Application, Contact, JobEvaluation, JobPosting, RecruiterOutreach } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import { prisma } from "@/lib/prisma";

export type NetworkingStrategyInput = {
  userId?: string;
};

export type NetworkingStrategyOutput = {
  actionItems: Array<{
    type: "draft_outreach" | "follow_up" | "find_contact" | "revise_message" | "track_outcome";
    priority: 1 | 2 | 3;
    company: string;
    role?: string;
    jobId?: string;
    contactId?: string;
    outreachId?: string;
    summary: string;
    rationale: string;
  }>;
  contactGaps: Array<{
    company: string;
    openApplications: number;
    highestOpportunityScore: number;
    suggestedSearch: string;
  }>;
  followUpsDue: Array<{
    outreachId: string;
    company: string;
    contactName: string | null;
    followUpAt: string;
    summary: string;
  }>;
  messagingWarnings: string[];
  confidence: number;
  reasoningSummary: string;
};

type ApplicationRecord = Pick<Application, "id" | "status" | "followUpAt" | "sourceContactId" | "jobPostingId"> & {
  jobPosting: Pick<JobPosting, "id" | "company" | "title" | "applicationUrl"> & {
    evaluations: Array<Pick<JobEvaluation, "opportunityScore" | "fitScore" | "recommendedAction">>;
  };
  sourceContact: Pick<Contact, "id" | "name" | "title" | "company"> | null;
};

type OutreachRecord = Pick<RecruiterOutreach, "id" | "status" | "message" | "followUpAt" | "qualityReview" | "jobPostingId" | "contactId"> & {
  contact: Pick<Contact, "id" | "name" | "title" | "company"> | null;
  jobPosting: Pick<JobPosting, "id" | "company" | "title"> | null;
};

export async function runNetworkingStrategyAgent(input: NetworkingStrategyInput = {}) {
  return runAgent<NetworkingStrategyInput, NetworkingStrategyOutput>({
    agentType: "NETWORKING_STRATEGY",
    input,
    userId: input.userId,
    execute: async () => {
      const [applications, outreach, contacts] = await Promise.all([
        prisma.application.findMany({
          where: input.userId ? { userId: input.userId } : undefined,
          include: {
            sourceContact: true,
            jobPosting: {
              include: {
                evaluations: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                },
              },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 120,
        }),
        prisma.recruiterOutreach.findMany({
          where: input.userId ? { userId: input.userId } : undefined,
          include: { contact: true, jobPosting: true },
          orderBy: { updatedAt: "desc" },
          take: 120,
        }),
        prisma.contact.findMany({
          where: input.userId ? { userId: input.userId } : undefined,
          orderBy: [{ company: "asc" }, { updatedAt: "desc" }],
          take: 200,
        }),
      ]);

      return buildNetworkingStrategy({ applications, outreach, contacts });
    },
  });
}

export function buildNetworkingStrategy({
  applications,
  outreach,
  contacts,
}: {
  applications: ApplicationRecord[];
  outreach: OutreachRecord[];
  contacts: Array<Pick<Contact, "id" | "name" | "title" | "company" | "email" | "linkedinUrl">>;
}): NetworkingStrategyOutput {
  const contactCompanies = new Set(contacts.map((contact) => normalizeCompany(contact.company)));
  const outreachByJobId = new Map(outreach.filter((item) => item.jobPostingId).map((item) => [item.jobPostingId, item]));
  const approvedApplications = applications.filter((application) => activeApplicationStatuses.has(application.status));
  const contactGaps = buildContactGaps(approvedApplications, contactCompanies);
  const followUpsDue = buildFollowUpsDue(outreach);
  const actionItems = [
    ...followUpsDue.map((followUp) => ({
      type: "follow_up" as const,
      priority: 1 as const,
      company: followUp.company,
      outreachId: followUp.outreachId,
      summary: followUp.summary,
      rationale: "Follow-up date is due or past. Sending remains manual.",
    })),
    ...approvedApplications
      .filter((application) => !outreachByJobId.has(application.jobPostingId))
      .sort((left, right) => opportunity(right) - opportunity(left))
      .slice(0, 5)
      .map((application) => ({
        type: application.sourceContactId || contactCompanies.has(normalizeCompany(application.jobPosting.company)) ? "draft_outreach" as const : "find_contact" as const,
        priority: opportunity(application) >= 75 ? 1 as const : 2 as const,
        company: application.jobPosting.company,
        role: application.jobPosting.title,
        jobId: application.jobPosting.id,
        contactId: application.sourceContactId ?? undefined,
        summary: application.sourceContactId
          ? `Draft a focused outreach note for ${application.jobPosting.title}.`
          : `Find a recruiter or hiring manager before drafting outreach for ${application.jobPosting.title}.`,
        rationale: `${application.jobPosting.company} has an approved application with ${opportunity(application)} opportunity score and no saved outreach draft yet.`,
      })),
    ...outreach
      .filter((item) => needsRevision(item))
      .slice(0, 4)
      .map((item) => ({
        type: "revise_message" as const,
        priority: 2 as const,
        company: item.jobPosting?.company ?? item.contact?.company ?? "Unknown company",
        role: item.jobPosting?.title,
        jobId: item.jobPostingId ?? undefined,
        contactId: item.contactId ?? undefined,
        outreachId: item.id,
        summary: "Revise recruiter draft before using it.",
        rationale: "Quality review has warnings or the draft is too long/generic.",
      })),
  ]
    .sort((left, right) => left.priority - right.priority)
    .slice(0, 10);
  const messagingWarnings = buildMessagingWarnings(outreach, contacts, approvedApplications);

  return {
    actionItems,
    contactGaps,
    followUpsDue,
    messagingWarnings,
    confidence: applications.length + outreach.length >= 15 ? 0.76 : applications.length + outreach.length >= 5 ? 0.62 : 0.46,
    reasoningSummary: "Reviewed approved applications, saved contacts, recruiter drafts, follow-up dates, and latest job opportunity scores. No messages are sent and no contacts are modified automatically.",
  };
}

function buildContactGaps(applications: ApplicationRecord[], contactCompanies: Set<string>): NetworkingStrategyOutput["contactGaps"] {
  const byCompany = new Map<string, ApplicationRecord[]>();
  for (const application of applications) {
    const key = normalizeCompany(application.jobPosting.company);
    if (contactCompanies.has(key) || application.sourceContactId) continue;
    byCompany.set(key, [...(byCompany.get(key) ?? []), application]);
  }

  return Array.from(byCompany.values())
    .map((items) => {
      const company = items[0]?.jobPosting.company ?? "Unknown company";
      return {
        company,
        openApplications: items.length,
        highestOpportunityScore: Math.max(...items.map(opportunity)),
        suggestedSearch: `${company} recruiter talent acquisition frontend engineering LinkedIn`,
      };
    })
    .sort((left, right) => right.highestOpportunityScore - left.highestOpportunityScore || right.openApplications - left.openApplications)
    .slice(0, 8);
}

function buildFollowUpsDue(outreach: OutreachRecord[]): NetworkingStrategyOutput["followUpsDue"] {
  const now = Date.now();
  return outreach
    .filter((item) => item.status === "SENT" && item.followUpAt && item.followUpAt.getTime() <= now)
    .map((item) => ({
      outreachId: item.id,
      company: item.jobPosting?.company ?? item.contact?.company ?? "Unknown company",
      contactName: item.contact?.name ?? null,
      followUpAt: item.followUpAt?.toISOString() ?? new Date().toISOString(),
      summary: `Follow up with ${item.contact?.name ?? item.jobPosting?.company ?? "contact"} about ${item.jobPosting?.title ?? "the role"}.`,
    }))
    .slice(0, 8);
}

function buildMessagingWarnings(outreach: OutreachRecord[], contacts: Array<Pick<Contact, "email" | "linkedinUrl">>, applications: ApplicationRecord[]) {
  const warnings: string[] = [];
  if (!contacts.length && applications.length) warnings.push("No contacts are saved for active applications.");
  if (applications.filter((application) => !application.sourceContactId).length >= 5) warnings.push("Several active applications do not have a source contact attached.");
  if (outreach.filter(needsRevision).length) warnings.push("Some recruiter drafts need review before use.");
  if (!outreach.length && applications.length) warnings.push("No outreach drafts exist yet for active applications.");
  if (contacts.length && contacts.every((contact) => !contact.email && !contact.linkedinUrl)) warnings.push("Saved contacts are missing email and LinkedIn URLs.");
  return warnings;
}

function needsRevision(outreach: OutreachRecord) {
  const review = objectValue(outreach.qualityReview);
  const status = typeof review.status === "string" ? review.status : "";
  return status === "NEEDS_REVIEW" || outreach.message.length > 1400 || /\bexcited to apply\b/i.test(outreach.message);
}

function opportunity(application: ApplicationRecord) {
  return application.jobPosting.evaluations[0]?.opportunityScore ?? application.jobPosting.evaluations[0]?.fitScore ?? 0;
}

function normalizeCompany(company: string) {
  return company.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const activeApplicationStatuses = new Set([
  "approved",
  "resume_generated",
  "cover_letter_generated",
  "ready_to_apply",
  "applied",
  "follow_up_due",
  "screening",
  "interviewing",
]);
