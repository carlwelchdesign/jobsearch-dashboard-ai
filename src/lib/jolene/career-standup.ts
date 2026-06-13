import type { CareerSprintSnapshot, Prisma } from "@prisma/client";
import { buildCareerCeoBrief, type CareerCeoBrief } from "@/lib/jolene/career-ceo";
import { prisma } from "@/lib/prisma";

export type MoneyMoveStatus = "new" | "active" | "stale" | "completed" | "superseded";
export type IncomeMomentum = "improving" | "flat" | "regressing" | "insufficient_data";

export type CareerStandup = {
  generatedAt: string;
  brief: CareerCeoBrief;
  sprintScore: number;
  incomeMomentum: IncomeMomentum;
  attentionDebt: number;
  moneyMoveStatus: Array<CareerCeoBrief["moneyMoves"][number] & {
    key: string;
    status: MoneyMoveStatus;
    previousStatus?: MoneyMoveStatus;
    createdAt: string;
  }>;
  completedMoveKeys: string[];
  proactivePromptReason: string | null;
  delta: {
    sprintScoreChange: number | null;
    attentionDebtChange: number | null;
    newMoveCount: number;
    completedMoveCount: number;
  };
  snapshotId?: string;
};

export async function buildCareerStandup(userId: string, options: { persist?: boolean } = {}): Promise<CareerStandup> {
  const [brief, previous] = await Promise.all([
    buildCareerCeoBrief(userId),
    prisma.careerSprintSnapshot.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);
  const previousMoves = previous ? parseMoneyMoves(previous.moneyMovesJson) : [];
  const previousByKey = new Map(previousMoves.map((move) => [move.key, move]));
  const currentKeys = new Set(brief.moneyMoves.map(moneyMoveKey));
  const completedMoveKeys = previousMoves.filter((move) => !currentKeys.has(move.key) && move.status !== "completed").map((move) => move.key);
  const moneyMoveStatus = brief.moneyMoves.map((move) => {
    const key = moneyMoveKey(move);
    const previousMove = previousByKey.get(key);
    const status = statusForMove(move, previousMove, brief.generatedAt);
    return {
      ...move,
      key,
      status,
      previousStatus: previousMove?.status,
      createdAt: previousMove?.createdAt ?? brief.generatedAt,
    };
  });
  const attentionDebt = moneyMoveStatus.filter((move) => move.status === "stale").length + brief.pipelineLeverage.openBlockers;
  const sprintScore = scoreSprint(brief, attentionDebt);
  const incomeMomentum = momentumFor(previous, sprintScore, attentionDebt);
  const standup: CareerStandup = {
    generatedAt: new Date().toISOString(),
    brief,
    sprintScore,
    incomeMomentum,
    attentionDebt,
    moneyMoveStatus,
    completedMoveKeys,
    proactivePromptReason: promptReason({ moneyMoveStatus, brief, incomeMomentum, attentionDebt }),
    delta: {
      sprintScoreChange: previous ? sprintScore - previous.sprintScore : null,
      attentionDebtChange: previous ? attentionDebt - previous.attentionDebt : null,
      newMoveCount: moneyMoveStatus.filter((move) => move.status === "new").length,
      completedMoveCount: completedMoveKeys.length,
    },
  };

  if (!options.persist) return standup;

  const snapshot = await prisma.careerSprintSnapshot.create({
    data: {
      userId,
      missionJson: toJsonInput(brief.mission),
      briefJson: toJsonInput(brief),
      moneyMovesJson: toJsonInput(moneyMoveStatus),
      sprintScore,
      incomeMomentum,
      attentionDebt,
      completedMoveKeys: toJsonInput(completedMoveKeys),
    },
  });
  return { ...standup, snapshotId: snapshot.id };
}

export async function getLatestCareerStandup(userId: string) {
  const snapshot = await prisma.careerSprintSnapshot.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  return snapshot ? serializeSnapshot(snapshot) : null;
}

export function formatCareerStandup(standup: CareerStandup) {
  return [
    `Jolene standup: sprint score ${standup.sprintScore}/100, income momentum ${standup.incomeMomentum}, attention debt ${standup.attentionDebt}.`,
    standup.proactivePromptReason ? `I noticed: ${standup.proactivePromptReason}` : "No urgent negative delta is showing in the sprint loop.",
    `Top money move: ${standup.moneyMoveStatus[0]?.title ?? "Run a high-income search refresh"}${standup.moneyMoveStatus[0]?.href ? ` (${standup.moneyMoveStatus[0].href})` : ""}.`,
    standup.brief.incomeRisks.length ? `Income risks: ${standup.brief.incomeRisks.join(" ")}` : "Income risks: no major compensation blockers found in the current sprint queue.",
  ].join("\n\n");
}

function statusForMove(
  move: CareerCeoBrief["moneyMoves"][number],
  previous: { status: MoneyMoveStatus; createdAt?: string } | undefined,
  generatedAt: string,
): MoneyMoveStatus {
  if (!previous) return "new";
  if (previous.status === "stale") return "stale";
  const ageMs = Date.parse(generatedAt) - Date.parse(previous.createdAt ?? generatedAt);
  if (ageMs > urgencyWindowMs(move.category)) return "stale";
  return "active";
}

function scoreSprint(brief: CareerCeoBrief, attentionDebt: number) {
  let score = 45;
  score += Math.min(20, brief.pipelineLeverage.readyApplications * 5);
  score += Math.min(15, brief.pipelineLeverage.highScoreJobs * 3);
  score += brief.moneyMoves.some((move) => move.category === "prepare_interview") ? 15 : 0;
  score += brief.confidence === "high" ? 10 : brief.confidence === "medium" ? 5 : 0;
  score -= Math.min(25, attentionDebt * 4);
  score -= Math.min(10, brief.pipelineLeverage.unknownSalaryApplications * 2);
  score -= Math.min(10, brief.pipelineLeverage.belowTargetApplications * 4);
  return Math.max(0, Math.min(100, score));
}

function momentumFor(previous: CareerSprintSnapshot | null, sprintScore: number, attentionDebt: number): IncomeMomentum {
  if (!previous) return "insufficient_data";
  if (sprintScore >= previous.sprintScore + 8 && attentionDebt <= previous.attentionDebt) return "improving";
  if (sprintScore <= previous.sprintScore - 8 || attentionDebt > previous.attentionDebt + 1) return "regressing";
  return "flat";
}

function promptReason(input: {
  moneyMoveStatus: Array<{ status: MoneyMoveStatus; title: string }>;
  brief: CareerCeoBrief;
  incomeMomentum: IncomeMomentum;
  attentionDebt: number;
}) {
  const stale = input.moneyMoveStatus.find((move) => move.status === "stale");
  if (stale) return `${stale.title} is aging and should be handled before lower-leverage work.`;
  if (input.incomeMomentum === "regressing") return "Income momentum is regressing compared with the last sprint snapshot.";
  if (input.brief.pipelineLeverage.openBlockers) return `${input.brief.pipelineLeverage.openBlockers} blocker(s) are slowing the sprint.`;
  if (input.attentionDebt > 0) return "Attention debt is accumulating across money moves and blockers.";
  return null;
}

function moneyMoveKey(move: CareerCeoBrief["moneyMoves"][number]) {
  return `${move.category}:${move.href}:${move.title.toLowerCase().replace(/\s+/g, "-").slice(0, 80)}`;
}

function urgencyWindowMs(category: CareerCeoBrief["moneyMoves"][number]["category"]) {
  if (category === "prepare_interview" || category === "respond") return 12 * 60 * 60 * 1000;
  if (category === "submit" || category === "follow_up") return 24 * 60 * 60 * 1000;
  return 48 * 60 * 60 * 1000;
}

function parseMoneyMoves(value: unknown): Array<{ key: string; status: MoneyMoveStatus; createdAt?: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const move = item as Record<string, unknown>;
    if (typeof move.key !== "string") return [];
    const status = typeof move.status === "string" && ["new", "active", "stale", "completed", "superseded"].includes(move.status)
      ? move.status as MoneyMoveStatus
      : "active";
    return [{ key: move.key, status, createdAt: typeof move.createdAt === "string" ? move.createdAt : undefined }];
  });
}

function serializeSnapshot(snapshot: CareerSprintSnapshot) {
  return {
    id: snapshot.id,
    userId: snapshot.userId,
    mission: snapshot.missionJson,
    brief: snapshot.briefJson,
    moneyMoves: snapshot.moneyMovesJson,
    sprintScore: snapshot.sprintScore,
    incomeMomentum: snapshot.incomeMomentum,
    attentionDebt: snapshot.attentionDebt,
    completedMoveKeys: snapshot.completedMoveKeys,
    createdAt: snapshot.createdAt.toISOString(),
  };
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
