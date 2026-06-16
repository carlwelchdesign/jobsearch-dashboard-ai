import { assertActionPolicyAllowed, type ActionApproval, type AgentActionPolicyKind } from "@/lib/agents/action-policy";
import { prisma } from "@/lib/prisma";
import { skillRegistry } from "@/lib/skills/registry";
import type { SkillDefinition, SkillId, SkillRunResult } from "@/lib/skills/types";

export type RunSkillInput<TInput> = {
  skillId: SkillId;
  input: TInput;
  userId?: string | null;
  approval?: ActionApproval | null;
};

export async function runSkill<TInput, TOutput>({ skillId, input, userId, approval }: RunSkillInput<TInput>): Promise<SkillRunResult<TOutput>> {
  const skill = skillRegistry[skillId] as SkillDefinition;
  if (!skill) throw new Error(`Unknown skill: ${skillId}`);

  const policyKind = actionPolicyKindForSkill(skill);
  const policy = assertActionPolicyAllowed({ kind: policyKind, approval });
  const parsed = skill.inputSchema.parse(input);
  const adjustments = userId
    ? await prisma.skillAdjustment.findMany({
        where: { userId, skillId, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const adjustedInput = skill.applyAdjustments ? skill.applyAdjustments(parsed, adjustments) : parsed;
  const output = await skill.execute(adjustedInput, { userId, adjustments, approval });
  const parsedOutput = skill.outputSchema.parse(output);

  return {
    skill: {
      id: skill.id,
      label: skill.label,
      agentType: skill.agentType,
      riskLevel: skill.riskLevel,
    },
    output: parsedOutput as TOutput,
    policy: {
      kind: policy.kind,
      requiresApproval: policy.requiresApproval,
      approvedBy: approval?.approved ? approval.source : undefined,
    },
    appliedAdjustments: adjustments.map((adjustment) => ({
      id: adjustment.id,
      kind: adjustment.kind,
      rationale: adjustment.rationale,
      patchJson: adjustment.patchJson,
    })),
  };
}

function actionPolicyKindForSkill(skill: SkillDefinition): AgentActionPolicyKind {
  if (skill.defaultPolicy.externalAction === "manual_submit_required") return "guarded_mutation";
  if (skill.riskLevel === "HIGH") return "guarded_mutation";
  if (skill.defaultPolicy.externalAction === "draft_only") return "proposal";
  if (skill.defaultPolicy.mutatesLocalData) return "safe_internal";
  return "read_only";
}
