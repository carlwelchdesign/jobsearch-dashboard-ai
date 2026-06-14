import type { EmailMessageClassification, EmailProvider, Prisma } from "@prisma/client";
import { createAgentUserRequest } from "@/lib/agent-user-requests";
import { ensureInterviewPrepForApplication } from "@/lib/applications/interview-prep-workflow";
import { recordApplicationOutcome } from "@/lib/applications/outcomes";
import { prisma } from "@/lib/prisma";

export type EmailMessageIngestInput = {
  userId: string;
  provider: EmailProvider;
  providerMessageId: string;
  threadId?: string | null;
  from: string;
  to?: string[];
  subject: string;
  receivedAt?: Date;
  snippet?: string;
  bodyText?: string | null;
  rawMetadataJson?: Prisma.InputJsonValue;
};

export type EmailClassificationResult = {
  classification: EmailMessageClassification;
  confidenceScore: number;
  actionRequired: boolean;
  recommendedOutcome?: "APPLIED" | "REJECTED" | "RECRUITER_SCREEN" | "TECH_SCREEN" | "OFFER" | null;
  userQuestion?: string | null;
  rationale: string;
};

export function classifyJobEmail(input: Pick<EmailMessageIngestInput, "subject" | "snippet" | "bodyText">): EmailClassificationResult {
  const text = [input.subject, input.snippet, input.bodyText].filter(Boolean).join("\n").toLowerCase();

  if (isRejectionEmail(text)) {
    return {
      classification: "REJECTION",
      confidenceScore: 94,
      actionRequired: false,
      recommendedOutcome: "REJECTED",
      rationale: "Detected explicit rejection language.",
    };
  }
  if (isOfferEmail(text)) {
    return {
      classification: "OFFER",
      confidenceScore: 88,
      actionRequired: true,
      recommendedOutcome: "OFFER",
      userQuestion: "This looks like an offer-related email. Review it before any response is drafted.",
      rationale: "Detected explicit offer language.",
    };
  }
  if (/\b(coding assessment|technical assessment|hackerrank|codesignal|coderpad|take[- ]?home|assignment)\b/.test(text)) {
    return {
      classification: /\btake[- ]?home|assignment\b/.test(text) ? "TAKE_HOME" : "CODING_ASSESSMENT",
      confidenceScore: 80,
      actionRequired: true,
      recommendedOutcome: "TECH_SCREEN",
      userQuestion: "An assessment appears to be required. Review timing and instructions before the agent prepares a study plan.",
      rationale: "Detected assessment or take-home language.",
    };
  }
  if (/\b(interview|speak with|chat with|meet with|schedule a call|calendly|availability|available times)\b/.test(text)) {
    return {
      classification: /\bcalendly|availability|available times|schedule\b/.test(text) ? "SCHEDULING_REQUEST" : "INTERVIEW_REQUEST",
      confidenceScore: 84,
      actionRequired: true,
      recommendedOutcome: "RECRUITER_SCREEN",
      userQuestion: "This looks like an interview or scheduling request. Confirm availability and prep next steps.",
      rationale: "Detected interview or scheduling language.",
    };
  }
  if (/\b(recruiter|talent acquisition|hiring team|next steps?|follow up|following up|touch base)\b/.test(text)) {
    return {
      classification: "RECRUITER_RESPONSE",
      confidenceScore: 72,
      actionRequired: true,
      recommendedOutcome: "RECRUITER_SCREEN",
      userQuestion: "This looks like a recruiter follow-up. Review the next step before the app updates stage or drafts a response.",
      rationale: "Detected recruiter follow-up language.",
    };
  }
  if (isApplicationConfirmationEmail(text)) {
    return {
      classification: "AUTOMATED_CONFIRMATION",
      confidenceScore: 86,
      actionRequired: false,
      recommendedOutcome: "APPLIED",
      rationale: "Detected application received confirmation language.",
    };
  }

  return {
    classification: "NEEDS_REVIEW",
    confidenceScore: 45,
    actionRequired: true,
    userQuestion: "This job-related email could not be classified confidently. Review it before the app updates records.",
    rationale: "No high-confidence response pattern matched.",
  };
}

function isRejectionEmail(text: string) {
  return [
    /\b(unfortunately|regret to inform)\b/,
    /\b(not moving forward|not be moving forward|will not move forward|decided not to move forward|decided not to proceed)\b/,
    /\b(unable to proceed|unable to move forward|won't be proceeding|will not be proceeding)\b/,
    /\b(decided to pursue other candidates|moving forward with other candidates|selected other candidates|candidate whose qualifications more closely)\b/,
    /\b(not selected|not a match|not the right fit|better fit for this role|no longer under consideration)\b/,
    /\b(we encourage you to.*future roles|keep an eye on future roles)\b/,
  ].some((pattern) => pattern.test(text));
}

function isOfferEmail(text: string) {
  return [
    /\b(pleased|happy|excited|delighted)\s+to\s+(extend|make|present)\s+(you\s+)?(an?\s+)?offer\b/,
    /\bwe\s+(would like|want)\s+to\s+offer\s+you\b/,
    /\boffer letter\b/,
    /\bemployment offer\b/,
    /\bjob offer\b/,
    /\bcompensation package\b/,
  ].some((pattern) => pattern.test(text));
}

function isApplicationConfirmationEmail(text: string) {
  return [
    /\b(received your application|we have received your application|application has been received)\b/,
    /\b(application confirmation|confirmation of your application)\b/,
    /\b(thank you|thanks)\s+for\s+(applying|your application)\b/,
    /\b(application was submitted|application submitted|submission confirmation)\b/,
  ].some((pattern) => pattern.test(text));
}

export async function ingestJobEmail(input: EmailMessageIngestInput) {
  const classification = classifyJobEmail(input);
  const match = await matchEmailToApplication(input.userId, input);
  const existingEmail = await prisma.emailMessageRecord.findUnique({
    where: {
      userId_provider_providerMessageId: {
        userId: input.userId,
        provider: input.provider,
        providerMessageId: input.providerMessageId,
      },
    },
    select: { id: true },
  });
  const email = await prisma.emailMessageRecord.upsert({
    where: {
      userId_provider_providerMessageId: {
        userId: input.userId,
        provider: input.provider,
        providerMessageId: input.providerMessageId,
      },
    },
    update: {
      threadId: input.threadId ?? null,
      from: input.from,
      to: input.to ?? [],
      subject: input.subject,
      receivedAt: input.receivedAt ?? new Date(),
      snippet: input.snippet ?? input.bodyText?.slice(0, 240) ?? "",
      bodyText: input.bodyText ?? null,
      classification: classification.classification,
      confidenceScore: classification.confidenceScore,
      matchedApplicationId: match.applicationId,
      matchedJobPostingId: match.jobPostingId,
      actionRequired: classification.actionRequired,
      rawMetadataJson: input.rawMetadataJson ?? {},
    },
    create: {
      userId: input.userId,
      provider: input.provider,
      providerMessageId: input.providerMessageId,
      threadId: input.threadId ?? null,
      from: input.from,
      to: input.to ?? [],
      subject: input.subject,
      receivedAt: input.receivedAt ?? new Date(),
      snippet: input.snippet ?? input.bodyText?.slice(0, 240) ?? "",
      bodyText: input.bodyText ?? null,
      classification: classification.classification,
      confidenceScore: classification.confidenceScore,
      matchedApplicationId: match.applicationId,
      matchedJobPostingId: match.jobPostingId,
      actionRequired: classification.actionRequired,
      rawMetadataJson: input.rawMetadataJson ?? {},
    },
  });

  if (match.applicationId && !existingEmail) {
    await prisma.applicationEvent.create({
      data: {
        applicationId: match.applicationId,
        type: "note_added",
        payload: buildEmailApplicationEventPayload({
          emailMessageId: email.id,
          from: input.from,
          subject: input.subject,
          receivedAt: input.receivedAt ?? new Date(),
          classification,
        }),
      },
    });
  }

  if (match.applicationId && shouldAutoRecordOutcomeFromEmail(classification.classification) && classification.recommendedOutcome) {
    await recordOutcomeFromEmail({
      applicationId: match.applicationId,
      outcome: classification.recommendedOutcome,
      classification: classification.classification,
      subject: input.subject,
      occurredAt: input.receivedAt ?? new Date(),
    });
  }

  if (classification.actionRequired && classification.userQuestion) {
    await createAgentUserRequest({
      userId: input.userId,
      applicationId: match.applicationId,
      jobPostingId: match.jobPostingId,
      type: classification.classification === "NEEDS_REVIEW" ? "EMAIL_REVIEW" : "INTERVIEW_PREP",
      question: classification.userQuestion,
      contextJson: {
        emailMessageId: email.id,
        subject: input.subject,
        classification: classification.classification,
        confidenceScore: classification.confidenceScore,
      },
    });
  }

  const interviewPrepRun = match.applicationId
    ? await maybeRunInterviewPrep({
        userId: input.userId,
        applicationId: match.applicationId,
        classification: classification.classification,
      })
    : null;

  return {
    email,
    classification,
    match,
    interviewPrepRun,
  };
}

function shouldAutoRecordOutcomeFromEmail(classification: EmailMessageClassification) {
  return classification === "REJECTION" || classification === "AUTOMATED_CONFIRMATION";
}

export function buildEmailApplicationEventPayload(input: {
  emailMessageId: string;
  from: string;
  subject: string;
  receivedAt: Date;
  classification: EmailClassificationResult;
}): Prisma.InputJsonValue {
  return {
    source: "email_response_agent",
    emailMessageId: input.emailMessageId,
    from: input.from,
    subject: input.subject,
    receivedAt: input.receivedAt.toISOString(),
    classification: input.classification.classification,
    confidenceScore: input.classification.confidenceScore,
    actionRequired: input.classification.actionRequired,
    recommendedOutcome: input.classification.recommendedOutcome ?? null,
    rationale: input.classification.rationale,
  };
}

async function recordOutcomeFromEmail(input: {
  applicationId: string;
  outcome: NonNullable<EmailClassificationResult["recommendedOutcome"]>;
  classification: EmailMessageClassification;
  subject: string;
  occurredAt: Date;
}) {
  const existing = await prisma.applicationOutcome.findFirst({
    where: {
      applicationId: input.applicationId,
      outcome: input.outcome,
    },
    orderBy: { occurredAt: "desc" },
  });
  if (existing) return null;

  return recordApplicationOutcome({
    applicationId: input.applicationId,
    outcome: input.outcome,
    notes: `Email classified as ${input.classification}: ${input.subject}`,
    occurredAt: input.occurredAt,
    source: "email_outcome",
  });
}

async function maybeRunInterviewPrep(input: {
  userId: string;
  applicationId: string;
  classification: EmailMessageClassification;
}) {
  if (!["INTERVIEW_REQUEST", "SCHEDULING_REQUEST", "CODING_ASSESSMENT", "TAKE_HOME"].includes(input.classification)) {
    return null;
  }

  const result = await ensureInterviewPrepForApplication({
    applicationId: input.applicationId,
    userId: input.userId,
    source: "email",
  });
  return result.run;
}

async function matchEmailToApplication(userId: string, input: Pick<EmailMessageIngestInput, "from" | "subject" | "bodyText" | "snippet">) {
  const threadMatch = await matchEmailThread(userId, input);
  if (threadMatch.applicationId) return threadMatch;

  const applications = await prisma.application.findMany({
    where: { userId },
    include: { jobPosting: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const match = applications
    .map((application) => ({
      application,
      score: scoreEmailApplicationMatch(application.jobPosting, input),
    }))
    .filter((candidate) => candidate.score >= 2)
    .sort((left, right) => right.score - left.score)[0]?.application;

  return {
    applicationId: match?.id ?? null,
    jobPostingId: match?.jobPostingId ?? threadMatch.jobPostingId ?? null,
  };
}

export function scoreEmailApplicationMatch(
  jobPosting: { company: string; title: string; applicationUrl?: string | null },
  input: Pick<EmailMessageIngestInput, "from" | "subject" | "bodyText" | "snippet">,
) {
  const from = input.from.toLowerCase();
  const subjectSnippet = [input.subject, input.snippet].filter(Boolean).join(" ").toLowerCase();
  const body = (input.bodyText ?? "").toLowerCase();
  const company = jobPosting.company.toLowerCase();
  const normalizedCompany = normalizeMatchText(company);
  const applicationHost = safeUrlHost(jobPosting.applicationUrl?.toLowerCase() ?? "");
  const normalizedHost = normalizeMatchText(applicationHost);
  const titleTerms = meaningfulTitleTerms(jobPosting.title);
  const responseContext = /\b(application|applied|applying|candidate|role|position|job|interview|recruit|talent|hiring)\b/.test(body);

  let score = 0;
  if (normalizedCompany.length > 3 && normalizeMatchText(from).includes(normalizedCompany)) score += 3;
  if (normalizedHost.length > 5 && normalizeMatchText(from).includes(normalizedHost)) score += 3;
  if (normalizedCompany.length > 3 && normalizeMatchText(subjectSnippet).includes(normalizedCompany)) score += 2;
  if (applicationHost && normalizeMatchText(subjectSnippet).includes(normalizedHost)) score += 2;
  if (normalizedCompany.length > 3 && normalizeMatchText(body).includes(normalizedCompany) && responseContext) score += 1;
  if (titleTerms.some((term) => normalizeMatchText(subjectSnippet).includes(term))) score += 1;
  if (titleTerms.some((term) => normalizeMatchText(body).includes(term)) && responseContext) score += 1;

  return score;
}

async function matchEmailThread(userId: string, input: Pick<EmailMessageIngestInput, "threadId" | "from" | "subject" | "bodyText" | "snippet">) {
  if (!input.threadId) return { applicationId: null, jobPostingId: null };

  const existing = await prisma.emailMessageRecord.findFirst({
    where: {
      userId,
      threadId: input.threadId,
      OR: [
        { matchedApplicationId: { not: null } },
        { matchedJobPostingId: { not: null } },
      ],
    },
    orderBy: { receivedAt: "desc" },
  });

  return {
    applicationId: existing?.matchedApplicationId ?? null,
    jobPostingId: existing?.matchedJobPostingId ?? null,
  };
}

function normalizeMatchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function safeUrlHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

function meaningfulTitleTerms(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9+#\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 3 && !titleStopWords.has(term))
    .map(normalizeMatchText);
}

const titleStopWords = new Set([
  "senior",
  "staff",
  "product",
  "software",
  "engineer",
  "developer",
  "frontend",
  "backend",
  "fullstack",
  "remote",
]);
