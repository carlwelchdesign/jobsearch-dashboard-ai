import type { SkillAdjustment } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function activeApplicationMaterialGuidance(userId: string) {
  const adjustments = await prisma.skillAdjustment.findMany({
    where: {
      userId,
      status: "ACTIVE",
      skillId: { in: ["cover_letter_writer", "prepare_application_packet", "anti_generic_writing"] },
      kind: { in: ["GUIDANCE", "STYLE_RULE"] },
    },
    orderBy: { appliedAt: "desc" },
    take: 12,
  });

  return adjustments.flatMap(guidanceFromAdjustment).slice(0, 8);
}

function guidanceFromAdjustment(adjustment: Pick<SkillAdjustment, "patchJson" | "rationale">) {
  const patch = adjustment.patchJson && typeof adjustment.patchJson === "object" && !Array.isArray(adjustment.patchJson)
    ? adjustment.patchJson as Record<string, unknown>
    : {};
  const guidance = typeof patch.guidance === "string" ? patch.guidance.trim() : "";
  const instruction = typeof patch.instruction === "string" ? patch.instruction.trim() : "";
  return [guidance, instruction, adjustment.rationale].filter((item): item is string => Boolean(item?.trim()));
}
