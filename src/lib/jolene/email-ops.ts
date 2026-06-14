import type { AgentType, ApplicationOutcomeType, CalendarEventProposal, EmailMessageClassification, EmailOpsFinding, Prisma } from "@prisma/client";
import { createAgentUserRequest } from "@/lib/agent-user-requests";
import { recordApplicationOutcome } from "@/lib/applications/outcomes";
import { runAgent } from "@/lib/agents/run-agent";
import { syncJobResponseEmail, type EmailSyncResult } from "@/lib/email/sync";
import { prisma } from "@/lib/prisma";

export type JoleneEmailOpsInput = {
  userId?: string;
  parentRunId?: string | null;
  source?: "manual" | "scheduled" | "dashboard" | "chat" | "jolene";
  limit?: number;
  sinceDays?: number;
  lookbackDays?: number;
  includeBackfill?: boolean;
  providerMode?: "all" | "connected_only" | "backfill_only";
};

export type JoleneEmailOpsSummary = {
  generatedAt: string;
  title: "Jolene Email Operations";
  summary: string;
  scanned: number;
  ingested: number;
  findingsCreated: number;
  autoApplied: number;
  needsApproval: number;
  calendarDrafts: number;
  providerStatuses: EmailOpsProviderHealth[];
  backfill: { enabled: boolean; lookbackDays: number; processed: number };
  specialistRuns: Array<{ agentType: AgentType; runId: string; status: string }>;
  approvals: Array<{ findingId: string; label: string; reason: string; href: string }>;
  risks: string[];
  evidence: string[];
};

export type EmailOpsProviderHealth = {
  provider: string;
  ok: boolean;
  status: "CONNECTED" | "NEEDS_REAUTH" | "DISABLED" | "MISSING" | "ERROR";
  detail: string;
  lastSyncAt: string | null;
  lastError?: string;
  actionRequired?: string;
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
      const lookbackDays = clampInteger(Number(input.lookbackDays ?? 90), 1, 365);
      const includeBackfill = input.includeBackfill !== false;
      const scout = await runSpecialist("EMAIL_INBOX_SCOUT", run.id, user.id, {
        source: input.source ?? "manual",
        limit: input.limit,
        sinceDays: input.sinceDays,
        lookbackDays,
        includeBackfill,
        providerMode: input.providerMode ?? "all",
      }, async () => input.providerMode === "backfill_only"
        ? emptySyncResult()
        : syncJobResponseEmail({
            limit: input.limit,
            sinceDays: input.sinceDays,
          }));
      specialistRuns.push(runRef(scout.run.agentType, scout.run.id, scout.run.status));

      const emails = await collectEmailOpsCandidateEmails(user.id, run.createdAt, scout.output, { includeBackfill, lookbackDays });
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
        findings: classifier.output.findings,
        proposals: scheduler.output.proposals,
        specialistRuns,
        risks: reviewer.output.risks,
        providerHealth: await buildProviderHealth(user.id, scout.output),
        backfill: { enabled: includeBackfill, lookbackDays, processed: emails.length },
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
  const providerHealth = userId ? await buildProviderHealth(userId) : [];

  return {
    latestRun,
    summary: parseEmailOpsOutput(latestRun?.outputJson),
    findings,
    pendingCalendarProposals,
    providerHealth,
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

async function collectEmailOpsCandidateEmails(userId: string, runStartedAt: Date, sync: EmailSyncResult, options: { includeBackfill: boolean; lookbackDays: number }): Promise<SyncedEmailRecord[]> {
  const ids = new Set<string>();
  for (const provider of sync.providers) {
    if (!("messages" in provider)) continue;
    for (const message of provider.messages) ids.add(message.providerMessageId);
  }
  const filters: Prisma.EmailMessageRecordWhereInput[] = [{ createdAt: { gte: new Date(runStartedAt.getTime() - 60_000) } }];
  if (ids.size) filters.unshift({ providerMessageId: { in: Array.from(ids) } });
  if (options.includeBackfill) {
    filters.push({
      receivedAt: { gte: new Date(Date.now() - options.lookbackDays * 86_400_000) },
      classification: { notIn: ["UNRELATED", "NO_ACTION"] },
    });
  }

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
    if (email.classification === "UNRELATED" || email.classification === "NO_ACTION") continue;
    if (isIgnorableJobAlert(email)) continue;
    const existing = await prisma.emailOpsFinding.findFirst({
      where: { userId, emailMessageRecordId: email.id, classification: email.classification },
    });
    if (existing) {
      findings.push(existing);
      continue;
    }

    const policy = policyForEmail(email);
    const extracted = extractedDetails(email);
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
        extractedJson: extracted as Prisma.InputJsonValue,
        suggestedMutationJson: policy.suggestedMutation as Prisma.InputJsonValue,
        provenanceJson: provenanceForEmail(email) as Prisma.InputJsonValue,
        appliedAt: policy.status === "AUTO_APPLIED" ? new Date() : null,
      },
    });
    findings.push(finding);

    if (policy.status === "AUTO_APPLIED" && policy.suggestedMutation.outcome && email.matchedApplicationId) {
      await recordOutcomeIfMissing({
        applicationId: email.matchedApplicationId,
        outcome: policy.suggestedMutation.outcome as ApplicationOutcomeType,
        notes: `Auto-applied Email Ops finding: ${finding.summary}`,
        occurredAt: email.receivedAt,
      });
    }

    if (policy.status === "NEEDS_APPROVAL") {
      await createAgentUserRequest({
        userId,
        agentRunId,
        applicationId: email.matchedApplicationId,
        jobPostingId: email.matchedJobPostingId,
        type: extracted.nextStepType === "application_verification" ? "APPLICATION_BLOCKED" : email.classification === "NEEDS_REVIEW" ? "EMAIL_REVIEW" : "APPROVAL_NEEDED",
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
  findings: EmailOpsFinding[];
  proposals: CalendarEventProposal[];
  specialistRuns: JoleneEmailOpsSummary["specialistRuns"];
  risks: string[];
  providerHealth: EmailOpsProviderHealth[];
  backfill: JoleneEmailOpsSummary["backfill"];
}): JoleneEmailOpsSummary {
  const autoApplied = input.findings.filter((finding) => finding.status === "AUTO_APPLIED").length;
  const needsApproval = input.findings.filter((finding) => finding.status === "NEEDS_APPROVAL").length;
  const providerBlockers = input.providerHealth.filter((provider) => !provider.ok);
  const summary = providerBlockers.length
    ? `Email Ops needs attention: ${providerBlockers.map((provider) => `${provider.provider} ${provider.status.toLowerCase()}`).join(", ")}. Backfill still reviewed ${input.backfill.processed} stored message(s).`
    : input.findings.length
    ? `Email Ops reviewed ${input.sync.scanned} message(s), created ${input.findings.length} finding(s), and drafted ${input.proposals.length} calendar item(s).`
    : `Email Ops reviewed ${input.sync.scanned} message(s) and found no new job-response updates.`;

  return {
    generatedAt: new Date().toISOString(),
    title: "Jolene Email Operations",
    summary,
    scanned: input.sync.scanned,
    ingested: input.sync.ingested,
    findingsCreated: input.findings.length,
    autoApplied,
    needsApproval,
    calendarDrafts: input.proposals.length,
    providerStatuses: input.providerHealth,
    backfill: input.backfill,
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
    risks: [
      ...providerBlockers.map((provider) => `${provider.provider} requires attention: ${provider.detail}`),
      ...input.risks,
    ],
    evidence: [
      `${input.sync.scanned} email message(s) scanned across configured providers.`,
      `${input.backfill.processed} stored email message(s) reviewed by backfill.`,
      `${input.findings.length} durable Email Ops finding(s) available for Jolene.`,
      `${autoApplied} high-confidence internal update(s), ${needsApproval} approval-needed item(s).`,
    ],
  };
}

function policyForEmail(email: SyncedEmailRecord): {
  status: "AUTO_APPLIED" | "NEEDS_APPROVAL" | "BLOCKED";
  recommendedAction: string;
  reviewReason?: string;
  suggestedMutation: Record<string, unknown>;
} {
  const outcome = outcomeForClassification(email.classification);
  const matched = Boolean(email.matchedApplicationId);
  if (isApplicationVerificationEmail(email)) {
    return {
      status: "NEEDS_APPROVAL",
      recommendedAction: "Resolve the application verification step before treating this application as complete.",
      reviewReason: "This looks like an application security-code or verification email.",
      suggestedMutation: { type: "application_blocked", reason: "application_verification" },
    };
  }
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
  if (isApplicationVerificationEmail(email)) {
    const role = roleLabel(email);
    return `Application verification needed${role ? `: ${role}` : ""}`;
  }
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
    nextStepType: isApplicationVerificationEmail(email) ? "application_verification" : null,
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

async function buildProviderHealth(userId: string, sync?: EmailSyncResult): Promise<EmailOpsProviderHealth[]> {
  const connections = await prisma.emailOAuthConnection.findMany({
    where: { userId },
    select: { provider: true, status: true, lastSyncAt: true, updatedAt: true },
  });
  const byProvider = new Map(connections.map((connection) => [connection.provider, connection]));
  const syncByProvider = new Map((sync?.providers ?? []).map((provider) => [provider.provider, provider]));
  const providers = new Set<string>(["gmail", ...connections.map((connection) => connection.provider), ...(sync?.providers ?? []).map((provider) => provider.provider)]);

  return Array.from(providers).sort().map((providerName) => {
    const connection = byProvider.get(providerName as never);
    const syncProvider = syncByProvider.get(providerName as never);
    if (syncProvider && !syncProvider.ok) {
      const status = connection?.status === "NEEDS_REAUTH" ? "NEEDS_REAUTH" : connection?.status === "DISABLED" ? "DISABLED" : "ERROR";
      return {
        provider: providerName,
        ok: false,
        status,
        detail: syncProvider.reason,
        lastSyncAt: connection?.lastSyncAt?.toISOString() ?? null,
        lastError: syncProvider.reason,
        actionRequired: providerName === "gmail" && status === "NEEDS_REAUTH" ? "Reconnect Gmail in Settings." : "Review email provider configuration.",
      };
    }
    if (!connection) {
      return {
        provider: providerName,
        ok: false,
        status: "MISSING",
        detail: `No ${providerName} connection is configured.`,
        lastSyncAt: null,
        actionRequired: `Connect ${providerName} in Settings.`,
      };
    }
    if (connection.status !== "CONNECTED") {
      return {
        provider: providerName,
        ok: false,
        status: connection.status,
        detail: `${providerName} connection is ${connection.status}.`,
        lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
        actionRequired: connection.status === "NEEDS_REAUTH" ? `Reconnect ${providerName} in Settings.` : `Review ${providerName} connection in Settings.`,
      };
    }
    return {
      provider: providerName,
      ok: true,
      status: "CONNECTED",
      detail: syncProvider && "ingested" in syncProvider ? `${syncProvider.ingested}/${syncProvider.scanned} ingested` : `${providerName} is connected.`,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      ...(syncProvider && "queryErrors" in syncProvider && syncProvider.queryErrors.length ? { lastError: `${syncProvider.queryErrors.length} Gmail quer${syncProvider.queryErrors.length === 1 ? "y" : "ies"} failed.` } : {}),
    };
  });
}

function emptySyncResult(): EmailSyncResult {
  return { ok: true, scanned: 0, ingested: 0, skipped: 0, providers: [], watchlist: [], receivedConfirmations: [] };
}

function isIgnorableJobAlert(email: SyncedEmailRecord) {
  if (email.matchedApplicationId || email.matchedJobPostingId) return false;
  const text = `${email.from} ${email.subject} ${email.snippet}`.toLowerCase();
  return /\b(job alert|job matches|latest remote job|recommended jobs|new jobs for you|remote opportunities)\b/.test(text);
}

function isApplicationVerificationEmail(email: SyncedEmailRecord) {
  const text = `${email.subject}\n${email.snippet}\n${email.bodyText ?? ""}`.toLowerCase();
  return /\b(security code|verification code|copy and paste this code|resubmit your application|verify your application)\b/.test(text);
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
