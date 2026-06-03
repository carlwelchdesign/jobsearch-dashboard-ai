import type { CandidateEvidence, JobPosting, Prisma, ThankYouDraft, UserProfile } from "@prisma/client";
import { retrieveCandidateEvidence } from "@/lib/evidence/retrieval";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { thankYouStageLabel, type ThankYouStage } from "@/lib/applications/thank-you-draft-constants";
export { thankYouStageLabel, thankYouStages, type ThankYouStage } from "@/lib/applications/thank-you-draft-constants";

export type ThankYouDraftInput = {
  applicationId: string;
  stage: ThankYouStage;
  interviewerName: string;
  interviewerTitle?: string | null;
  interviewerLinkedin?: string | null;
  interviewDate?: Date | null;
  notes?: string | null;
  tone?: string | null;
};

export type ThankYouDraftOutput = {
  draft: ThankYouDraft;
  message: string;
};

type BuildThankYouDraftInput = {
  job: Pick<JobPosting, "company" | "title" | "description">;
  profile: Pick<UserProfile, "fullName" | "linkedinUrl" | "githubUrl" | "portfolioUrl"> | null;
  stage: ThankYouStage;
  interviewerName: string;
  interviewerTitle?: string | null;
  interviewDate?: Date | null;
  notes?: string | null;
  tone?: string | null;
  evidence: CandidateEvidence[];
};

export async function createThankYouDraft(input: ThankYouDraftInput): Promise<ThankYouDraftOutput> {
  const application = await prisma.application.findUnique({
    where: { id: input.applicationId },
    include: {
      jobPosting: true,
      user: { include: { profile: true } },
    },
  });
  if (!application) throw new Error("Application not found for thank-you draft.");

  const evidence = application.user.profile
    ? await retrieveCandidateEvidence({
        candidateProfileId: application.user.profile.id,
        query: `${application.jobPosting.title} ${application.jobPosting.company} ${application.jobPosting.description} ${input.notes ?? ""}`,
        confidenceMinimum: "INFERRED",
        usableFor: "recruiterMessage",
        limit: 3,
      })
    : [];

  const generated = buildThankYouDraft({
    job: application.jobPosting,
    profile: application.user.profile,
    stage: input.stage,
    interviewerName: input.interviewerName,
    interviewerTitle: input.interviewerTitle,
    interviewDate: input.interviewDate,
    notes: input.notes,
    tone: input.tone,
    evidence,
  });
  const qualityReview = reviewThankYouDraft(generated.emailBody, generated.linkedinBody, generated.evidenceRefs);
  const draft = await prisma.thankYouDraft.create({
    data: {
      userId: application.userId,
      applicationId: application.id,
      jobPostingId: application.jobPostingId,
      stage: input.stage,
      interviewerName: input.interviewerName.trim(),
      interviewerTitle: cleanOptional(input.interviewerTitle),
      interviewerCompany: application.jobPosting.company,
      interviewerLinkedin: cleanOptional(input.interviewerLinkedin),
      interviewDate: input.interviewDate ?? null,
      tone: cleanOptional(input.tone) ?? "professional",
      notes: cleanOptional(input.notes),
      emailSubject: generated.emailSubject,
      emailBody: generated.emailBody,
      linkedinBody: generated.linkedinBody,
      evidenceRefs: generated.evidenceRefs as Prisma.InputJsonValue,
      qualityReview: qualityReview as Prisma.InputJsonValue,
    },
  });

  return {
    draft,
    message: "Thank-you drafts created. Review and send manually.",
  };
}

export function buildThankYouDraft(input: BuildThankYouDraftInput) {
  const first = firstName(input.interviewerName);
  const candidateName = input.profile?.fullName ?? "Carl Welch";
  const stageLabel = thankYouStageLabel(input.stage);
  const notes = noteSentences(input.notes);
  const evidence = selectThankYouEvidence(input.evidence);
  const evidenceLine = evidence.length
    ? `I also appreciated the chance to connect the conversation back to my work on ${evidence[0].title}: ${shorten(evidence[0].content, 165)}`
    : "I also appreciated the chance to connect the conversation back to relevant product engineering work I can discuss in more detail.";
  const toneLine = input.tone === "warm"
    ? "The conversation made the opportunity feel even more concrete."
    : "The conversation helped clarify the opportunity and the team context.";

  const emailBody = [
    `Hi ${first},`,
    "",
    `Thank you for taking the time to speak with me${input.interviewDate ? ` on ${formatDate(input.interviewDate)}` : ""} about the ${input.job.title} role at ${input.job.company}. ${toneLine}`,
    notes.length ? notes.join(" ") : stageFollowUpLine(input.stage, input.job.company),
    evidenceLine,
    `I remain interested in the ${input.job.title} role and would be glad to share anything else that would help with next steps.`,
    "",
    "Best,",
    candidateName,
  ].join("\n");

  const linkedinBody = [
    `Hi ${first}, thank you for speaking with me about the ${input.job.title} role at ${input.job.company}.`,
    notes[0] ?? stageFollowUpLine(input.stage, input.job.company),
    "I remain interested and would be glad to continue the conversation.",
  ].join(" ");

  return {
    emailSubject: `Thank you - ${input.job.company} ${stageLabel}`,
    emailBody,
    linkedinBody,
    evidenceRefs: evidence.map((item) => item.id),
  };
}

export function reviewThankYouDraft(emailBody: string, linkedinBody: string, evidenceRefs: string[]) {
  const warnings: string[] = [];
  const styleViolations: string[] = [];
  if (!evidenceRefs.length) warnings.push("No evidence references are attached to this thank-you draft.");
  if (emailBody.length > 1400) warnings.push("Email draft is longer than a concise thank-you note.");
  if (linkedinBody.length > 650) warnings.push("LinkedIn draft is longer than a short follow-up message.");
  if (/—/.test(`${emailBody}\n${linkedinBody}`)) styleViolations.push("Uses an em dash.");
  if (/\btransformative|game-changing|world-class|cutting-edge\b/i.test(`${emailBody}\n${linkedinBody}`)) styleViolations.push("Uses hype language.");

  return {
    status: warnings.length || styleViolations.length ? "NEEDS_REVIEW" as const : "PASS" as const,
    warnings,
    styleViolations,
  };
}

export function thankYouQualityReview(value: unknown): { status?: string; warnings?: string[]; styleViolations?: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as { status?: unknown; warnings?: unknown; styleViolations?: unknown };
  return {
    status: typeof record.status === "string" ? record.status : undefined,
    warnings: jsonArray(record.warnings),
    styleViolations: jsonArray(record.styleViolations),
  };
}

function selectThankYouEvidence(evidence: CandidateEvidence[]) {
  return evidence
    .filter((item) => item.confidence === "VERIFIED" || item.confidence === "INFERRED")
    .slice(0, 2);
}

function stageFollowUpLine(stage: ThankYouStage, company: string) {
  if (stage === "recruiter_screen") return `I enjoyed learning more about how ${company} is thinking about the role and the hiring process.`;
  if (stage === "technical") return "I enjoyed discussing the technical problems behind the role and how I approach product engineering tradeoffs.";
  if (stage === "hiring_manager") return "I enjoyed learning more about the team priorities and where this role can have the most leverage.";
  if (stage === "panel_onsite") return "I appreciated meeting more of the team and learning how the role contributes across the product.";
  if (stage === "final") return "I appreciated the deeper discussion about expectations, team fit, and next steps.";
  if (stage === "informational") return `I appreciated learning more about ${company} and the team context.`;
  return "I appreciated the conversation and the additional context about the opportunity.";
}

function noteSentences(notes?: string | null) {
  return (notes ?? "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item.endsWith(".") ? item : `${item}.`);
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(date);
}

function shorten(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function cleanOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}
