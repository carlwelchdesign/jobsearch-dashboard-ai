import type { Prisma, SkillAdjustment } from "@prisma/client";

export function applyNumericThresholdAdjustments<TInput extends Record<string, unknown>>(
  input: TInput,
  adjustments: SkillAdjustment[],
  key: keyof TInput,
  bounds: { min: number; max: number; maxDelta: number },
) {
  const current = typeof input[key] === "number" ? Number(input[key]) : undefined;
  if (current === undefined) return input;

  let next = current;
  for (const adjustment of adjustments) {
    if (adjustment.kind !== "THRESHOLD") continue;
    const patch = objectValue(adjustment.patchJson);
    if (patch.field !== key || typeof patch.value !== "number") continue;
    if (Math.abs(patch.value - current) > bounds.maxDelta) continue;
    next = Math.min(bounds.max, Math.max(bounds.min, patch.value));
  }

  return { ...input, [key]: next };
}

export function objectValue(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
