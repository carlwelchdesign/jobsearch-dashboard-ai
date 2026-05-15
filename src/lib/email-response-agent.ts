import type { EmailMessageClassification, EmailProvider, Prisma } from "@prisma/client";
import { createAgentUserRequest } from "@/lib/agent-user-requests";
import { runInterviewPrepAgent } from "@/lib/agents/interview-prep";
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
  recommendedOutcome?: "REJECTED" | "RECRUITER_SCREEN" | "TECH_SCREEN" | "OFFER" | null;
  userQuestion?: string | null;
  rationale: string;
};

export function classifyJobEmail(input: Pick<EmailMessageIngestInput, "subject" | "snippet" | "bodyText">): EmailClassificationResult {
  const text = [input.subject, input.snippet, input.bodyText].filter(Boolean).join("\n").toLowerCase();

  if (/\b(unfortunately|not moving forward|will not be moving forward|decided to pursue other candidates|not selected)\b/.test(text)) {
    return {
      classification: "REJECTION",
      confidenceScore: 88,
      actionRequired: false,
      recommendedOutcome: "REJECTED",
      rationale: "Detected common rejection language.",
    };
  }
  if (/\b(offer|offer letter|compensation package)\b/.test(text)) {
    return {
      classification: "OFFER",
      confidenceScore: 82,
      actionRequired: true,
      recommendedOutcome: "OFFER",
      userQuestion: "This looks like an offer-related email. Review it before any response is drafted.",
      rationale: "Detected offer language.",
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
  if (/\b(received your application|application confirmation|thank you for applying|we have received)\b/.test(text)) {
    return {
      classification: "AUTOMATED_CONFIRMATION",
      confidenceScore: 78,
      actionRequired: false,
      rationale: "Detected application confirmation language.",
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

export async function ingestJobEmail(input: EmailMessageIngestInput) {
  const classification = classifyJobEmail(input);
  const match = await matchEmailToApplication(input.userId, input);
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

  if (match.applicationId && classification.recommendedOutcome) {
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

  const existing = await prisma.agentRun.findFirst({
    where: {
      agentType: "INTERVIEW_PREP",
      inputJson: {
        path: ["applicationId"],
        equals: input.applicationId,
      },
      status: "COMPLETED",
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const result = await runInterviewPrepAgent({
    applicationId: input.applicationId,
    userId: input.userId,
  });
  return result.run;
}

async function matchEmailToApplication(userId: string, input: Pick<EmailMessageIngestInput, "from" | "subject" | "bodyText" | "snippet">) {
  const threadMatch = await matchEmailThread(userId, input);
  if (threadMatch.applicationId || threadMatch.jobPostingId) return threadMatch;

  const applications = await prisma.application.findMany({
    where: { userId },
    include: { jobPosting: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const text = [input.from, input.subject, input.snippet, input.bodyText].filter(Boolean).join(" ").toLowerCase();
  const normalizedText = normalizeMatchText(text);
  const match = applications.find((application) => {
    const company = application.jobPosting.company.toLowerCase();
    const domain = company.replace(/[^a-z0-9]/g, "");
    const applicationUrl = application.jobPosting.applicationUrl?.toLowerCase() ?? "";
    const applicationHost = safeUrlHost(applicationUrl);
    return text.includes(company) ||
      (domain.length > 3 && normalizedText.includes(domain)) ||
      (applicationUrl.length > 10 && text.includes(applicationUrl)) ||
      (applicationHost.length > 5 && normalizedText.includes(normalizeMatchText(applicationHost)));
  });

  return {
    applicationId: match?.id ?? null,
    jobPostingId: match?.jobPostingId ?? null,
  };
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
