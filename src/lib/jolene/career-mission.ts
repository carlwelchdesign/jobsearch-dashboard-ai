import type { CareerMission, Prisma, SalaryCurrency } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CareerMissionInput = {
  targetCompensationMin?: number | null;
  targetCompensationIdeal?: number | null;
  currency?: SalaryCurrency;
  horizonDays?: number;
  urgencyMode?: string;
  tradeoffPolicy?: string;
  roleTracks?: string[];
  dealbreakers?: string[];
  acceptableFallbacks?: string[];
  dailyCapacityMinutes?: number | null;
  energyNotes?: string | null;
  tonePreferences?: Record<string, unknown>;
};

export type CareerMissionSnapshot = ReturnType<typeof serializeCareerMission>;

const DEFAULT_ROLE_TRACKS = [
  "AI product engineer",
  "Staff frontend engineer",
  "Full-stack product engineer",
  "Developer tools engineer",
  "Internal tools and agentic workflow engineer",
];

const DEFAULT_FALLBACKS = ["contract", "fractional", "founding engineer", "senior full-stack role with strong compensation"];

export async function getOrCreateCareerMission(userId: string) {
  const existing = await prisma.careerMission.findUnique({ where: { userId } });
  if (existing) return existing;

  const strongestProfile = await prisma.jobSearchProfile.findFirst({
    where: { userId, salaryMin: { not: null } },
    orderBy: [{ salaryMin: "desc" }, { updatedAt: "desc" }],
  });

  return prisma.careerMission.create({
    data: {
      userId,
      targetCompensationMin: strongestProfile?.salaryMin ?? 180000,
      targetCompensationIdeal: strongestProfile?.salaryMax ?? Math.max((strongestProfile?.salaryMin ?? 180000) + 40000, 220000),
      currency: strongestProfile?.salaryCurrency ?? "USD",
      horizonDays: 30,
      urgencyMode: "HIGH_INCOME_SPRINT",
      tradeoffPolicy: "AGGRESSIVE_BUT_TRUTHFUL",
      roleTracks: DEFAULT_ROLE_TRACKS,
      acceptableFallbacks: DEFAULT_FALLBACKS,
      dealbreakers: ["unsupported claims", "unpaid work", "external submissions without review"],
      tonePreferences: {
        directness: "high",
        pressure: "firm",
        reassurance: "brief",
      },
    },
  });
}

export async function updateCareerMission(userId: string, input: CareerMissionInput) {
  await getOrCreateCareerMission(userId);
  return prisma.careerMission.update({
    where: { userId },
    data: {
      ...(input.targetCompensationMin !== undefined ? { targetCompensationMin: input.targetCompensationMin } : {}),
      ...(input.targetCompensationIdeal !== undefined ? { targetCompensationIdeal: input.targetCompensationIdeal } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.horizonDays !== undefined ? { horizonDays: clampInt(input.horizonDays, 7, 180) } : {}),
      ...(input.urgencyMode ? { urgencyMode: input.urgencyMode } : {}),
      ...(input.tradeoffPolicy ? { tradeoffPolicy: input.tradeoffPolicy } : {}),
      ...(input.roleTracks ? { roleTracks: input.roleTracks } : {}),
      ...(input.dealbreakers ? { dealbreakers: input.dealbreakers } : {}),
      ...(input.acceptableFallbacks ? { acceptableFallbacks: input.acceptableFallbacks } : {}),
      ...(input.dailyCapacityMinutes !== undefined ? { dailyCapacityMinutes: input.dailyCapacityMinutes } : {}),
      ...(input.energyNotes !== undefined ? { energyNotes: input.energyNotes } : {}),
      ...(input.tonePreferences ? { tonePreferences: input.tonePreferences as Prisma.InputJsonValue } : {}),
    },
  });
}

export function serializeCareerMission(mission: CareerMission) {
  return {
    id: mission.id,
    targetCompensationMin: mission.targetCompensationMin,
    targetCompensationIdeal: mission.targetCompensationIdeal,
    currency: mission.currency,
    horizonDays: mission.horizonDays,
    urgencyMode: mission.urgencyMode,
    tradeoffPolicy: mission.tradeoffPolicy,
    roleTracks: stringArray(mission.roleTracks),
    dealbreakers: stringArray(mission.dealbreakers),
    acceptableFallbacks: stringArray(mission.acceptableFallbacks),
    dailyCapacityMinutes: mission.dailyCapacityMinutes,
    energyNotes: mission.energyNotes,
    tonePreferences: objectJson(mission.tonePreferences),
    updatedAt: mission.updatedAt.toISOString(),
  };
}

export function careerMissionSummary(mission: CareerMissionSnapshot) {
  const target = mission.targetCompensationMin
    ? `${mission.currency} ${mission.targetCompensationMin.toLocaleString()} minimum${mission.targetCompensationIdeal ? `, ${mission.targetCompensationIdeal.toLocaleString()} ideal` : ""}`
    : "compensation target not set";
  return `${mission.horizonDays}-day ${mission.urgencyMode.toLowerCase().replace(/_/g, " ")} with ${mission.tradeoffPolicy.toLowerCase().replace(/_/g, " ")} policy; ${target}.`;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function objectJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}
