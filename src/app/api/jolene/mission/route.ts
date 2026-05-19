import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getOrCreateCareerMission, serializeCareerMission, updateCareerMission } from "@/lib/jolene/career-mission";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const missionSchema = z.object({
  targetCompensationMin: z.number().int().positive().nullable().optional(),
  targetCompensationIdeal: z.number().int().positive().nullable().optional(),
  currency: z.enum(["USD", "EUR", "GBP", "SEK"]).optional(),
  horizonDays: z.number().int().min(7).max(180).optional(),
  urgencyMode: z.string().trim().min(1).max(80).optional(),
  tradeoffPolicy: z.string().trim().min(1).max(80).optional(),
  roleTracks: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  dealbreakers: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
  acceptableFallbacks: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
  dailyCapacityMinutes: z.number().int().min(0).max(720).nullable().optional(),
  energyNotes: z.string().trim().max(1000).nullable().optional(),
  tonePreferences: z.record(z.unknown()).optional(),
});

export async function GET() {
  try {
    const user = await getUser();
    const mission = await getOrCreateCareerMission(user.id);
    return NextResponse.json({ mission: serializeCareerMission(mission) });
  } catch (error) {
    return apiError(error, 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getUser();
    const body = missionSchema.parse(await request.json());
    const mission = await updateCareerMission(user.id, body);
    return NextResponse.json({ mission: serializeCareerMission(mission) });
  } catch (error) {
    return apiError(error, 400);
  }
}

async function getUser() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user exists. Run seed first.");
  return user;
}
