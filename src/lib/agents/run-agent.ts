import type { AgentRun, AgentType, Prisma } from "@prisma/client";
import { adkObservabilityMetadata, agentRuntimeSource } from "@/lib/adk/registry";
import { runWithAdkControlPlane } from "@/lib/adk/runtime";
import { langSmithTraceMetadata, sanitizeTraceInput, sanitizeTraceOutput, traceAgentOperation } from "@/lib/observability/langsmith";
import { prisma } from "@/lib/prisma";

type RunAgentInput<TInput, TOutput> = {
  agentType: AgentType;
  input: TInput;
  userId?: string | null;
  parentRunId?: string | null;
  execute: (run: AgentRun) => Promise<TOutput>;
};

export type AgentResult<TOutput> = {
  run: AgentRun;
  output: TOutput;
};

export async function runAgent<TInput, TOutput>({ agentType, input, userId, parentRunId, execute }: RunAgentInput<TInput, TOutput>): Promise<AgentResult<TOutput>> {
  const adkMetadata = adkObservabilityMetadata(agentType);
  const run = await prisma.agentRun.create({
    data: {
      agentType,
      userId: userId ?? undefined,
      parentRunId: parentRunId ?? undefined,
      inputJson: toJsonValue(input),
      observabilityJson: {
        ...(langSmithTraceMetadata() as Record<string, unknown>),
        runtime: adkMetadata ? "adk" : "service",
        ...(adkMetadata ? { adk: adkMetadata } : {}),
      } as Prisma.InputJsonValue,
      status: "RUNNING",
    },
  });

  try {
    const output = await traceAgentOperation(
      `agent.${agentType}`,
      {
        agentRunId: run.id,
        agentType,
        userId: userId ?? null,
        input: sanitizeTraceInput(input),
      },
      () => runWithAdkControlPlane({ run, execute: () => execute(run) }),
    );
    const completed = await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        outputJson: toJsonValue(output),
        observabilityJson: {
          ...(langSmithTraceMetadata() as Record<string, unknown>),
          runtime: agentRuntimeSource(agentType),
          ...(adkMetadata ? { adk: adkMetadata } : {}),
          lastOutput: sanitizeTraceOutput(output),
        } as Prisma.InputJsonValue,
        status: "COMPLETED",
      },
    });

    return { run: completed, output };
  } catch (error) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown agent failure",
        observabilityJson: {
          ...(langSmithTraceMetadata() as Record<string, unknown>),
          runtime: agentRuntimeSource(agentType),
          ...(adkMetadata ? { adk: adkMetadata } : {}),
          error: error instanceof Error ? error.message : "Unknown agent failure",
        } as Prisma.InputJsonValue,
      },
    });
    throw error;
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
