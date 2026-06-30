import type { CandidateEvidence, Contact, JobPosting, UserProfile } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import { isLinkedInRecommendationEvidence, linkedinRecommendationSignalLine } from "@/lib/evidence/linkedin-recommendation-guidance";
import { retrieveCandidateEvidence } from "@/lib/evidence/retrieval";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";

export type RecruiterIntelligenceInput = {
  applicationId?: string;
  jobPostingId?: string;
  contactId?: string;
  userId?: string;
};

export type RecruiterIntelligenceOutput = {
  outreachId: string;
  jobId: string;
  contactId?: string;
  company: string;
  role: string;
  message: string;
  evidenceRefs: string[];
  qualityReview: {
    status: "PASS" | "NEEDS_REVIEW";
    warnings: string[];
    styleViolations: string[];
  };
  confidence: number;
  reasoningSummary: string;
};

type OutreachDraftInput = {
  job: Pick<JobPosting, "id" | "company" | "title" | "description">;
  profile: Pick<UserProfile, "fullName" | "linkedinUrl" | "githubUrl" | "portfolioUrl"> | null;
  contact: Pick<Contact, "id" | "name" | "title" | "company"> | null;
  evidence: CandidateEvidence[];
};

export async function runRecruiterIntelligenceAgent(input: RecruiterIntelligenceInput) {
  return runAgent<RecruiterIntelligenceInput, RecruiterIntelligenceOutput>({
    agentType: "RECRUITER_INTELLIGENCE",
    input,
    userId: input.userId,
    execute: async () => {
      const context = await loadOutreachContext(input);
      const draft = buildRecruiterOutreachDraft(context);
      const qualityReview = reviewRecruiterMessage(draft.message, draft.evidenceRefs);
      const outreach = await prisma.recruiterOutreach.create({
        data: {
          userId: context.userId,
          contactId: context.contact?.id,
          jobPostingId: context.job.id,
          message: draft.message,
          status: "DRAFT",
          evidenceRefs: draft.evidenceRefs,
          qualityReview,
        },
      });

      return {
        outreachId: outreach.id,
        jobId: context.job.id,
        contactId: context.contact?.id,
        company: context.job.company,
        role: context.job.title,
        message: draft.message,
        evidenceRefs: draft.evidenceRefs,
        qualityReview,
        confidence: qualityReview.status === "PASS" && draft.evidenceRefs.length >= 2 ? 0.82 : 0.64,
        reasoningSummary: "Created a concise recruiter outreach draft from the target role, candidate profile links, and approved candidate evidence. No message was sent.",
      };
    },
  });
}

export function buildRecruiterOutreachDraft(input: OutreachDraftInput) {
  const evidence = selectOutreachEvidence(input.evidence);
  const projectLine = evidenceLine(evidence[0]);
  const supportLine = evidenceLine(evidence[1]);
  const name = input.profile?.fullName ?? "Carl Welch";
  const recipient = input.contact?.name ? `Hi ${firstName(input.contact.name)},` : "Hi there,";
  const links = [
    input.profile?.portfolioUrl ? `Portfolio: ${input.profile.portfolioUrl}` : null,
    input.profile?.githubUrl ? `GitHub: ${input.profile.githubUrl}` : null,
    input.profile?.linkedinUrl ? `LinkedIn: ${input.profile.linkedinUrl}` : null,
  ].filter(Boolean);
  const message = [
    recipient,
    "",
    `I am reaching out about the ${input.job.title} role at ${input.job.company}. My background is strongest where React, TypeScript, product engineering, and complex user workflows meet.`,
    projectLine ? `A relevant example: ${projectLine}` : "A relevant example: I can share specific project context if this role is still open.",
    supportLine ? `Another useful signal: ${supportLine}` : null,
    `If this role is still active, I would appreciate being pointed to the right recruiter or hiring manager. I am also happy to send a concise resume tailored to this team.`,
    "",
    `Best,`,
    name,
    links.length ? links.join("\n") : null,
  ].filter((line) => line !== null).join("\n");

  return {
    message,
    evidenceRefs: evidence.map((item) => item.id),
  };
}

export function reviewRecruiterMessage(message: string, evidenceRefs: string[]) {
  const warnings: string[] = [];
  const styleViolations: string[] = [];
  if (!evidenceRefs.length) warnings.push("No evidence references are attached to this outreach draft.");
  if (message.length > 1400) warnings.push("Message is longer than a concise recruiter note.");
  if (/—/.test(message)) styleViolations.push("Uses an em dash.");
  if (/\bexcited to apply\b/i.test(message)) styleViolations.push("Uses a generic application opening.");
  if (/\btransformative|game-changing|world-class|cutting-edge\b/i.test(message)) styleViolations.push("Uses hype language.");

  return {
    status: warnings.length || styleViolations.length ? "NEEDS_REVIEW" as const : "PASS" as const,
    warnings,
    styleViolations,
  };
}

async function loadOutreachContext(input: RecruiterIntelligenceInput) {
  const application = input.applicationId
    ? await prisma.application.findUnique({
        where: { id: input.applicationId },
        include: {
          jobPosting: true,
          sourceContact: true,
          user: { include: { profile: true } },
        },
      })
    : null;
  const job = application?.jobPosting ?? (input.jobPostingId ? await prisma.jobPosting.findUnique({ where: { id: input.jobPostingId } }) : null);
  if (!job) throw new Error("Job not found for recruiter outreach.");

  const user = application?.user ?? await prisma.user.findFirst({ include: { profile: true }, orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("User not found for recruiter outreach.");

  const contact = application?.sourceContact
    ?? (input.contactId ? await prisma.contact.findUnique({ where: { id: input.contactId } }) : null)
    ?? await prisma.contact.findFirst({
      where: {
        userId: user.id,
        company: { equals: job.company, mode: "insensitive" },
      },
      orderBy: { updatedAt: "desc" },
    });

  const evidence = user.profile
    ? await retrieveCandidateEvidence({
        candidateProfileId: user.profile.id,
        query: `${job.title} ${job.company} ${job.description}`,
        confidenceMinimum: "INFERRED",
        usableFor: "recruiterMessage",
        limit: 6,
      })
    : [];

  return {
    userId: user.id,
    profile: user.profile,
    job,
    contact,
    evidence,
  };
}

function selectOutreachEvidence(evidence: CandidateEvidence[]) {
  return evidence
    .filter((item) => item.confidence === "VERIFIED" || item.confidence === "INFERRED")
    .slice(0, 3);
}

function evidenceLine(evidence?: CandidateEvidence) {
  if (!evidence) return "";
  if (isLinkedInRecommendationEvidence(evidence)) {
    return linkedinRecommendationSignalLine(evidence);
  }
  const tags = jsonArray(evidence.tags).slice(0, 3);
  const content = evidence.content.length > 145 ? `${evidence.content.slice(0, 142)}...` : evidence.content;
  return `${evidence.title}: ${content}${tags.length ? ` (${tags.join(", ")})` : ""}`;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}
