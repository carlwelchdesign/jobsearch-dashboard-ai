import type {
  AgentImprovementProposalStatus,
  AgentQualityEvaluationStatus,
  AgentQualityExampleSource,
  AgentQualityTarget,
  ApplicationAutomationRunStatus,
  Prisma,
  SkillAdjustmentKind,
} from "@prisma/client";
import { sanitizeTraceInput } from "@/lib/observability/langsmith";
import { prisma } from "@/lib/prisma";
import type { SkillId } from "@/lib/skills/types";

const APPLICATION_ASSISTANT_DATASET = "application_assistant_autofill";
const SUPPORTED_EVALUATION_TARGETS = ["APPLICATION_ASSISTANT", "RECRUITING_AGENCY", "JOB_SEARCH", "JOB_MATCHING", "GENERATED_MATERIALS"] as const satisfies readonly AgentQualityTarget[];
const DATASET_NAMES: Record<AgentQualityTarget, string> = {
  APPLICATION_ASSISTANT: APPLICATION_ASSISTANT_DATASET,
  RECRUITING_AGENCY: "recruiting_agency_decisions",
  JOB_SEARCH: "job_search_results",
  JOB_MATCHING: "job_matching_decisions",
  GENERATED_MATERIALS: "generated_materials_quality",
  GITHUB_REVIEW: "github_portfolio_review",
  OUTREACH: "outreach_quality",
  OUTCOME_LEARNING: "outcome_learning",
  COMMAND_CENTER: "command_center_recommendations",
};
const EVALUATOR_VERSIONS: Record<typeof SUPPORTED_EVALUATION_TARGETS[number], string> = {
  APPLICATION_ASSISTANT: "application-assistant-quality-v1",
  RECRUITING_AGENCY: "recruiting-agency-quality-v1",
  JOB_SEARCH: "job-search-quality-v1",
  JOB_MATCHING: "job-matching-quality-v1",
  GENERATED_MATERIALS: "generated-materials-quality-v1",
};

export type ImprovementProposalActivation =
  | { status: "created"; adjustmentId: string; skillId: SkillId; kind: SkillAdjustmentKind; reason: string }
  | { status: "already_active"; adjustmentId: string; skillId: SkillId; kind: SkillAdjustmentKind; reason: string }
  | { status: "review_only"; reason: string };

type AutomationRunForQuality = Prisma.ApplicationAutomationRunGetPayload<{
  include: {
    application: true;
    jobPosting: true;
  };
}>;

export async function ensureApplicationAssistantDataset(userId: string) {
  return ensureAgentQualityDataset(
    userId,
    "APPLICATION_ASSISTANT",
    "Redacted examples for application assistant autofill, user handoff, submit detection, and watcher reliability.",
  );
}

export async function ensureAgentQualityDataset(userId: string, target: AgentQualityTarget, description?: string) {
  const name = DATASET_NAMES[target] ?? target.toLowerCase();
  return prisma.agentQualityDataset.upsert({
    where: { userId_name: { userId, name } },
    create: {
      userId,
      name,
      target,
      description: description ?? `Quality examples for ${target.toLowerCase().replaceAll("_", " ")}.`,
      metadataJson: {
        redactionMode: "metadata",
        langSmithOptional: true,
      },
    },
    update: {
      active: true,
    },
  });
}

export async function createQualityExampleFromAgentRun(
  agentRunId: string,
  target: AgentQualityTarget,
  failureCategory = "agent_run_issue",
) {
  const run = await prisma.agentRun.findUnique({
    where: { id: agentRunId },
    include: {
      events: { orderBy: { createdAt: "asc" }, take: 100 },
    },
  });
  if (!run?.userId) return null;

  const existing = await prisma.agentQualityExample.findFirst({
    where: {
      agentRunId: run.id,
      source: "AGENT_RUN",
      target,
      failureCategory,
    },
  });
  if (existing) return existing;

  const dataset = await ensureAgentQualityDataset(run.userId, target);
  const recentEvents = run.events.slice(-20).map((event) => ({
    type: event.type,
    message: event.message,
    payload: event.payloadJson,
    at: event.createdAt,
  }));

  return prisma.agentQualityExample.create({
    data: {
      userId: run.userId,
      datasetId: dataset.id,
      target,
      source: "AGENT_RUN",
      title: `${target.replaceAll("_", " ")} run ${run.status.toLowerCase()}`,
      summary: run.error ?? `Agent run captured ${failureCategory}.`,
      failureCategory,
      inputJson: sanitizeTraceInput({
        agentType: run.agentType,
        currentNode: run.currentNode,
        workflowVersion: run.workflowVersion,
      }),
      expectedJson: toJson({
        expectedBehavior: "Workflow should complete with consistent state, useful events, and no repeated avoidable failures.",
      }),
      actualJson: sanitizeTraceInput({
        status: run.status,
        error: run.error,
        currentNode: run.currentNode,
        workflowState: compactAgentRunWorkflowState(run.workflowStateJson),
        recentEvents,
      }),
      metadataJson: sanitizeTraceInput({
        source: "agent_run",
        graphThreadId: run.graphThreadId,
        workflowVersion: run.workflowVersion,
        observability: run.observabilityJson,
      }),
      agentRunId: run.id,
    },
  });
}

export async function createQualityExampleFromFeedback(feedbackId: string) {
  const feedback = await prisma.skillFeedback.findUnique({
    where: { id: feedbackId },
    include: {
      application: { include: { jobPosting: true } },
      jobPosting: true,
      agentRun: true,
    },
  });
  if (!feedback) return null;
  if (!isApplicationAssistantFeedback(feedback.skillId, feedback.contextJson, feedback.applicationId)) return null;

  const existing = await prisma.agentQualityExample.findFirst({
    where: { skillFeedbackId: feedback.id, target: "APPLICATION_ASSISTANT" },
  });
  if (existing) return existing;

  const dataset = await ensureApplicationAssistantDataset(feedback.userId);
  const context = objectJson(feedback.contextJson);
  const observability = objectJson(context.observability);
  const automationRun = objectJson(observability.automationRun);
  const failureCategory = failureCategoryFromFeedback(feedback.problemSummary, feedback.rawMessage, automationRun.status);

  return prisma.agentQualityExample.create({
    data: {
      userId: feedback.userId,
      datasetId: dataset.id,
      target: "APPLICATION_ASSISTANT",
      source: "SKILL_FEEDBACK",
      title: `Feedback: ${feedback.problemSummary.slice(0, 80)}`,
      summary: feedback.problemSummary,
      failureCategory,
      inputJson: toJson({
        contextPath: context.contextPath ?? null,
        skillId: feedback.skillId,
        applicationId: feedback.applicationId,
        jobPostingId: feedback.jobPostingId,
      }),
      expectedJson: toJson({
        expectedBehavior: feedback.expectedBehavior ?? "Agent should avoid repeating the reported mistake.",
      }),
      actualJson: toJson({
        problemSummary: feedback.problemSummary,
        automationRunStatus: automationRun.status ?? null,
        automationRunCurrentNode: automationRun.currentNode ?? null,
      }),
      metadataJson: sanitizeTraceInput({
        source: "skill_feedback",
        confidence: feedback.confidence,
        observability,
        company: feedback.application?.jobPosting.company ?? feedback.jobPosting?.company ?? null,
        title: feedback.application?.jobPosting.title ?? feedback.jobPosting?.title ?? null,
      }),
      skillFeedbackId: feedback.id,
      agentRunId: feedback.agentRunId,
      applicationId: feedback.applicationId,
      jobPostingId: feedback.jobPostingId,
    },
  });
}

export async function createQualityExampleFromAutomationRun(runId: string, source: AgentQualityExampleSource = "AUTOMATION_RUN") {
  const run = await prisma.applicationAutomationRun.findUnique({
    where: { id: runId },
    include: {
      application: true,
      jobPosting: true,
    },
  });
  if (!run) return null;

  const category = source === "MANUAL_REPAIR" ? "manual_submit_detection" : failureCategoryFromAutomationRun(run);
  const shouldCapture = Boolean(category || run.status === "SUBMITTED");
  if (!shouldCapture) return null;

  const existing = await prisma.agentQualityExample.findFirst({
    where: {
      automationRunId: run.id,
      source,
      failureCategory: category,
      target: "APPLICATION_ASSISTANT",
    },
  });
  if (existing) return existing;

  const dataset = await ensureApplicationAssistantDataset(run.userId);
  return prisma.agentQualityExample.create({
    data: {
      userId: run.userId,
      datasetId: dataset.id,
      target: "APPLICATION_ASSISTANT",
      source,
      title: `${run.jobPosting.company} - ${run.jobPosting.title}`,
      summary: summaryForAutomationRun(run, category),
      failureCategory: category,
      inputJson: toJson({
        atsProvider: run.jobPosting.atsProvider,
        statusBeforeEvaluation: run.status,
        currentNode: run.currentNode,
      }),
      expectedJson: toJson(expectedForAutomationRun(run, category)),
      actualJson: sanitizeTraceInput({
        status: run.status,
        blockerType: run.blockerType,
        blockerMessage: run.blockerMessage,
        currentNode: run.currentNode,
        workflowState: compactWorkflowState(run.workflowStateJson),
      }),
      metadataJson: sanitizeTraceInput({
        source,
        applicationId: run.applicationId,
        jobPostingId: run.jobPostingId,
        company: run.jobPosting.company,
        title: run.jobPosting.title,
        atsProvider: run.jobPosting.atsProvider,
        observability: run.observabilityJson,
      }),
      automationRunId: run.id,
      applicationId: run.applicationId,
      jobPostingId: run.jobPostingId,
    },
  });
}

export async function backfillApplicationAssistantQualityExamples(userId?: string) {
  const runs = await prisma.applicationAutomationRun.findMany({
    where: {
      ...(userId ? { userId } : {}),
      OR: [
        { status: "FAILED" },
        { status: "NEEDS_USER" },
        { status: "SUBMITTED" },
        { blockerType: { not: null } },
      ],
    },
    orderBy: { startedAt: "desc" },
    take: 200,
  });
  let createdOrFound = 0;
  for (const run of runs) {
    const example = await createQualityExampleFromAutomationRun(run.id, "BACKFILL");
    if (example) createdOrFound += 1;
  }
  return { scanned: runs.length, examples: createdOrFound };
}

export async function runApplicationAssistantEvaluations(userId?: string) {
  const result = await runAgentQualityEvaluations({ userId, target: "APPLICATION_ASSISTANT" });
  return {
    scanned: result.scanned,
    evaluated: result.evaluated,
    proposals: result.proposals,
    evaluations: result.evaluations,
  };
}

export async function backfillAgentQualityExamples(input: { userId?: string; target?: AgentQualityTarget } = {}) {
  const targets = supportedTargets(input.target);
  const results = [];
  for (const target of targets) {
    if (target === "APPLICATION_ASSISTANT") {
      results.push({ target, ...(await backfillApplicationAssistantQualityExamples(input.userId)) });
    } else if (target === "RECRUITING_AGENCY") {
      results.push({ target, ...(await backfillRecruitingAgencyQualityExamples(input.userId)) });
    } else if (target === "JOB_SEARCH") {
      results.push({ target, ...(await backfillJobSearchQualityExamples(input.userId)) });
    } else if (target === "JOB_MATCHING") {
      results.push({ target, ...(await backfillJobMatchingQualityExamples(input.userId)) });
    } else if (target === "GENERATED_MATERIALS") {
      results.push({ target, ...(await backfillGeneratedMaterialsQualityExamples(input.userId)) });
    }
  }
  return summarizeBackfillResults(results);
}

export async function runAgentQualityEvaluations(input: { userId?: string; target?: AgentQualityTarget } = {}) {
  const targets = supportedTargets(input.target);
  const perTarget = [];
  const evaluations = [];
  for (const target of targets) {
    const result = await runTargetEvaluations(target, input.userId);
    perTarget.push({
      target,
      scanned: result.scanned,
      evaluated: result.evaluated,
      proposals: result.proposals,
    });
    evaluations.push(...result.evaluations);
  }
  return {
    scanned: perTarget.reduce((sum, item) => sum + item.scanned, 0),
    evaluated: perTarget.reduce((sum, item) => sum + item.evaluated, 0),
    proposals: perTarget.reduce((sum, item) => sum + item.proposals, 0),
    targets: perTarget,
    evaluations,
  };
}

async function runTargetEvaluations(target: typeof SUPPORTED_EVALUATION_TARGETS[number], userId?: string) {
  const evaluatorVersion = EVALUATOR_VERSIONS[target];
  const examples = await prisma.agentQualityExample.findMany({
    where: {
      target,
      ...(userId ? { userId } : {}),
    },
    include: { evaluations: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  let evaluated = 0;
  const evaluations = [];
  for (const example of examples) {
    if (example.evaluations[0]?.evaluatorVersion === evaluatorVersion) continue;
    const result = evaluateQualityExample(target, example);
    evaluations.push(await prisma.agentQualityEvaluation.create({
      data: {
        userId: example.userId,
        datasetId: example.datasetId,
        exampleId: example.id,
        agentRunId: example.agentRunId,
        target,
        evaluatorVersion,
        status: result.status,
        score: result.score,
        failureCategory: result.failureCategory,
        summary: result.summary,
        metricsJson: result.metricsJson,
      },
    }));
    evaluated += 1;
  }

  const proposals = await proposeImprovementsFromFailedExamples(userId, target);
  return { scanned: examples.length, evaluated, proposals: proposals.created, evaluations };
}

export async function proposeImprovementsFromFailedExamples(userId?: string, target: AgentQualityTarget = "APPLICATION_ASSISTANT") {
  const failed = await prisma.agentQualityEvaluation.findMany({
    where: {
      target,
      status: { in: ["FAILED", "NEEDS_REVIEW"] },
      failureCategory: { not: null },
      ...(userId ? { userId } : {}),
    },
    include: { example: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const groups = new Map<string, typeof failed>();
  for (const evaluation of failed) {
    const key = evaluation.failureCategory ?? "unknown";
    groups.set(key, [...(groups.get(key) ?? []), evaluation]);
  }

  let created = 0;
  for (const [category, items] of groups) {
    if (!items.length) continue;
    const ownerId = items[0]?.userId;
    if (!ownerId) continue;
    const existing = await prisma.agentImprovementProposal.findFirst({
      where: {
        userId: ownerId,
        target,
        status: "PROPOSED",
        metadataJson: { path: ["failureCategory"], equals: category },
      },
    });
    if (existing) continue;
    const affectedExampleIds = Array.from(new Set(items.map((item) => item.exampleId).filter(Boolean)));
    await prisma.agentImprovementProposal.create({
      data: {
        userId: ownerId,
        target,
        type: proposalTypeForCategory(category, target),
        status: "PROPOSED",
        riskLevel: "LOW",
        title: proposalTitleForCategory(category, target),
        summary: `Detected ${items.length} ${target.toLowerCase().replaceAll("_", " ")} quality issue(s) in category ${category}.`,
        rationale: proposalRationaleForCategory(category, target),
        affectedExampleIds: affectedExampleIds as Prisma.InputJsonValue,
        patchJson: proposalPatchForCategory(category, target),
        metadataJson: {
          failureCategory: category,
          evaluatorVersion: evaluatorVersionForTarget(target),
          exampleCount: affectedExampleIds.length,
        },
      },
    });
    created += 1;
  }
  return { created };
}

async function backfillRecruitingAgencyQualityExamples(userId?: string) {
  const runs = await prisma.agentRun.findMany({
    where: {
      agentType: "RECRUITING_AGENCY",
      ...(userId ? { userId } : {}),
      OR: [
        { status: "FAILED" },
        { currentNode: { in: ["stale_graph_run", "manual_cancel", "run_failed"] } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  let createdOrFound = 0;
  for (const run of runs) {
    const category = run.currentNode === "stale_graph_run"
      ? "stale_graph_run"
      : run.currentNode === "manual_cancel"
        ? "manual_cancel"
        : "agency_run_failure";
    const example = await createQualityExampleFromAgentRun(run.id, "RECRUITING_AGENCY", category);
    if (example) createdOrFound += 1;
  }
  return { scanned: runs.length, examples: createdOrFound };
}

async function backfillJobSearchQualityExamples(userId?: string) {
  const user = userId ? { id: userId } : await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!user?.id) return { scanned: 0, examples: 0 };
  const runs = await prisma.jobSearchRun.findMany({
    where: {
      OR: [
        { status: { in: ["failed", "partial"] } },
        { jobsFetched: { gt: 0 }, jobsSaved: 0 },
        { jobsFetched: { gt: 0 }, jobsAfterDedupe: { gt: 0 } },
      ],
    },
    orderBy: { startedAt: "desc" },
    take: 100,
  });
  let createdOrFound = 0;
  for (const run of runs) {
    const category = jobSearchFailureCategory(run);
    if (!category) continue;
    const example = await createQualityExample({
      userId: user.id,
      target: "JOB_SEARCH",
      source: "BACKFILL",
      title: `Search run ${run.startedAt.toISOString()}`,
      summary: jobSearchSummary(run, category),
      failureCategory: category,
      inputJson: {
        triggeredBy: run.triggeredBy,
        profileIds: run.profileIds,
      },
      expectedJson: { expectedBehavior: "Search should produce fresh, deduped, unsuppressed jobs worth reviewing." },
      actualJson: {
        status: run.status,
        jobsFetched: run.jobsFetched,
        jobsAfterDedupe: run.jobsAfterDedupe,
        jobsAfterFilters: run.jobsAfterFilters,
        jobsSaved: run.jobsSaved,
        errors: run.errors,
      },
      metadataJson: { sourceRunId: run.id, startedAt: run.startedAt },
    });
    if (example) createdOrFound += 1;
  }
  return { scanned: runs.length, examples: createdOrFound };
}

async function backfillJobMatchingQualityExamples(userId?: string) {
  const matches = await prisma.jobProfileMatch.findMany({
    where: {
      status: "rejected",
      overallScore: { gte: 85 },
      ...(userId ? { jobSearchProfile: { userId } } : {}),
    },
    include: {
      jobPosting: true,
      jobSearchProfile: { select: { userId: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  let createdOrFound = 0;
  for (const match of matches) {
    const example = await createQualityExample({
      userId: match.jobSearchProfile.userId,
      target: "JOB_MATCHING",
      source: "BACKFILL",
      title: `${match.jobPosting.company} - ${match.jobPosting.title}`,
      summary: `High-scoring match (${match.overallScore}) was rejected by the user.`,
      failureCategory: "high_score_user_rejected",
      inputJson: {
        matchId: match.id,
        profileName: match.jobSearchProfile.name,
        score: match.overallScore,
        recommendedAction: match.recommendedAction,
      },
      expectedJson: { expectedBehavior: "Rejected high-score patterns should reduce future confidence for similar jobs." },
      actualJson: {
        status: match.status,
        score: match.overallScore,
        concerns: match.concerns,
        missingKeywords: match.missingKeywords,
        explanationLength: match.aiExplanation.length,
      },
      metadataJson: { matchId: match.id, jobPostingId: match.jobPostingId, profileName: match.jobSearchProfile.name },
      jobPostingId: match.jobPostingId,
    });
    if (example) createdOrFound += 1;
  }
  return { scanned: matches.length, examples: createdOrFound };
}

async function backfillGeneratedMaterialsQualityExamples(userId?: string) {
  const claims = await prisma.materialClaim.findMany({
    where: {
      status: { in: ["UNSUPPORTED", "NEEDS_REVIEW"] },
      ...(userId ? { userId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  let createdOrFound = 0;
  for (const claim of claims) {
    const category = claim.status === "UNSUPPORTED" ? "unsupported_claim" : "claim_needs_review";
    const example = await createQualityExample({
      userId: claim.userId,
      target: "GENERATED_MATERIALS",
      source: "BACKFILL",
      title: `${claim.artifactType.toLowerCase().replaceAll("_", " ")} claim`,
      summary: claim.text,
      failureCategory: category,
      inputJson: {
        artifactType: claim.artifactType,
        artifactId: claim.artifactId,
        sourceEvidenceIds: claim.sourceEvidenceIds,
        sourceRefs: claim.sourceRefs,
      },
      expectedJson: {
        expectedBehavior: "Generated material claims should be supported by approved evidence before approval or publishing.",
      },
      actualJson: {
        status: claim.status,
        text: claim.text,
        reviewJson: claim.reviewJson,
      },
      metadataJson: { materialClaimId: claim.id, artifactType: claim.artifactType, artifactId: claim.artifactId },
    });
    if (example) createdOrFound += 1;
  }
  return { scanned: claims.length, examples: createdOrFound };
}

async function createQualityExample(input: {
  userId: string;
  target: AgentQualityTarget;
  source: AgentQualityExampleSource;
  title: string;
  summary: string;
  failureCategory: string;
  inputJson: unknown;
  expectedJson: unknown;
  actualJson: unknown;
  metadataJson: Record<string, unknown>;
  jobPostingId?: string | null;
}) {
  const existing = await prisma.agentQualityExample.findFirst({
    where: {
      userId: input.userId,
      target: input.target,
      source: input.source,
      failureCategory: input.failureCategory,
      ...(input.jobPostingId ? { jobPostingId: input.jobPostingId } : {}),
      ...(input.metadataJson.sourceRunId ? { metadataJson: { path: ["sourceRunId"], equals: input.metadataJson.sourceRunId } } : {}),
      ...(input.metadataJson.matchId ? { metadataJson: { path: ["matchId"], equals: input.metadataJson.matchId } } : {}),
      ...(input.metadataJson.materialClaimId ? { metadataJson: { path: ["materialClaimId"], equals: input.metadataJson.materialClaimId } } : {}),
    },
  });
  if (existing) return existing;
  const dataset = await ensureAgentQualityDataset(input.userId, input.target);
  return prisma.agentQualityExample.create({
    data: {
      userId: input.userId,
      datasetId: dataset.id,
      target: input.target,
      source: input.source,
      title: input.title,
      summary: input.summary,
      failureCategory: input.failureCategory,
      inputJson: sanitizeTraceInput(input.inputJson),
      expectedJson: sanitizeTraceInput(input.expectedJson),
      actualJson: sanitizeTraceInput(input.actualJson),
      metadataJson: sanitizeTraceInput(input.metadataJson),
      jobPostingId: input.jobPostingId,
    },
  });
}

export async function setImprovementProposalStatus(id: string, status: AgentImprovementProposalStatus) {
  return prisma.agentImprovementProposal.update({
    where: { id },
    data: {
      status,
      acceptedAt: status === "ACCEPTED" ? new Date() : undefined,
      dismissedAt: status === "DISMISSED" ? new Date() : undefined,
    },
  });
}

export async function acceptImprovementProposal(id: string): Promise<{ proposal: Awaited<ReturnType<typeof setImprovementProposalStatus>>; activation: ImprovementProposalActivation }> {
  const proposal = await prisma.agentImprovementProposal.findUnique({ where: { id } });
  if (!proposal) throw new Error("Improvement proposal not found.");

  const activationPlan = activationPlanForProposal(proposal);
  if (!activationPlan) {
    const activation = {
      status: "review_only" as const,
      reason: proposal.riskLevel === "LOW"
        ? "No safe skill-adjustment mapping exists for this proposal yet."
        : "High-risk proposals require human review and are not auto-applied.",
    };
    return {
      proposal: await updateAcceptedProposal(proposal.id, activation),
      activation,
    };
  }

  const existing = await prisma.skillAdjustment.findFirst({
    where: {
      userId: proposal.userId,
      skillId: activationPlan.skillId,
      patchJson: { path: ["proposalId"], equals: proposal.id },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    const activation = {
      status: "already_active" as const,
      adjustmentId: existing.id,
      skillId: activationPlan.skillId,
      kind: activationPlan.kind,
      reason: "A skill adjustment already exists for this accepted proposal.",
    };
    return {
      proposal: await updateAcceptedProposal(proposal.id, activation),
      activation,
    };
  }

  const adjustment = await prisma.skillAdjustment.create({
    data: {
      userId: proposal.userId,
      skillId: activationPlan.skillId,
      kind: activationPlan.kind,
      riskLevel: "LOW",
      status: "ACTIVE",
      patchJson: toJson({
        ...activationPlan.patchJson,
        source: "quality_proposal",
        proposalId: proposal.id,
        target: proposal.target,
        category: activationPlan.category,
      }),
      rationale: activationPlan.rationale,
      appliedAt: new Date(),
    },
  });

  const activation = {
    status: "created" as const,
    adjustmentId: adjustment.id,
    skillId: activationPlan.skillId,
    kind: activationPlan.kind,
    reason: "Accepted low-risk proposal activated as skill guidance.",
  };
  return {
    proposal: await updateAcceptedProposal(proposal.id, activation),
    activation,
  };
}

async function updateAcceptedProposal(id: string, activation: ImprovementProposalActivation) {
  const existing = await prisma.agentImprovementProposal.findUnique({ where: { id } });
  return prisma.agentImprovementProposal.update({
    where: { id },
    data: {
      status: "ACCEPTED",
      acceptedAt: new Date(),
      metadataJson: toJson({
        ...objectJson(existing?.metadataJson),
        activation,
      }),
    },
  });
}

function activationPlanForProposal(proposal: {
  target: AgentQualityTarget;
  type: string;
  riskLevel: string;
  title: string;
  rationale: string;
  patchJson: Prisma.JsonValue;
  metadataJson: Prisma.JsonValue;
}) {
  if (proposal.riskLevel !== "LOW") return null;
  if (proposal.type === "PROMPT") return null;

  const category = String(objectJson(proposal.metadataJson).failureCategory ?? objectJson(proposal.patchJson).category ?? "unknown");
  const basePatch = {
    guidance: `${proposal.title}: ${proposal.rationale}`,
    recommendedChange: proposal.title,
  };

  if (proposal.target === "JOB_MATCHING" && category === "high_score_user_rejected") {
    return {
      skillId: "job_fit_scorer" as SkillId,
      kind: "GUIDANCE" as SkillAdjustmentKind,
      category,
      patchJson: {
        ...basePatch,
        rule: "Treat repeated high-score user rejections as evidence that the scoring explanation, concern detection, and rejection-memory alignment need stricter review before promotion.",
      },
      rationale: "Activated conservative job-fit guidance from rejected high-score match quality examples.",
    };
  }

  if (proposal.target === "JOB_SEARCH" && category === "dedupe_ineffective") {
    return {
      skillId: "duplicate_stale_job_detector" as SkillId,
      kind: "GUIDANCE" as SkillAdjustmentKind,
      category,
      patchJson: {
        ...basePatch,
        rule: "Apply stricter duplicate and stale-job checks when search runs repeatedly keep nearly all fetched jobs after dedupe.",
      },
      rationale: "Activated conservative duplicate/stale-job guidance from noisy search quality examples.",
    };
  }

  if (proposal.target === "JOB_SEARCH" && category === "low_saved_yield") {
    return {
      skillId: "search_profile_manager" as SkillId,
      kind: "GUIDANCE" as SkillAdjustmentKind,
      category,
      patchJson: {
        ...basePatch,
        rule: "Review search query breadth, source quality, and profile specificity when repeated runs fetch jobs but save none.",
      },
      rationale: "Activated conservative search-profile guidance from low-yield search quality examples.",
    };
  }

  if (proposal.target === "JOB_SEARCH" && category === "market_search_adaptation") {
    return {
      skillId: "search_profile_manager" as SkillId,
      kind: "GUIDANCE" as SkillAdjustmentKind,
      category,
      patchJson: {
        ...basePatch,
        rule: "Use accepted market-intelligence adaptations as review guidance for profile specificity, lane focus, preferred keywords, and preferred companies. Do not pause, delete, narrow, or change thresholds automatically.",
      },
      rationale: "Activated conservative search-profile guidance from market intelligence review proposals.",
    };
  }

  if (proposal.target === "RECRUITING_AGENCY" && ["CANDIDATE_FAILURE", "candidate_failure"].includes(category)) {
    return {
      skillId: "approve_agency_match" as SkillId,
      kind: "GUIDANCE" as SkillAdjustmentKind,
      category,
      patchJson: {
        ...basePatch,
        rule: "Use repeated agency candidate failures as guidance to be more selective before approving jobs for the apply sprint.",
      },
      rationale: "Activated conservative recruiting-agency approval guidance from candidate quality examples.",
    };
  }

  if (proposal.target === "APPLICATION_ASSISTANT" && category === "cover_letter_field") {
    return {
      skillId: "application_qa" as SkillId,
      kind: "QA_CHECK" as SkillAdjustmentKind,
      category,
      patchJson: {
        ...basePatch,
        rule: "Require explicit QA attention to obvious cover-letter fields and why-you-want-to-join prompts.",
      },
      rationale: "Activated assistant QA guidance from repeated cover-letter field quality examples.",
    };
  }

  if (proposal.target === "APPLICATION_ASSISTANT" && category === "field_classification") {
    return {
      skillId: "application_qa" as SkillId,
      kind: "GUIDANCE" as SkillAdjustmentKind,
      category,
      patchJson: {
        ...basePatch,
        rule: "Normalize field labels more aggressively before deciding a field is unknown or should be skipped.",
      },
      rationale: "Activated assistant QA guidance from repeated field-classification quality examples.",
    };
  }

  return null;
}

function evaluateApplicationAssistantExample(example: {
  failureCategory: string | null;
  source: AgentQualityExampleSource;
  actualJson: Prisma.JsonValue;
}) {
  const actual = objectJson(example.actualJson);
  const status = String(actual.status ?? "");
  const category = example.failureCategory ?? failureCategoryFromText(JSON.stringify(actual));
  if (status === "SUBMITTED" && !category) {
    return {
      status: "PASSED" as AgentQualityEvaluationStatus,
      score: 95,
      failureCategory: null,
      summary: "Assistant state reached submitted without a captured failure category.",
      metricsJson: { submitStateAccuracy: 1 },
    };
  }
  if (category === "manual_submit_detection") {
    return {
      status: "NEEDS_REVIEW" as AgentQualityEvaluationStatus,
      score: 55,
      failureCategory: category,
      summary: "Manual submit or page-close handling required repair or user confirmation.",
      metricsJson: { submitStateAccuracy: 0, manualCorrection: 1 },
    };
  }
  if (category) {
    return {
      status: "FAILED" as AgentQualityEvaluationStatus,
      score: scoreForFailureCategory(category),
      failureCategory: category,
      summary: `Application assistant failed quality check: ${category}.`,
      metricsJson: { failureCategory: category, passed: 0 },
    };
  }
  return {
    status: "NEEDS_REVIEW" as AgentQualityEvaluationStatus,
    score: 70,
    failureCategory: "needs_review",
    summary: "Application assistant example needs manual review.",
    metricsJson: { passed: 0.5 },
  };
}

function evaluateQualityExample(target: AgentQualityTarget, example: {
  failureCategory: string | null;
  source: AgentQualityExampleSource;
  actualJson: Prisma.JsonValue;
}) {
  if (target === "APPLICATION_ASSISTANT") return evaluateApplicationAssistantExample(example);
  if (target === "RECRUITING_AGENCY") return evaluateRecruitingAgencyExample(example);
  if (target === "JOB_SEARCH") return evaluateJobSearchExample(example);
  if (target === "JOB_MATCHING") return evaluateJobMatchingExample(example);
  if (target === "GENERATED_MATERIALS") return evaluateGeneratedMaterialsExample(example);
  return {
    status: "NEEDS_REVIEW" as AgentQualityEvaluationStatus,
    score: 70,
    failureCategory: example.failureCategory ?? "needs_review",
    summary: `${target.toLowerCase().replaceAll("_", " ")} example needs manual review.`,
    metricsJson: { passed: 0.5 },
  };
}

function evaluateGeneratedMaterialsExample(example: { failureCategory: string | null; actualJson: Prisma.JsonValue }) {
  const actual = objectJson(example.actualJson);
  const status = String(actual.status ?? "");
  const category = example.failureCategory ?? (status === "UNSUPPORTED" ? "unsupported_claim" : "claim_needs_review");
  if (status === "UNSUPPORTED" || category === "unsupported_claim") {
    return {
      status: "FAILED" as AgentQualityEvaluationStatus,
      score: 25,
      failureCategory: "unsupported_claim",
      summary: "Generated material contains an unsupported claim that must block approval or publishing.",
      metricsJson: { claimSupport: 0, gateRequired: 1 },
    };
  }
  return {
    status: "NEEDS_REVIEW" as AgentQualityEvaluationStatus,
    score: 60,
    failureCategory: category,
    summary: "Generated material claim needs human review before it can be trusted for approval.",
    metricsJson: { claimSupport: 0.5, gateRequired: 1 },
  };
}

function evaluateRecruitingAgencyExample(example: { failureCategory: string | null; actualJson: Prisma.JsonValue }) {
  const category = example.failureCategory ?? "agency_run_issue";
  const actual = objectJson(example.actualJson);
  const workflow = objectJson(actual.workflowState);
  const resultCount = numberValue(workflow.resultCount);
  const candidateCount = numberValue(workflow.candidateCount);
  if (category === "manual_cancel") {
    return {
      status: "NEEDS_REVIEW" as AgentQualityEvaluationStatus,
      score: 60,
      failureCategory: category,
      summary: "Recruiting agency run was manually cancelled before completion.",
      metricsJson: { manualCancel: 1, resultCount, candidateCount },
    };
  }
  if (category === "stale_graph_run" || category === "retry_after_failure" || category === "resume_failed") {
    return {
      status: "FAILED" as AgentQualityEvaluationStatus,
      score: category === "stale_graph_run" ? 35 : 45,
      failureCategory: category,
      summary: `Recruiting agency workflow reliability issue: ${category}.`,
      metricsJson: { workflowReliability: 0, resultCount, candidateCount },
    };
  }
  return {
    status: "FAILED" as AgentQualityEvaluationStatus,
    score: 50,
    failureCategory: category,
    summary: `Recruiting agency example failed quality check: ${category}.`,
    metricsJson: { failureCategory: category, resultCount, candidateCount },
  };
}

function evaluateJobSearchExample(example: { failureCategory: string | null; actualJson: Prisma.JsonValue }) {
  const category = example.failureCategory ?? "search_quality_issue";
  const actual = objectJson(example.actualJson);
  const fetched = numberValue(actual.jobsFetched);
  const saved = numberValue(actual.jobsSaved);
  const afterDedupe = numberValue(actual.jobsAfterDedupe);
  if (category === "search_failed") {
    return {
      status: "FAILED" as AgentQualityEvaluationStatus,
      score: 25,
      failureCategory: category,
      summary: "Search run failed or completed partially with errors.",
      metricsJson: { fetched, saved, afterDedupe, runSuccess: 0 },
    };
  }
  if (category === "low_saved_yield") {
    return {
      status: "NEEDS_REVIEW" as AgentQualityEvaluationStatus,
      score: 55,
      failureCategory: category,
      summary: "Search fetched jobs but saved too few useful results.",
      metricsJson: { fetched, saved, savedYield: fetched ? saved / fetched : 0 },
    };
  }
  if (category === "dedupe_ineffective") {
    return {
      status: "FAILED" as AgentQualityEvaluationStatus,
      score: 45,
      failureCategory: category,
      summary: "Search run indicates duplicate filtering may be weak.",
      metricsJson: { fetched, afterDedupe, dedupeRatio: fetched ? afterDedupe / fetched : 0 },
    };
  }
  return {
    status: "NEEDS_REVIEW" as AgentQualityEvaluationStatus,
    score: 65,
    failureCategory: category,
    summary: `Job search example needs review: ${category}.`,
    metricsJson: { fetched, saved, afterDedupe },
  };
}

function evaluateJobMatchingExample(example: { failureCategory: string | null; actualJson: Prisma.JsonValue }) {
  const category = example.failureCategory ?? "matching_quality_issue";
  const actual = objectJson(example.actualJson);
  const score = numberValue(actual.score);
  if (category === "high_score_user_rejected") {
    return {
      status: score >= 90 ? "FAILED" as AgentQualityEvaluationStatus : "NEEDS_REVIEW" as AgentQualityEvaluationStatus,
      score: score >= 90 ? 35 : 55,
      failureCategory: category,
      summary: "A high-scoring job was rejected, indicating scoring or rejection-memory alignment needs review.",
      metricsJson: { rejectedScore: score, scoreRejectionAlignment: 0 },
    };
  }
  return {
    status: "NEEDS_REVIEW" as AgentQualityEvaluationStatus,
    score: 65,
    failureCategory: category,
    summary: `Job matching example needs review: ${category}.`,
    metricsJson: { rejectedScore: score },
  };
}

function isApplicationAssistantFeedback(skillId: string, contextJson: Prisma.JsonValue, applicationId?: string | null) {
  const text = JSON.stringify(contextJson).toLowerCase();
  return Boolean(applicationId || /application|assistant|autofill|field|submit|ashby|greenhouse|lever|workday/.test(text) || skillId === "application_qa");
}

function failureCategoryFromFeedback(summary: string, raw: string, automationStatus: unknown) {
  const text = `${summary} ${raw} ${String(automationStatus ?? "")}`.toLowerCase();
  if (/cover letter/.test(text)) return "cover_letter_field";
  if (/submit|submitted|applied|failed state|running state/.test(text)) return "manual_submit_detection";
  if (/field|autofill|filled/.test(text)) return "field_classification";
  if (/stale|closed|frame|detached|browser/.test(text)) return "browser_lifecycle";
  return "user_reported_mistake";
}

function failureCategoryFromAutomationRun(run: Pick<AutomationRunForQuality, "status" | "blockerType" | "blockerMessage" | "workflowStateJson">) {
  if (run.status === "FAILED") return run.blockerType === "assistant_error" ? "assistant_runtime_error" : "assistant_failed";
  if (run.status === "NEEDS_USER" && run.blockerType === "assistant_closed") return "browser_lifecycle";
  if (run.status === "NEEDS_USER") return run.blockerType ?? "needs_user";
  if (run.status === "SUBMITTED" && workflowEventTypes(run.workflowStateJson).includes("manual_submit_repaired")) return "manual_submit_detection";
  return null;
}

function failureCategoryFromText(text: string) {
  const normalized = text.toLowerCase();
  if (/cover letter/.test(normalized)) return "cover_letter_field";
  if (/submit|submitted|applied/.test(normalized)) return "manual_submit_detection";
  if (/frame|detached|browser|closed/.test(normalized)) return "browser_lifecycle";
  if (/field/.test(normalized)) return "field_classification";
  return null;
}

function summaryForAutomationRun(run: AutomationRunForQuality, category: string | null) {
  if (run.status === "SUBMITTED" && category === "manual_submit_detection") {
    return "Application was submitted, but assistant submit-state tracking required repair or confirmation.";
  }
  if (category) return run.blockerMessage ?? `Assistant run captured ${category}.`;
  return "Assistant run completed successfully.";
}

function expectedForAutomationRun(run: AutomationRunForQuality, category: string | null) {
  if (category === "manual_submit_detection") return { status: "SUBMITTED", shouldRequireRepair: false };
  if (run.status === "FAILED") return { status: "READY_TO_SUBMIT_OR_NEEDS_USER", shouldAvoidRuntimeFailure: true };
  if (run.status === "NEEDS_USER") return { status: "NEEDS_USER", shouldExposeClearBlocker: true };
  return { status: run.status };
}

function compactWorkflowState(value: Prisma.JsonValue) {
  const state = objectJson(value);
  const events = Array.isArray(state.events) ? state.events : [];
  return {
    status: state.status ?? null,
    currentNode: state.currentNode ?? null,
    blockerType: state.blockerType ?? null,
    eventTypes: events.map((event) => objectJson(event).type).filter(Boolean).slice(-20),
    fieldCount: Array.isArray(state.fields) ? state.fields.length : 0,
  };
}

function compactAgentRunWorkflowState(value: Prisma.JsonValue) {
  const state = objectJson(value);
  return {
    currentNode: state.currentNode ?? null,
    candidateCount: Array.isArray(state.candidates) ? state.candidates.length : 0,
    resultCount: Array.isArray(state.results) ? state.results.length : 0,
    hasOutput: Boolean(state.output),
    error: state.error ?? null,
  };
}

function workflowEventTypes(value: Prisma.JsonValue) {
  const state = objectJson(value);
  const events = Array.isArray(state.events) ? state.events : [];
  return events.map((event) => String(objectJson(event).type ?? "")).filter(Boolean);
}

function scoreForFailureCategory(category: string) {
  if (category === "assistant_runtime_error") return 25;
  if (category === "browser_lifecycle") return 45;
  if (category === "cover_letter_field") return 35;
  if (category === "manual_submit_detection") return 55;
  return 50;
}

function proposalTypeForCategory(category: string, target: AgentQualityTarget = "APPLICATION_ASSISTANT") {
  if (target === "RECRUITING_AGENCY") return "WORKFLOW";
  if (target === "JOB_SEARCH" || target === "JOB_MATCHING") return category.includes("score") || category.includes("rejected") ? "CLASSIFIER" : "WORKFLOW";
  if (target === "GENERATED_MATERIALS") return "SKILL";
  if (category === "field_classification" || category === "cover_letter_field") return "CLASSIFIER";
  if (category === "browser_lifecycle" || category === "manual_submit_detection") return "WORKFLOW";
  return "SKILL";
}

function proposalTitleForCategory(category: string, target: AgentQualityTarget = "APPLICATION_ASSISTANT") {
  if (target === "RECRUITING_AGENCY") {
    if (category === "stale_graph_run") return "Improve recruiting agency stale-run recovery";
    if (category === "manual_cancel") return "Review cancelled recruiting agency runs";
    if (category === "retry_after_failure" || category === "resume_failed") return "Improve recruiting agency retry reliability";
    return "Review recruiting agency candidate failures";
  }
  if (target === "JOB_SEARCH") {
    if (category === "low_saved_yield") return "Improve search source quality";
    if (category === "dedupe_ineffective") return "Tighten search dedupe and suppression";
    if (category === "search_failed") return "Harden job search run reliability";
    return "Review repeated job search issue";
  }
  if (target === "JOB_MATCHING") {
    if (category === "high_score_user_rejected") return "Tighten scoring for rejected high-score jobs";
    return "Review repeated job matching issue";
  }
  if (target === "GENERATED_MATERIALS") {
    if (category === "unsupported_claim") return "Strengthen generated-material claim grounding";
    return "Review generated-material claim evidence";
  }
  if (category === "cover_letter_field") return "Improve cover-letter field handling";
  if (category === "manual_submit_detection") return "Improve manual submit detection";
  if (category === "browser_lifecycle") return "Harden browser lifecycle handling";
  if (category === "field_classification") return "Improve assistant field classification";
  return "Review repeated assistant quality issue";
}

function proposalRationaleForCategory(category: string, target: AgentQualityTarget = "APPLICATION_ASSISTANT") {
  if (target === "RECRUITING_AGENCY") return "Repeated agency examples indicate the approval workflow or packet preparation path should be reviewed before changing automation behavior.";
  if (target === "JOB_SEARCH") return "Repeated search examples indicate source quality, dedupe, suppression, or result freshness should be reviewed before changing search policy.";
  if (target === "JOB_MATCHING") return "Repeated matching examples indicate scoring weights or rejection-memory alignment should be reviewed before changing ranking behavior.";
  if (target === "GENERATED_MATERIALS") return "Generated material examples indicate claim provenance, evidence selection, or application QA gates should be reviewed before approval behavior changes.";
  if (category === "cover_letter_field") return "Repeated examples indicate the assistant may miss obvious cover-letter text fields.";
  if (category === "manual_submit_detection") return "Repeated examples indicate submitted applications may require state repair or better submit intent tracking.";
  if (category === "browser_lifecycle") return "Repeated examples indicate browser close/frame detach events should be treated as recoverable workflow states when safe.";
  if (category === "field_classification") return "Repeated examples indicate field labels/categories need stronger normalization.";
  return "Repeated assistant examples should be reviewed before applying behavior changes.";
}

function proposalPatchForCategory(category: string, target: AgentQualityTarget = "APPLICATION_ASSISTANT"): Prisma.InputJsonValue {
  return {
    category,
    target,
    policy: "proposal_only",
    recommendedChange: proposalTitleForCategory(category, target),
  };
}

function supportedTargets(target?: AgentQualityTarget) {
  if (!target) return [...SUPPORTED_EVALUATION_TARGETS];
  if ((SUPPORTED_EVALUATION_TARGETS as readonly AgentQualityTarget[]).includes(target)) return [target as typeof SUPPORTED_EVALUATION_TARGETS[number]];
  throw new Error(`Quality target ${target} is not supported by the deterministic evaluator yet.`);
}

function evaluatorVersionForTarget(target: AgentQualityTarget) {
  return (EVALUATOR_VERSIONS as Partial<Record<AgentQualityTarget, string>>)[target] ?? `${target.toLowerCase()}-quality-v1`;
}

function summarizeBackfillResults(results: Array<{ target: AgentQualityTarget; scanned: number; examples: number }>) {
  return {
    scanned: results.reduce((sum, item) => sum + item.scanned, 0),
    examples: results.reduce((sum, item) => sum + item.examples, 0),
    targets: results,
  };
}

function jobSearchFailureCategory(run: { status: string; jobsFetched: number; jobsAfterDedupe: number; jobsSaved: number; errors: Prisma.JsonValue }) {
  const errors = Array.isArray(run.errors) ? run.errors : [];
  if (run.status === "failed" || run.status === "partial" || errors.length > 0) return "search_failed";
  if (run.jobsFetched >= 10 && run.jobsSaved === 0) return "low_saved_yield";
  if (run.jobsFetched >= 10 && run.jobsAfterDedupe / Math.max(run.jobsFetched, 1) > 0.9) return "dedupe_ineffective";
  return null;
}

function jobSearchSummary(run: { jobsFetched: number; jobsAfterDedupe: number; jobsSaved: number }, category: string) {
  if (category === "search_failed") return "Job search run failed or returned errors.";
  if (category === "low_saved_yield") return `Job search fetched ${run.jobsFetched} jobs but saved none.`;
  if (category === "dedupe_ineffective") return `Job search dedupe kept ${run.jobsAfterDedupe} of ${run.jobsFetched} fetched jobs.`;
  return "Job search run needs quality review.";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function objectJson(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
