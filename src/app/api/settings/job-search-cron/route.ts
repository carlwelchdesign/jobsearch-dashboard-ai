import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const scheduleSchema = z.object({
  enabled: z.boolean(),
  cronExpression: z.string().min(1).default("0 14 * * *"),
  profiles: z.array(
    z.object({
      id: z.string().min(1),
      scheduleEnabled: z.boolean(),
    }),
  ),
});

export async function PATCH(request: Request) {
  try {
    const body = scheduleSchema.parse(await request.json());
    const user = await prisma.user.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    if (!user) {
      return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });
    }

    const profileIds = body.profiles.map((profile) => profile.id);
    const ownedProfiles = await prisma.jobSearchProfile.findMany({
      where: { userId: user.id, id: { in: profileIds } },
      select: { id: true },
    });
    const ownedIds = new Set(ownedProfiles.map((profile) => profile.id));

    await prisma.$transaction(
      body.profiles
        .filter((profile) => ownedIds.has(profile.id))
        .map((profile) =>
          prisma.jobSearchProfile.update({
            where: { id: profile.id },
            data: {
              scheduleEnabled: body.enabled ? profile.scheduleEnabled : false,
              cronExpression: body.cronExpression,
            },
          }),
        ),
    );

    const profiles = await prisma.jobSearchProfile.findMany({
      where: { userId: user.id },
      orderBy: [{ enabled: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        enabled: true,
        scheduleEnabled: true,
        cronExpression: true,
      },
    });

    return NextResponse.json({
      enabled: profiles.some((profile) => profile.enabled && profile.scheduleEnabled),
      cronExpression: body.cronExpression,
      profiles,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
