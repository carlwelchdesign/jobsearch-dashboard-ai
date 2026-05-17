import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import type { AgentQualityTarget, Prisma } from "@prisma/client";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const targetSchema = z.enum(["APPLICATION_ASSISTANT", "RECRUITING_AGENCY", "JOB_SEARCH", "JOB_MATCHING"]).optional();
const supportedTargets: AgentQualityTarget[] = ["APPLICATION_ASSISTANT", "RECRUITING_AGENCY", "JOB_SEARCH", "JOB_MATCHING"];

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const target = targetSchema.parse(url.searchParams.get("target") ?? undefined);
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    const where = {
      ...(user ? { userId: user.id } : {}),
      ...(target ? { target } : { target: { in: supportedTargets } }),
    } satisfies Prisma.AgentQualityExampleWhereInput;
    const [datasets, examples, evaluations, proposals] = await Promise.all([
      prisma.agentQualityDataset.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      prisma.agentQualityExample.findMany({
        where,
        include: {
          evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
          application: { include: { jobPosting: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.agentQualityEvaluation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 80,
      }),
      prisma.agentImprovementProposal.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 50,
      }),
    ]);
    const failed = evaluations.filter((evaluation) => evaluation.status === "FAILED").length;
    const needsReview = evaluations.filter((evaluation) => evaluation.status === "NEEDS_REVIEW").length;
    const passed = evaluations.filter((evaluation) => evaluation.status === "PASSED").length;
    const averageScore = evaluations.length
      ? Math.round(evaluations.reduce((sum, evaluation) => sum + evaluation.score, 0) / evaluations.length)
      : null;
    const byTarget = ["APPLICATION_ASSISTANT", "RECRUITING_AGENCY", "JOB_SEARCH", "JOB_MATCHING"].map((item) => ({
      target: item,
      examples: examples.filter((example) => example.target === item).length,
      evaluations: evaluations.filter((evaluation) => evaluation.target === item).length,
      proposals: proposals.filter((proposal) => proposal.target === item).length,
      failed: evaluations.filter((evaluation) => evaluation.target === item && evaluation.status === "FAILED").length,
    })).filter((item) => item.examples || item.evaluations || item.proposals);
    return Response.json({
      datasets,
      examples,
      evaluations,
      proposals,
      summary: {
        examples: examples.length,
        evaluations: evaluations.length,
        passed,
        failed,
        needsReview,
        averageScore,
        proposedImprovements: proposals.filter((proposal) => proposal.status === "PROPOSED").length,
        byTarget,
      },
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
