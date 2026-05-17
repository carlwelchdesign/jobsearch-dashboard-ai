import { Prisma, type JobMatchStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const rejectionReasonCodes = [
  "wrong_seniority",
  "wrong_tech_stack",
  "compensation_location",
  "company_industry",
  "weak_fit",
  "duplicate_stale",
  "low_quality_posting",
  "not_interested",
] as const;

export type RejectionReasonCode = typeof rejectionReasonCodes[number];

export type CaptureJobRejectionLearningInput = {
  userId: string;
  matchId: string;
  jobPostingId?: string | null;
  source: string;
  reasons?: RejectionReasonCode[];
  note?: string | null;
  previousStatus?: JobMatchStatus | string | null;
};

export async function captureJobRejectionLearning(input: CaptureJobRejectionLearningInput) {
  const match = await prisma.jobProfileMatch.findUnique({
    where: { id: input.matchId },
    include: {
      jobPosting: { select: { id: true, company: true, title: true, location: true } },
      applications: { select: { id: true, status: true }, take: 5 },
      jobSearchProfile: { select: { name: true } },
    },
  });
  if (!match) return { created: 0 };

  const reasons = normalizeReasons(input.reasons);
  const note = input.note?.trim() ? input.note.trim().slice(0, 1000) : null;
  const reasonText = reasons.length ? reasons.map(labelForReason).join(", ") : "No reason provided";
  const context = {
    source: input.source,
    reasons,
    note,
    previousStatus: input.previousStatus ?? null,
    match: {
      id: match.id,
      score: match.overallScore,
      profile: match.jobSearchProfile.name,
      status: match.status,
    },
    job: match.jobPosting,
    applications: match.applications,
  };
  const message = [
    `Rejected job: ${match.jobPosting.company} - ${match.jobPosting.title}.`,
    `Reason: ${reasonText}.`,
    note ? `Note: ${note}` : null,
  ].filter(Boolean).join(" ");

  await createFeedbackWithGuidance({
    userId: input.userId,
    skillId: "job_fit_scorer",
    jobPostingId: match.jobPostingId,
    rawMessage: message,
    problemSummary: "User rejected this job as a poor fit.",
    expectedBehavior: "Score and rank similar jobs more cautiously in future job review.",
    context,
    guidance: `User rejected ${match.jobPosting.company} - ${match.jobPosting.title}. Reasons: ${reasonText}.${note ? ` Note: ${note}` : ""}`,
    rationale: "Recorded job rejection as low-risk scoring guidance.",
  });

  let created = 1;
  if (shouldTeachAgency(match, input.previousStatus)) {
    await createFeedbackWithGuidance({
      userId: input.userId,
      skillId: "approve_agency_match",
      jobPostingId: match.jobPostingId,
      rawMessage: message,
      problemSummary: "A job that could be promoted by the agency was rejected as a poor fit.",
      expectedBehavior: "Avoid approving similar jobs unless the fit signals are stronger.",
      context,
      guidance: `Treat similar agency approvals more cautiously. Rejected reasons: ${reasonText}.${note ? ` Note: ${note}` : ""}`,
      rationale: "Recorded rejection as low-risk agency approval guidance.",
    });
    created += 1;
  }

  return { created };
}

function normalizeReasons(reasons?: RejectionReasonCode[]) {
  const allowed = new Set(rejectionReasonCodes);
  return Array.from(new Set((reasons ?? []).filter((reason) => allowed.has(reason))));
}

function shouldTeachAgency(
  match: { overallScore: number; applications: Array<{ id: string }>; status: JobMatchStatus },
  previousStatus?: JobMatchStatus | string | null,
) {
  return (
    match.overallScore >= 90 ||
    match.applications.length > 0 ||
    previousStatus === "approved" ||
    previousStatus === "ready_to_apply"
  );
}

async function createFeedbackWithGuidance(input: {
  userId: string;
  skillId: "job_fit_scorer" | "approve_agency_match";
  jobPostingId: string;
  rawMessage: string;
  problemSummary: string;
  expectedBehavior: string;
  context: unknown;
  guidance: string;
  rationale: string;
}) {
  return prisma.skillFeedback.create({
    data: {
      userId: input.userId,
      skillId: input.skillId,
      jobPostingId: input.jobPostingId,
      rawMessage: input.rawMessage,
      problemSummary: input.problemSummary,
      expectedBehavior: input.expectedBehavior,
      confidence: 0.82,
      contextJson: toJsonInput(input.context),
      adjustments: {
        create: {
          userId: input.userId,
          skillId: input.skillId,
          kind: "GUIDANCE",
          riskLevel: "LOW",
          status: "ACTIVE",
          patchJson: toJsonInput({ guidance: input.guidance, source: "job_rejection" }),
          rationale: input.rationale,
          appliedAt: new Date(),
        },
      },
    },
  });
}

function labelForReason(reason: RejectionReasonCode) {
  return reason.replace(/_/g, " ");
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
