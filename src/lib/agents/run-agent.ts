import type { AgentRun, AgentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type RunAgentInput<TInput, TOutput> = {
  agentType: AgentType;
  input: TInput;
  userId?: string | null;
  execute: (run: AgentRun) => Promise<TOutput>;
};

export type AgentResult<TOutput> = {
  run: AgentRun;
  output: TOutput;
};

export async function runAgent<TInput, TOutput>({ agentType, input, userId, execute }: RunAgentInput<TInput, TOutput>): Promise<AgentResult<TOutput>> {
  const run = await prisma.agentRun.create({
    data: {
      agentType,
      userId: userId ?? undefined,
      inputJson: toJsonValue(input),
      status: "RUNNING",
    },
  });

  try {
    const output = await execute(run);
    const completed = await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        outputJson: toJsonValue(output),
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
      },
    });
    throw error;
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
