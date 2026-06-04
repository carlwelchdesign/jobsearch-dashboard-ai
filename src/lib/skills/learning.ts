import { Prisma, type SkillAdjustmentKind, type SkillAdjustmentRiskLevel } from "@prisma/client";
import { sanitizeTraceInput } from "@/lib/observability/langsmith";
import { createQualityExampleFromFeedback } from "@/lib/observability/quality";
import { prisma } from "@/lib/prisma";
import { skillRegistry } from "@/lib/skills/registry";
import type { SkillId } from "@/lib/skills/types";

export type CaptureSkillFeedbackInput = {
  userId: string;
  message: string;
  contextPath: string;
  joleneMessageId?: string | null;
  contextData?: unknown;
};

export type CaptureSkillFeedbackResult = {
  feedbackId: string;
  skillId: SkillId;
  problemSummary: string;
  autoApplied: number;
  pending: number;
  adjustments: Array<{
    id: string;
    status: string;
    kind: string;
    riskLevel: string;
    rationale: string;
  }>;
};

export function isSkillFeedbackIntent(message: string) {
  const normalized = normalize(message);
  return (
    /\b(that|this|it|you|jolene|agency|agent|skill)\b.*\b(wrong|incorrect|bad|mistake|failed|broke|not right)\b/.test(normalized) ||
    /\b(learn|remember|do not|don't|never|stop)\b.*\b(again|next time|from this|that)\b/.test(normalized) ||
    /\b(i want|from now on|going forward|when mentioning|when applying|refer(?:red)? to as)\b.*\b(cover letter|coverletter|resume|application|app|agent|jolene|roles?)\b/.test(normalized) ||
    /\b(the agency|the agent|the skill)\b.*\b(made a mistake|messed up|picked wrong|scored wrong)\b/.test(normalized)
  );
}

export async function captureSkillFeedback(input: CaptureSkillFeedbackInput): Promise<CaptureSkillFeedbackResult> {
  const skillId = inferSkillId(input.message, input.contextPath);
  const problemSummary = summarizeProblem(input.message);
  const expectedBehavior = summarizeExpectedBehavior(input.message);
  const contextIds = contextEntityIds(input.contextData);
  const proposal = proposeAdjustment({ message: input.message, skillId });
  const observability = await relatedObservabilityContext({
    agentRunId: contextIds.agentRunId,
    applicationId: contextIds.applicationId,
  });

  const feedback = await prisma.skillFeedback.create({
    data: {
      userId: input.userId,
      skillId,
      joleneMessageId: input.joleneMessageId ?? null,
      applicationId: contextIds.applicationId,
      jobPostingId: contextIds.jobPostingId,
      rawMessage: input.message,
      problemSummary,
      expectedBehavior,
      confidence: confidenceForSkill(input.message, input.contextPath),
      contextJson: toJsonInput({
        contextPath: input.contextPath,
        inferredSkill: skillRegistry[skillId].label,
        contextData: input.contextData ?? null,
        observability,
      }),
    },
  });

  const adjustments = proposal
    ? [await createAdjustment({ userId: input.userId, feedbackId: feedback.id, skillId, ...proposal })]
    : [];
  await createQualityExampleFromFeedback(feedback.id).catch(() => null);

  return {
    feedbackId: feedback.id,
    skillId,
    problemSummary,
    autoApplied: adjustments.filter((adjustment) => adjustment.status === "ACTIVE").length,
    pending: adjustments.filter((adjustment) => adjustment.status === "PROPOSED").length,
    adjustments: adjustments.map((adjustment) => ({
      id: adjustment.id,
      status: adjustment.status,
      kind: adjustment.kind,
      riskLevel: adjustment.riskLevel,
      rationale: adjustment.rationale,
    })),
  };
}

async function createAdjustment(input: {
  userId: string;
  feedbackId: string;
  skillId: SkillId;
  kind: SkillAdjustmentKind;
  riskLevel: SkillAdjustmentRiskLevel;
  patchJson: Prisma.InputJsonValue;
  rationale: string;
}) {
  const autoApply = input.riskLevel === "LOW" && skillRegistry[input.skillId].defaultPolicy.autoApplyLearningKinds.includes(input.kind);
  const priorActive = autoApply
    ? await prisma.skillAdjustment.findFirst({
        where: { userId: input.userId, skillId: input.skillId, kind: input.kind, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const adjustment = await prisma.skillAdjustment.create({
    data: {
      userId: input.userId,
      skillId: input.skillId,
      feedbackId: input.feedbackId,
      supersedesId: priorActive?.id ?? null,
      kind: input.kind,
      riskLevel: input.riskLevel,
      status: autoApply ? "ACTIVE" : "PROPOSED",
      patchJson: input.patchJson,
      rationale: input.rationale,
      appliedAt: autoApply ? new Date() : null,
    },
  });

  if (priorActive) {
    await prisma.skillAdjustment.update({
      where: { id: priorActive.id },
      data: { status: "SUPERSEDED" },
    });
  }

  return adjustment;
}

function inferSkillId(message: string, contextPath: string): SkillId {
  const normalized = normalize(`${message} ${contextPath}`);
  if (contextPath.startsWith("/applications/") && /interview|prep/.test(normalized)) return "interview_prep";
  if (contextPath.startsWith("/applications/") && /company|research/.test(normalized)) return "company_research";
  if (contextPath.startsWith("/applications/") && /recruiter|outreach|message/.test(normalized)) return "recruiter_intelligence";
  if (contextPath.startsWith("/applications/") && /compensation|salary|remote/.test(normalized)) return "compensation_opportunity";
  if (contextPath.startsWith("/applications/") && /portfolio|github|project/.test(normalized)) return "portfolio_match";
  if (/cover letter|coverletter/.test(normalized)) return "cover_letter_writer";
  if (contextPath.startsWith("/applications") || /agency|packet|application|cover letter|resume/.test(normalized)) return "prepare_application_packet";
  if (contextPath.startsWith("/jobs") || /score|match|job|fit|approve|reject/.test(normalized)) return "job_fit_scorer";
  if (contextPath.startsWith("/profiles") || /profile|search lane|keywords/.test(normalized)) return "search_profile_manager";
  if (contextPath.startsWith("/evidence") || /evidence|claim|unsupported/.test(normalized)) return "candidate_intelligence";
  if (/duplicate|stale/.test(normalized)) return "duplicate_stale_job_detector";
  if (/network|contact|follow up|follow-up/.test(normalized)) return "networking_strategy";
  return "daily_command_center";
}

function proposeAdjustment(input: { message: string; skillId: SkillId }) {
  const normalized = normalize(input.message);
  if (input.skillId === "approve_agency_match" || /\bagency\b.*\b(too many|too low|bad match|wrong job|not selective)\b/.test(normalized)) {
    return {
      kind: "THRESHOLD" as const,
      riskLevel: "LOW" as const,
      patchJson: { field: "minimumScore", value: 95 },
      rationale: "Raised the agency approval threshold within the low-risk bounded range after user feedback that a promoted match was wrong.",
    };
  }
  if (/\b(em dash|dash|generic|hype|too long|tone|wording|style)\b/.test(normalized)) {
    return {
      kind: "STYLE_RULE" as const,
      riskLevel: "LOW" as const,
      patchJson: { guidance: input.message.slice(0, 500) },
      rationale: "Recorded a conservative writing/style rule from user feedback for future QA guidance.",
    };
  }
  if (/\b(score|weight|ranking|ranked|fit)\b/.test(normalized)) {
    return {
      kind: "SCORING_WEIGHT" as const,
      riskLevel: "HIGH" as const,
      patchJson: { requestedChange: input.message.slice(0, 500) },
      rationale: "Scoring changes can materially alter which jobs are promoted, so this remains pending review.",
    };
  }
  return {
    kind: "GUIDANCE" as const,
    riskLevel: "LOW" as const,
    patchJson: { guidance: input.message.slice(0, 500) },
    rationale: "Recorded user correction as conservative guidance for future skill runs.",
  };
}

function summarizeProblem(message: string) {
  return message.trim().slice(0, 500);
}

function summarizeExpectedBehavior(message: string) {
  const match = message.match(/\b(?:should|instead|next time|from now on)\b(.+)/i);
  return match?.[1]?.trim().slice(0, 500) ?? null;
}

function confidenceForSkill(message: string, contextPath: string) {
  if (/agency|score|packet|resume|cover letter|recruiter|interview|company/i.test(message)) return 0.78;
  if (contextPath !== "/dashboard") return 0.66;
  return 0.52;
}

function contextEntityIds(contextData: unknown) {
  const data = contextData && typeof contextData === "object" && !Array.isArray(contextData) ? contextData as Record<string, unknown> : {};
  const application = data.application && typeof data.application === "object" && !Array.isArray(data.application) ? data.application as Record<string, unknown> : {};
  const job = data.job && typeof data.job === "object" && !Array.isArray(data.job) ? data.job as Record<string, unknown> : {};
  return {
    applicationId: typeof application.id === "string" ? application.id : null,
    jobPostingId: typeof job.id === "string" ? job.id : typeof application.jobPostingId === "string" ? application.jobPostingId : null,
    agentRunId: typeof data.agentRunId === "string" ? data.agentRunId : null,
  };
}

async function relatedObservabilityContext(input: { agentRunId?: string | null; applicationId?: string | null }) {
  const [agentRun, automationRun] = await Promise.all([
    input.agentRunId
      ? prisma.agentRun.findUnique({
          where: { id: input.agentRunId },
          select: { id: true, agentType: true, observabilityJson: true },
        })
      : null,
    input.applicationId
      ? prisma.applicationAutomationRun.findFirst({
          where: { applicationId: input.applicationId },
          select: { id: true, graphThreadId: true, currentNode: true, status: true, observabilityJson: true },
          orderBy: { startedAt: "desc" },
        })
      : null,
  ]);
  return sanitizeTraceInput({ agentRun, automationRun });
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function normalize(message: string) {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
