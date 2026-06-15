import type { AgentType, ApplicationOutcomeType, CalendarEventProposal, EmailMessageClassification, EmailOpsFinding, Prisma } from "@prisma/client";
import { createAgentUserRequest } from "@/lib/agent-user-requests";
import { recordApplicationOutcome } from "@/lib/applications/outcomes";
import { runAgent } from "@/lib/agents/run-agent";
import { classifyJobEmail } from "@/lib/email-response-agent";
import { syncJobResponseEmail, type EmailSyncResult } from "@/lib/email/sync";
import { prisma } from "@/lib/prisma";

export type JoleneEmailOpsInput = {
  userId?: string;
  parentRunId?: string | null;
  source?: "manual" | "scheduled" | "dashboard" | "chat" | "jolene";
  limit?: number;
  sinceDays?: number;
};

export type JoleneEmailOpsSummary = {
  generatedAt: string;
  title: "Jolene Email Operations";
  summary: string;
  scanned: number;
  ingested: number;
  suppressed: number;
  dismissedNoise: number;
  findingsCreated: number;
  autoApplied: number;
  needsApproval: number;
  calendarDrafts: number;
  providerStatuses: Array<{ provider: string; ok: boolean; detail: string }>;
  specialistRuns: Array<{ agentType: AgentType; runId: string; status: string }>;
  approvals: Array<{ findingId: string; label: string; reason: string; href: string }>;
  risks: string[];
  evidence: string[];
};

type SyncedEmailRecord = {
  id: string;
  provider: string;
  providerMessageId: string;
  from: string;
  subject: string;
  receivedAt: Date;
  snippet: string;
  bodyText: string | null;
  classification: EmailMessageClassification;
  confidenceScore: number;
  matchedApplicationId: string | null;
  matchedJobPostingId: string | null;
  actionRequired: boolean;
  matchedApplication: { id: string; status: string; jobPosting: { company: string; title: string } } | null;
  matchedJobPosting: { id: string; company: string; title: string } | null;
};

export async function runJoleneEmailOperationsAgent(input: JoleneEmailOpsInput = {}) {
  const user = input.userId
    ? await prisma.user.findUnique({ where: { id: input.userId } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user exists. Run seed first.");

  return runAgent<JoleneEmailOpsInput, JoleneEmailOpsSummary>({
    agentType: "JOLENE_EMAIL_OPERATIONS",
    userId: user.id,
    parentRunId: input.parentRunId,
    input: { ...input, source: input.source ?? "manual" },
    execute: async (run) => {
      const specialistRuns: JoleneEmailOpsSummary["specialistRuns"] = [];
      const scout = await runSpecialist("EMAIL_INBOX_SCOUT", run.id, user.id, {
        source: input.source ?? "manual",
        limit: input.limit,
        sinceDays: input.sinceDays,
      }, async () => syncJobResponseEmail({
        limit: input.limit,
        sinceDays: input.sinceDays,
      }));
      specialistRuns.push(runRef(scout.run.agentType, scout.run.id, scout.run.status));

      const cleanup = await cleanupNoisyRecentEmailOps(user.id);
      const emails = await collectRecentSyncedEmails(user.id, run.createdAt, scout.output);
      const matcher = await runSpecialist("EMAIL_APPLICATION_MATCHER", run.id, user.id, { emailCount: emails.length }, async () => ({
        matched: emails.filter((email) => email.matchedApplicationId || email.matchedJobPostingId).length,
        unmatched: emails.filter((email) => !email.matchedApplicationId && !email.matchedJobPostingId).length,
      }));
      specialistRuns.push(runRef(matcher.run.agentType, matcher.run.id, matcher.run.status));

      const classifier = await runSpecialist("EMAIL_OUTCOME_CLASSIFIER", run.id, user.id, { emailCount: emails.length }, async () => createFindingsForEmails(user.id, run.id, emails));
      specialistRuns.push(runRef(classifier.run.agentType, classifier.run.id, classifier.run.status));

      const scheduler = await runSpecialist("EMAIL_SCHEDULING_COORDINATOR", run.id, user.id, { findingIds: classifier.output.findings.map((finding) => finding.id) }, async () => createCalendarProposals(user.id, classifier.output.findings));
      specialistRuns.push(runRef(scheduler.run.agentType, scheduler.run.id, scheduler.run.status));

      const actionDrafter = await runSpecialist("EMAIL_ACTION_DRAFTER", run.id, user.id, { findingIds: classifier.output.findings.map((finding) => finding.id) }, async () => draftActionsForFindings(classifier.output.findings));
      specialistRuns.push(runRef(actionDrafter.run.agentType, actionDrafter.run.id, actionDrafter.run.status));

      const reviewer = await runSpecialist("EMAIL_PRIVACY_REVIEWER", run.id, user.id, { findingIds: classifier.output.findings.map((finding) => finding.id) }, async () => reviewFindings(classifier.output.findings, scheduler.output.proposals));
      specialistRuns.push(runRef(reviewer.run.agentType, reviewer.run.id, reviewer.run.status));

      const output = buildEmailOpsSummary({
        sync: scout.output,
        cleanup,
        findings: classifier.output.findings,
        proposals: scheduler.output.proposals,
        specialistRuns,
        risks: reviewer.output.risks,
      });

      const reporter = await runSpecialist("EMAIL_OPS_REPORTER", run.id, user.id, output, async () => ({
        summary: output.summary,
        approvals: output.approvals.length,
        evidence: output.evidence,
      }));
      specialistRuns.push(runRef(reporter.run.agentType, reporter.run.id, reporter.run.status));

      const finalOutput = { ...output, specialistRuns };
      await prisma.agentRunEvent.create({
        data: {
          agentRunId: run.id,
          type: "email_ops_reported",
          message: `Email Ops created ${finalOutput.findingsCreated} finding(s), ${finalOutput.autoApplied} auto-applied update(s), and ${finalOutput.calendarDrafts} calendar draft(s).`,
          payloadJson: toJsonInput(finalOutput),
        },
      });

      return finalOutput;
    },
  });
}

export async function getLatestEmailOpsSummary(userId?: string | null) {
  const latestRun = await prisma.agentRun.findFirst({
    where: {
      agentType: "JOLENE_EMAIL_OPERATIONS",
      status: "COMPLETED",
      ...(userId ? { userId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  const findings = await prisma.emailOpsFinding.findMany({
    where: {
      ...(userId ? { userId } : {}),
    },
    include: {
      calendarProposals: true,
      emailMessage: { select: { from: true, subject: true, receivedAt: true } },
      matchedApplication: { include: { jobPosting: { select: { company: true, title: true } } } },
      matchedJobPosting: { select: { company: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  const pendingCalendarProposals = await prisma.calendarEventProposal.findMany({
    where: {
      ...(userId ? { userId } : {}),
      status: "DRAFT",
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return {
    latestRun,
    summary: parseEmailOpsOutput(latestRun?.outputJson),
    findings,
    pendingCalendarProposals,
  };
}

export async function approveEmailOpsFinding(input: { userId: string; findingId: string }) {
  const finding = await prisma.emailOpsFinding.findFirst({
    where: { id: input.findingId, userId: input.userId },
    include: { calendarProposals: true },
  });
  if (!finding) throw new Error("Email Ops finding not found.");
  if (finding.status !== "NEEDS_APPROVAL") throw new Error("Email Ops finding is not waiting for approval.");

  const mutation = objectValue(finding.suggestedMutationJson);
  const outcome = typeof mutation.outcome === "string" ? mutation.outcome as ApplicationOutcomeType : null;
  if (outcome && finding.matchedApplicationId) {
    await recordOutcomeIfMissing({
      applicationId: finding.matchedApplicationId,
      outcome,
      notes: `Approved Email Ops finding: ${finding.summary}`,
      occurredAt: new Date(),
    });
  }

  const [updated] = await prisma.$transaction([
    prisma.emailOpsFinding.update({
      where: { id: finding.id },
      data: { status: "APPROVED", approvedAt: new Date() },
    }),
    prisma.calendarEventProposal.updateMany({
      where: { findingId: finding.id, status: "DRAFT" },
      data: { status: "APPROVED", approvedAt: new Date() },
    }),
  ]);

  return {
    finding: updated,
    message: "Email Ops finding approved. Calendar proposals remain in-app drafts until an external calendar integration is approved.",
  };
}

export async function dismissEmailOpsFinding(input: { userId: string; findingId: string }) {
  const finding = await prisma.emailOpsFinding.findFirst({ where: { id: input.findingId, userId: input.userId } });
  if (!finding) throw new Error("Email Ops finding not found.");
  const [updated] = await prisma.$transaction([
    prisma.emailOpsFinding.update({
      where: { id: finding.id },
      data: { status: "DISMISSED", dismissedAt: new Date() },
    }),
    prisma.calendarEventProposal.updateMany({
      where: { findingId: finding.id, status: "DRAFT" },
      data: { status: "DISMISSED", dismissedAt: new Date() },
    }),
  ]);
  return { finding: updated, message: "Email Ops finding dismissed." };
}

async function runSpecialist<TInput, TOutput>(
  agentType: AgentType,
  parentRunId: string,
  userId: string,
  input: TInput,
  execute: () => Promise<TOutput>,
) {
  return runAgent<TInput, TOutput>({
    agentType,
    userId,
    parentRunId,
    input,
    execute,
  });
}

async function collectRecentSyncedEmails(userId: string, runStartedAt: Date, sync: EmailSyncResult): Promise<SyncedEmailRecord[]> {
  const ids = new Set<string>();
  for (const provider of sync.providers) {
    if (!("messages" in provider)) continue;
    for (const message of provider.messages) ids.add(message.providerMessageId);
  }
  const filters: Prisma.EmailMessageRecordWhereInput[] = [{ createdAt: { gte: new Date(runStartedAt.getTime() - 60_000) } }];
  if (ids.size) filters.unshift({ providerMessageId: { in: Array.from(ids) } });

  return prisma.emailMessageRecord.findMany({
    where: {
      userId,
      OR: filters,
    },
    include: {
      matchedApplication: { include: { jobPosting: { select: { company: true, title: true } } } },
      matchedJobPosting: { select: { id: true, company: true, title: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });
}

async function createFindingsForEmails(userId: string, agentRunId: string, emails: SyncedEmailRecord[]) {
  const findings: EmailOpsFinding[] = [];
  for (const email of emails) {
    if (shouldSuppressFinding(email)) continue;
    const existing = await prisma.emailOpsFinding.findFirst({
      where: { userId, emailMessageRecordId: email.id, classification: email.classification },
    });
    if (existing) {
      findings.push(existing);
      continue;
    }

    const policy = policyForEmail(email);
    const finding = await prisma.emailOpsFinding.create({
      data: {
        userId,
        agentRunId,
        emailMessageRecordId: email.id,
        matchedApplicationId: email.matchedApplicationId,
        matchedJobPostingId: email.matchedJobPostingId,
        classification: email.classification,
        confidenceScore: email.confidenceScore,
        status: policy.status,
        title: findingTitle(email),
        summary: findingSummary(email),
        recommendedAction: policy.recommendedAction,
        reviewReason: policy.reviewReason,
        evidenceJson: evidenceForEmail(email) as Prisma.InputJsonValue,
        extractedJson: extractedDetails(email) as Prisma.InputJsonValue,
        suggestedMutationJson: policy.suggestedMutation as Prisma.InputJsonValue,
        provenanceJson: provenanceForEmail(email) as Prisma.InputJsonValue,
        appliedAt: policy.status === "AUTO_APPLIED" ? new Date() : null,
      },
    });
    findings.push(finding);

    if (policy.status === "NEEDS_APPROVAL") {
      await createAgentUserRequest({
        userId,
        agentRunId,
        applicationId: email.matchedApplicationId,
        jobPostingId: email.matchedJobPostingId,
        type: email.classification === "NEEDS_REVIEW" ? "EMAIL_REVIEW" : "APPROVAL_NEEDED",
        question: `${finding.title}: ${policy.reviewReason ?? "Review before Email Ops updates the system."}`,
        contextJson: {
          source: "jolene_email_ops",
          findingId: finding.id,
          emailMessageId: email.id,
          classification: email.classification,
          confidenceScore: email.confidenceScore,
        },
      });
    }
  }

  return { findings };
}

async function createCalendarProposals(userId: string, findings: EmailOpsFinding[]) {
  const proposals: CalendarEventProposal[] = [];
  for (const finding of findings) {
    if (!calendarEligibleClassifications.has(finding.classification)) continue;
    if (!finding.matchedApplicationId || finding.confidenceScore < 80) continue;
    const existing = await prisma.calendarEventProposal.findFirst({ where: { findingId: finding.id } });
    if (existing) {
      proposals.push(existing);
      continue;
    }
    const extracted = objectValue(finding.extractedJson);
    const title = typeof extracted.calendarTitle === "string" ? extracted.calendarTitle : finding.title;
    const proposal = await prisma.calendarEventProposal.create({
      data: {
        userId,
        findingId: finding.id,
        emailMessageRecordId: finding.emailMessageRecordId,
        applicationId: finding.matchedApplicationId,
        jobPostingId: finding.matchedJobPostingId,
        status: "DRAFT",
        title,
        timezone: typeof extracted.timezone === "string" ? extracted.timezone : "local",
        location: typeof extracted.location === "string" ? extracted.location : null,
        meetingUrl: typeof extracted.meetingUrl === "string" ? extracted.meetingUrl : null,
        attendeesJson: (Array.isArray(extracted.attendees) ? extracted.attendees : []) as Prisma.InputJsonValue,
        sourceSummary: finding.summary,
        confidenceScore: finding.confidenceScore,
        metadataJson: {
          source: "jolene_email_ops",
          findingId: finding.id,
          approvalRequired: true,
        },
      },
    });
    proposals.push(proposal);
  }
  return { proposals };
}

async function draftActionsForFindings(findings: EmailOpsFinding[]) {
  return {
    drafts: findings
      .filter((finding) => ["SCHEDULING_REQUEST", "INTERVIEW_REQUEST", "OFFER", "NEEDS_REVIEW"].includes(finding.classification))
      .map((finding) => ({
        findingId: finding.id,
        type: "response_draft",
        summary: `Draft a human-approved reply for: ${finding.title}`,
        externalSendBlocked: true,
      })),
  };
}

async function reviewFindings(findings: EmailOpsFinding[], proposals: CalendarEventProposal[]) {
  const risks: string[] = [];
  const unmatched = findings.filter((finding) => !finding.matchedApplicationId && !finding.matchedJobPostingId).length;
  const approvals = findings.filter((finding) => finding.status === "NEEDS_APPROVAL").length;
  if (unmatched) risks.push(`${unmatched} email finding(s) could not be safely matched to an application or job.`);
  if (approvals) risks.push(`${approvals} finding(s) require approval before mutation or external action.`);
  if (proposals.length) risks.push(`${proposals.length} calendar draft(s) were created in-app only; no external calendar writes were made.`);
  return { risks };
}

function buildEmailOpsSummary(input: {
  sync: EmailSyncResult;
  cleanup: { reclassified: number; dismissedFindings: number; dismissedCalendarDrafts: number };
  findings: EmailOpsFinding[];
  proposals: CalendarEventProposal[];
  specialistRuns: JoleneEmailOpsSummary["specialistRuns"];
  risks: string[];
}): JoleneEmailOpsSummary {
  const autoApplied = input.findings.filter((finding) => finding.status === "AUTO_APPLIED").length;
  const needsApproval = input.findings.filter((finding) => finding.status === "NEEDS_APPROVAL").length;
  const summary = input.findings.length
    ? `Email Ops reviewed ${input.sync.scanned} message(s), created ${input.findings.length} finding(s), and drafted ${input.proposals.length} calendar item(s).`
    : `Email Ops reviewed ${input.sync.scanned} message(s) and found no new job-response updates.`;

  return {
    generatedAt: new Date().toISOString(),
    title: "Jolene Email Operations",
    summary,
    scanned: input.sync.scanned,
    ingested: input.sync.ingested,
    suppressed: input.sync.suppressed,
    dismissedNoise: input.cleanup.dismissedFindings + input.cleanup.dismissedCalendarDrafts,
    findingsCreated: input.findings.length,
    autoApplied,
    needsApproval,
    calendarDrafts: input.proposals.length,
    providerStatuses: input.sync.providers.map((provider) => ({
      provider: provider.provider,
      ok: "ok" in provider ? Boolean(provider.ok) : false,
      detail: "reason" in provider ? provider.reason : `${provider.ingested}/${provider.scanned} ingested, ${provider.suppressed ?? 0} suppressed`,
    })),
    specialistRuns: input.specialistRuns,
    approvals: input.findings
      .filter((finding) => finding.status === "NEEDS_APPROVAL")
      .slice(0, 10)
      .map((finding) => ({
        findingId: finding.id,
        label: finding.title,
        reason: finding.reviewReason ?? "Approval required before mutation.",
        href: "/dashboard/email-ops",
      })),
    risks: input.risks,
    evidence: [
      `${input.sync.scanned} email message(s) scanned across configured providers.`,
      `${input.sync.suppressed} non-actionable email message(s) suppressed before review.`,
      `${input.cleanup.dismissedFindings + input.cleanup.dismissedCalendarDrafts} stale noisy finding or calendar draft item(s) dismissed.`,
      `${input.findings.length} durable Email Ops finding(s) available for Jolene.`,
      `${autoApplied} high-confidence internal update(s), ${needsApproval} approval-needed item(s).`,
    ],
  };
}

async function cleanupNoisyRecentEmailOps(userId: string) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.emailMessageRecord.findMany({
    where: { userId, receivedAt: { gte: since } },
    select: {
      id: true,
      from: true,
      subject: true,
      snippet: true,
      bodyText: true,
      classification: true,
      confidenceScore: true,
      matchedApplicationId: true,
      matchedJobPostingId: true,
    },
    take: 250,
    orderBy: { receivedAt: "desc" },
  });

  let reclassified = 0;
  const noisyEmailIds = new Set<string>();
  for (const row of rows) {
    const next = classifyJobEmail({
      from: row.from,
      subject: row.subject,
      snippet: row.snippet,
      bodyText: row.bodyText,
    });
    const noisy = next.classification === "UNRELATED" || next.classification === "NO_ACTION" || (
      next.classification === "NEEDS_REVIEW" &&
      next.confidenceScore < 70 &&
      !row.matchedApplicationId &&
      !row.matchedJobPostingId
    );
    if (noisy) noisyEmailIds.add(row.id);
    if (next.classification !== row.classification || next.confidenceScore !== row.confidenceScore) {
      await prisma.emailMessageRecord.update({
        where: { id: row.id },
        data: {
          classification: next.classification,
          confidenceScore: next.confidenceScore,
          actionRequired: next.actionRequired,
        },
      });
      reclassified += 1;
    }
  }

  if (!noisyEmailIds.size) {
    return { reclassified, dismissedFindings: 0, dismissedCalendarDrafts: 0 };
  }

  const noisyIds = Array.from(noisyEmailIds);
  const [findings, calendarDrafts] = await prisma.$transaction([
    prisma.emailOpsFinding.updateMany({
      where: {
        userId,
        emailMessageRecordId: { in: noisyIds },
        status: { in: ["NEEDS_APPROVAL", "BLOCKED"] },
      },
      data: { status: "DISMISSED", dismissedAt: new Date() },
    }),
    prisma.calendarEventProposal.updateMany({
      where: {
        userId,
        emailMessageRecordId: { in: noisyIds },
        status: "DRAFT",
      },
      data: { status: "DISMISSED", dismissedAt: new Date() },
    }),
  ]);

  return { reclassified, dismissedFindings: findings.count, dismissedCalendarDrafts: calendarDrafts.count };
}

function shouldSuppressFinding(email: SyncedEmailRecord) {
  if (email.classification === "UNRELATED" || email.classification === "NO_ACTION") return true;
  if (email.classification === "NEEDS_REVIEW" && email.confidenceScore < 70 && !email.matchedApplicationId && !email.matchedJobPostingId) return true;
  return false;
}

function policyForEmail(email: SyncedEmailRecord): {
  status: "AUTO_APPLIED" | "NEEDS_APPROVAL" | "BLOCKED";
  recommendedAction: string;
  reviewReason?: string;
  suggestedMutation: Record<string, unknown>;
} {
  const outcome = outcomeForClassification(email.classification);
  const matched = Boolean(email.matchedApplicationId);
  if (lowRiskAutoClassifications.has(email.classification) && email.confidenceScore >= 85 && matched) {
    return {
      status: "AUTO_APPLIED",
      recommendedAction: "Recorded as a high-confidence internal application update.",
      suggestedMutation: outcome ? { type: "application_outcome", outcome } : {},
    };
  }
  if (!matched) {
    return {
      status: "NEEDS_APPROVAL",
      recommendedAction: "Review and match this email before updating application state.",
      reviewReason: "Email Ops could not safely match this message to an application.",
      suggestedMutation: outcome ? { type: "application_outcome", outcome } : {},
    };
  }
  return {
    status: "NEEDS_APPROVAL",
    recommendedAction: "Review before updating stage, replying, or touching calendars.",
    reviewReason: reviewReasonForClassification(email.classification),
    suggestedMutation: outcome ? { type: "application_outcome", outcome } : {},
  };
}

function outcomeForClassification(classification: EmailMessageClassification): ApplicationOutcomeType | null {
  if (classification === "REJECTION") return "REJECTED";
  if (classification === "AUTOMATED_CONFIRMATION") return "APPLIED";
  if (classification === "INTERVIEW_REQUEST" || classification === "SCHEDULING_REQUEST" || classification === "RECRUITER_RESPONSE") return "RECRUITER_SCREEN";
  if (classification === "CODING_ASSESSMENT" || classification === "TAKE_HOME") return "TECH_SCREEN";
  if (classification === "OFFER") return "OFFER";
  return null;
}

function reviewReasonForClassification(classification: EmailMessageClassification) {
  if (classification === "OFFER") return "Offers always require explicit human review.";
  if (calendarEligibleClassifications.has(classification)) return "Calendar drafts and next-step changes require approval.";
  if (classification === "NEEDS_REVIEW") return "The classifier could not confidently decide what changed.";
  return "Approval required before Email Ops mutates this item.";
}

function findingTitle(email: SyncedEmailRecord) {
  const role = roleLabel(email);
  return `${humanClassification(email.classification)}${role ? `: ${role}` : ""}`;
}

function findingSummary(email: SyncedEmailRecord) {
  return `${email.subject} from ${email.from}`;
}

function roleLabel(email: SyncedEmailRecord) {
  const job = email.matchedApplication?.jobPosting ?? email.matchedJobPosting;
  return job ? `${job.company} - ${job.title}` : null;
}

function evidenceForEmail(email: SyncedEmailRecord) {
  return [
    `Subject: ${email.subject}`,
    `From: ${email.from}`,
    `Received: ${email.receivedAt.toISOString()}`,
    `Classification: ${email.classification} (${email.confidenceScore})`,
    email.snippet ? `Snippet: ${email.snippet.slice(0, 240)}` : null,
  ].filter(Boolean);
}

function extractedDetails(email: SyncedEmailRecord) {
  const text = [email.subject, email.snippet, email.bodyText].filter(Boolean).join("\n");
  const meetingUrl = text.match(/https?:\/\/\S*(?:calendly|calendar|meet|zoom|teams|greenhouse|ashby|lever)\S*/i)?.[0]?.replace(/[).,]+$/, "") ?? null;
  return {
    calendarTitle: roleLabel(email) ? `Interview or next step: ${roleLabel(email)}` : `Job search next step: ${email.subject}`,
    meetingUrl,
    location: meetingUrl ? "Online" : null,
    timezone: text.match(/\b(PT|PST|PDT|ET|EST|EDT|CT|CST|CDT|MT|MST|MDT)\b/)?.[0] ?? "local",
    attendees: [email.from],
    actionRequired: email.actionRequired,
  };
}

function provenanceForEmail(email: SyncedEmailRecord) {
  return {
    source: "jolene_email_ops",
    emailMessageRecordId: email.id,
    provider: email.provider,
    providerMessageId: email.providerMessageId,
    subject: email.subject,
    from: email.from,
    receivedAt: email.receivedAt.toISOString(),
  };
}

async function recordOutcomeIfMissing(input: { applicationId: string; outcome: ApplicationOutcomeType; notes: string; occurredAt: Date }) {
  const existing = await prisma.applicationOutcome.findFirst({
    where: { applicationId: input.applicationId, outcome: input.outcome },
  });
  if (existing) return null;
  return recordApplicationOutcome({
    applicationId: input.applicationId,
    outcome: input.outcome,
    notes: input.notes,
    occurredAt: input.occurredAt,
    source: "email_outcome",
  });
}

function parseEmailOpsOutput(value: unknown): JoleneEmailOpsSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const output = value as Partial<JoleneEmailOpsSummary>;
  return output.title === "Jolene Email Operations" ? output as JoleneEmailOpsSummary : null;
}

function runRef(agentType: AgentType, runId: string, status: string) {
  return { agentType, runId, status };
}

function objectValue(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function humanClassification(classification: EmailMessageClassification) {
  return classification.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

const lowRiskAutoClassifications = new Set<EmailMessageClassification>(["REJECTION", "AUTOMATED_CONFIRMATION"]);
const calendarEligibleClassifications = new Set<EmailMessageClassification>(["INTERVIEW_REQUEST", "SCHEDULING_REQUEST", "CODING_ASSESSMENT", "TAKE_HOME"]);
