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

export function classifyJobEmail(input: Pick<EmailMessageIngestInput, "subject" | "snippet" | "bodyText"> & { from?: string | null }): EmailClassificationResult {
  const text = [input.subject, input.snippet, input.bodyText].filter(Boolean).join("\n").toLowerCase();
  const sender = (input.from ?? "").toLowerCase();
  const gate = classifyNonJobEmail({ text, sender });
  if (gate) return gate;

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
    classification: "NO_ACTION",
    confidenceScore: 62,
    actionRequired: false,
    rationale: "Message passed basic job-mail sender checks but no actionable response pattern matched.",
  };
}

function classifyNonJobEmail(input: { text: string; sender: string }): EmailClassificationResult | null {
  if (isVerificationOrSecurityEmail(input.text)) {
    return unrelated("Detected account verification or security-code language.");
  }
  if (isGenericJobAlertEmail(input.text, input.sender)) {
    return {
      classification: "NO_ACTION",
      confidenceScore: 90,
      actionRequired: false,
      rationale: "Detected a generic job-alert or listing digest, not a response to an application.",
    };
  }
  if (isConsumerMarketingEmail(input.text, input.sender)) {
    return unrelated("Detected consumer, newsletter, promotional, political, or volunteer-list language.");
  }
  if (!hasActionableJobSignal(input.text, input.sender)) {
    return unrelated("No actionable job-response sender or content signal was detected.");
  }
  return null;
}

function unrelated(rationale: string): EmailClassificationResult {
  return {
    classification: "UNRELATED",
    confidenceScore: 92,
    actionRequired: false,
    rationale,
  };
}

function isVerificationOrSecurityEmail(text: string) {
  return /\b(verification code|security code|one[- ]time code|2fa|two[- ]factor|sign[- ]in code|login code|password reset)\b/.test(text);
}

function isGenericJobAlertEmail(text: string, sender: string) {
  const jobAlertSender = /\b(jobalerts?|job alerts?|glassdoor jobs|linkedin job alerts|indeed|ziprecruiter|builtin|built in|dice|monster)\b/.test(sender);
  const alertLanguage = /\b(job alert|jobs? for you|recommended jobs?|new jobs?|apply now|and \d+ more jobs?|similar jobs?|hiring now)\b/.test(text);
  const responseLanguage = /\b(received your application|thank you for applying|application submitted|unfortunately|not moving forward|interview invitation|schedule a call|availability|coding assessment|technical assessment)\b/.test(text);
  return (jobAlertSender || alertLanguage) && !responseLanguage;
}

function isConsumerMarketingEmail(text: string, sender: string) {
  const marketingSender = /\b(newsletter|marketing|news@|reply@|offers?|promo|travel|toyota|vans|stewmac|fender|aaa travel|earnest|star alliance|asap tickets|telegraph|wsj|wall street journal|ring team|starlink|habitat|restore|clerk)\b/.test(sender);
  const marketingLanguage = /\b(shop favorites|off is waving goodbye|personal loan offer|travel experiences|volunteer opportunities|what'?s new|billing updates|intelligent notifications|international destinations|stratospheric ipo|from the editor|vintage inspiration|hybrid, electric|plug-in|newsletter|unsubscribe|sale|discount|exclusive offer)\b/.test(text);
  const jobResponseLanguage = /\b(received your application|thank you for applying|application submitted|not moving forward|schedule a call|coding assessment|technical assessment|take-home|offer letter|employment offer)\b/.test(text);
  return (marketingSender || marketingLanguage) && !jobResponseLanguage;
}

function hasActionableJobSignal(text: string, sender: string) {
  return (
    isRejectionEmail(text) ||
    isOfferEmail(text) ||
    isApplicationConfirmationEmail(text) ||
    /\b(coding assessment|technical assessment|hackerrank|codesignal|coderpad|take[- ]?home|assignment)\b/.test(text) ||
    /\b(interview|speak with|chat with|meet with|schedule a call|calendly|availability|available times)\b/.test(text) ||
    /\b(recruiter|talent acquisition|hiring team|next steps?|follow up|following up|touch base)\b/.test(text) ||
    /\b(greenhouse|ashby|lever|workday|icims|smartrecruiters|bamboohr|workable|jobvite|careers@|talent@|recruiting@|no-reply@.*(greenhouse|ashby|lever|workday))\b/.test(sender)
  );
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
    .filter((candidate) => candidate.score >= 4)
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
  const jobAlertContext = /\b(job alert|jobs? for you|recommended jobs?|apply now|and \d+ more jobs?|similar jobs?)\b/.test(subjectSnippet);
  const atsSender = /\b(greenhouse|ashby|lever|workday|icims|smartrecruiters|bamboohr|workable|jobvite)\b/.test(from);

  let score = 0;
  let strongEvidence = 0;
  const normalizedFrom = normalizeMatchText(from);
  const normalizedSubjectSnippet = normalizeMatchText(subjectSnippet);
  const normalizedBody = normalizeMatchText(body);

  if (normalizedCompany.length > 3 && normalizedFrom.includes(normalizedCompany)) {
    score += 4;
    strongEvidence += 1;
  }
  if (normalizedHost.length > 5 && normalizedFrom.includes(normalizedHost)) {
    score += 4;
    strongEvidence += 1;
  }
  if (!jobAlertContext && normalizedCompany.length > 3 && normalizedSubjectSnippet.includes(normalizedCompany)) {
    score += 3;
    strongEvidence += 1;
  }
  if (!jobAlertContext && applicationHost && normalizedSubjectSnippet.includes(normalizedHost)) {
    score += 3;
    strongEvidence += 1;
  }
  if (normalizedCompany.length > 3 && normalizedBody.includes(normalizedCompany) && responseContext) {
    score += 2;
    strongEvidence += 1;
  }
  if (titleTerms.some((term) => normalizedSubjectSnippet.includes(term)) && !jobAlertContext) score += atsSender ? 2 : 1;
  if (titleTerms.some((term) => normalizedBody.includes(term)) && responseContext) score += 1;
  if (atsSender && strongEvidence > 0 && responseContext) score += 1;

  if (strongEvidence === 0) return 0;

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
  "design",
  "devops",
  "platform",
  "technical",
  "lead",
  "mobile",
  "cloud",
  "remote",
]);
