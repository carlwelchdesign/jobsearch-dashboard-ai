import { prisma } from "@/lib/prisma";
import { skillRegistry } from "@/lib/skills/registry";
import type { SkillDefinition, SkillId, SkillRunResult } from "@/lib/skills/types";

export type RunSkillInput<TInput> = {
  skillId: SkillId;
  input: TInput;
  userId?: string | null;
};

export async function runSkill<TInput, TOutput>({ skillId, input, userId }: RunSkillInput<TInput>): Promise<SkillRunResult<TOutput>> {
  const skill = skillRegistry[skillId] as SkillDefinition;
  if (!skill) throw new Error(`Unknown skill: ${skillId}`);

  const parsed = skill.inputSchema.parse(input);
  const adjustments = userId
    ? await prisma.skillAdjustment.findMany({
        where: { userId, skillId, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const adjustedInput = skill.applyAdjustments ? skill.applyAdjustments(parsed, adjustments) : parsed;
  const output = await skill.execute(adjustedInput, { userId, adjustments });
  const parsedOutput = skill.outputSchema.parse(output);

  return {
    skill: {
      id: skill.id,
      label: skill.label,
      agentType: skill.agentType,
      riskLevel: skill.riskLevel,
    },
    output: parsedOutput as TOutput,
    appliedAdjustments: adjustments.map((adjustment) => ({
      id: adjustment.id,
      kind: adjustment.kind,
      rationale: adjustment.rationale,
      patchJson: adjustment.patchJson,
    })),
  };
}
